"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BattleEnded } from "@/components/battle-ended";
import { Lobby } from "@/components/battle-lobby";
import type { Actions } from "@/components/battle-parts";
import { Question } from "@/components/battle-question";
import { Results } from "@/components/battle-results";
import { Reveal } from "@/components/battle-reveal";
import { createClient } from "@/lib/supabase/client";
import { feedback, primeFeedback } from "@/lib/feedback";
import {
  PING_MS,
  battlePhase,
  isHost,
  me as findMe,
  nudgeStep,
  parseBattleState,
  pollMs,
  type BattleState,
} from "@/lib/battle";

// A live battle. The server owns the game; this screen keeps a copy of battle_state fresh and calls the RPCs.
// Fresh comes from three places, any one of which is enough: the private realtime channel (one 'sync' broadcast
// per action, plus round changes), a poll (every 10 s while the channel is up, 3 s while it's down), and a
// re-read when the tab comes back. Reads asked for within 250 ms of each other run once. Each player's screen
// pings every 5 s so a round doesn't wait on someone who closed the tab, and nudges the game on
// (advance_battle with the round and step it saw) when its clock says a round or reveal is over. The server
// checks the time and ignores a step that has moved on, so a late call can't skip a reveal.

const DEBOUNCE_MS = 250;
const NUDGE_RETRY_MS = 2000;

// Server errors arrive as plain sentences without a full stop.
const sentence = (m: string) => (/[.!?]$/.test(m) ? m : `${m}.`);

export function BattleRoom({ initial }: { initial: BattleState }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const id = initial.id;
  const [s, setS] = useState(initial);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Your tap, shown at once while the answer is on its way.
  const [picked, setPicked] = useState<{
    round: number;
    choice: number;
  } | null>(null);

  // Server clock = client clock + offset, measured on every read (half the round trip).
  const [firstOffset] = useState(() => Date.parse(initial.now) - Date.now());
  const offset = useRef(firstOffset);
  const clock = useCallback(() => Date.now() + offset.current, []);
  const [now, setNow] = useState(() => Date.parse(initial.now));

  const phase = battlePhase(s);
  const mine = findMe(s);
  const host = isHost(s);
  const cur = s.current;
  const heading = useRef<HTMLHeadingElement>(null);

  // One read at a time; a request made during a read runs once it lands.
  const reading = useRef(false);
  const again = useRef(false);
  const refresh = useCallback(async () => {
    if (reading.current) {
      again.current = true;
      return;
    }
    reading.current = true;
    try {
      do {
        again.current = false;
        const sent = Date.now();
        const { data, error: e } = await supabase.rpc("battle_state", {
          bid: id,
        });
        if (e) {
          if (e.code === "42501") setGone(true);
          break;
        }
        const next = parseBattleState(data);
        if (next) {
          offset.current = Date.parse(next.now) - (sent + Date.now()) / 2;
          setS(next);
        }
      } while (again.current);
    } catch {
      // Offline for a moment; the next poll tries again.
    } finally {
      reading.current = false;
    }
  }, [supabase, id]);

  // Coalesce: a burst of broadcasts, polls and action replies becomes one read.
  const pending = useRef<number | null>(null);
  const schedule = useCallback(() => {
    if (pending.current !== null) return;
    pending.current = window.setTimeout(() => {
      pending.current = null;
      void refresh();
    }, DEBOUNCE_MS);
  }, [refresh]);
  useEffect(
    () => () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    },
    [],
  );

  // Realtime: one private channel per battle.
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      try {
        await supabase.realtime.setAuth();
      } catch {}
      if (cancelled) return;
      channel = supabase
        .channel(`battle:${id}`, { config: { private: true } })
        .on("broadcast", { event: "sync" }, schedule)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "battle_rounds",
            filter: `battle_id=eq.${id}`,
          },
          schedule,
        )
        .subscribe((status) => {
          // Joined or rejoined after a drop: catch up on anything missed.
          setConnected(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") schedule();
        });
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, id, schedule]);

  // Poll as a fallback, and re-read when the tab comes back. A finished or ended battle stops polling.
  const done = s.status === "done" || phase === "ended";
  useEffect(() => {
    if (done) return;
    const t = setInterval(schedule, pollMs(connected));
    const onShow = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [done, connected, schedule]);

  // Heartbeat while you're in the game and looking at it.
  const pinging = !done && Boolean(mine?.active);
  useEffect(() => {
    if (!pinging) return;
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.rpc("battle_ping", { bid: id }).then(
        () => {},
        () => {},
      );
    };
    const t = setInterval(ping, PING_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [pinging, supabase, id]);

  // The clock the screens read: four ticks a second is plenty for whole seconds.
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(clock()), 250);
    return () => clearInterval(t);
  }, [done, clock]);

  const call = useCallback(
    async (
      fn: string,
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; ok: boolean }> => {
      setError(null);
      const { data, error: e } = await supabase.rpc(fn, args);
      if (e) {
        // A double tap's second answer: the first one stands, nothing to say.
        if (e.code === "23505") {
          schedule();
          return { data: null, ok: true };
        }
        if (e.code === "42501" && fn !== "answer_battle")
          setError("You can't do that in this battle.");
        else setError(sentence(e.message));
        schedule();
        return { data: null, ok: false };
      }
      schedule();
      return { data, ok: true };
    },
    [supabase, schedule],
  );

  // Nudge the game on when this clock says the round (20 s plus the grace, or everyone's in) or the reveal (5 s)
  // is over. Retried every 2 s while the server disagrees (clock skew), never more often.
  const nudged = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  useEffect(() => {
    const step = nudgeStep(s, now);
    if (!step) return;
    const key = `${step.round}:${step.step}`;
    if (nudged.current.key === key && now - nudged.current.at < NUDGE_RETRY_MS)
      return;
    nudged.current = { key, at: now };
    void supabase
      .rpc("advance_battle", {
        bid: id,
        p_round: step.round,
        p_step: step.step,
      })
      .then(schedule, schedule);
  }, [now, s, supabase, id, schedule]);

  // Sound and buzz when a round you answered is revealed, and when your side wins. Not on a reload.
  const heard = useRef(phase === "reveal" ? (cur?.no ?? 0) : 0);
  const cheered = useRef(phase === "results");
  useEffect(() => {
    if (phase === "reveal" && cur && heard.current !== cur.no) {
      heard.current = cur.no;
      if (cur.my_choice !== null)
        feedback(cur.my_choice === cur.correct_index ? "correct" : "wrong");
    }
    if (phase === "results" && !cheered.current) {
      cheered.current = true;
      if (mine && s.winner === mine.team) feedback("win");
    }
  }, [phase, cur, mine, s.winner]);

  // Each new screen takes focus at its heading, so a screen reader starts at the top.
  const screen = `${phase}:${cur?.no ?? 0}`;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [screen]);

  const run = useCallback(
    async (fn: string, args: Record<string, unknown> = {}) => {
      setBusy(true);
      const r = await call(fn, { bid: id, ...args });
      setBusy(false);
      return r;
    },
    [call, id],
  );

  const choice =
    cur?.my_choice ??
    (picked && cur && picked.round === cur.no ? picked.choice : null);
  const timeUp = Boolean(cur?.ends_at && now >= Date.parse(cur.ends_at));

  const act: Actions = {
    answer: (i) => {
      if (!cur || choice !== null || timeUp) return;
      // The verdict sound comes after the reveal; wake audio now, inside the tap.
      primeFeedback();
      setPicked({ round: cur.no, choice: i });
      void call("answer_battle", {
        bid: id,
        p_round: cur.no,
        p_choice: i,
      }).then((r) => {
        if (!r.ok) setPicked(null);
      });
    },
    start: () => void run("start_battle"),
    switchTeam: () =>
      void run("pick_battle_team", { p_team: mine?.team === 1 ? 2 : 1 }),
    join: () => void run("join_battle"),
    leave: () =>
      void run("leave_battle").then((r) => {
        if (r.ok) router.push(`/c/${s.classroom_id}`);
      }),
    // The host's Next: the only way to cut a reveal short.
    next: () =>
      void run("advance_battle", { p_round: cur?.no ?? 0, p_step: "reveal" }),
    again: () => {
      setBusy(true);
      void call("rematch_battle", { bid: id }).then((r) => {
        if (r.ok && typeof r.data === "string")
          router.push(`/battle/${r.data}`);
        else setBusy(false);
      });
    },
  };

  // Keys A-E or 1-5 answer, for laptops.
  useEffect(() => {
    if (phase !== "question") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      const k = e.key.toUpperCase();
      const i = "ABCDE".includes(k)
        ? "ABCDE".indexOf(k)
        : "12345".includes(k)
          ? "12345".indexOf(k)
          : -1;
      if (i >= 0 && cur && i < cur.options.length) act.answer(i);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (gone) {
    return (
      <BattleEnded
        title="This battle is closed to you"
        href="/events"
        label="Back to events"
      />
    );
  }
  if (phase === "ended") {
    return (
      <div className="mx-auto grid w-full max-w-2xl gap-6">
        <BattleEnded
          title="This battle ended"
          href={`/c/${s.classroom_id}`}
          label={`Back to ${s.classroom_name ?? "the event"}`}
          heading={heading}
        />
      </div>
    );
  }

  const common = { s, mine, host, busy, error, act, heading };
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      {phase === "lobby" ? <Lobby {...common} /> : null}
      {phase === "question" ? (
        <Question
          {...common}
          choice={choice}
          clock={clock}
          now={now}
          timeUp={timeUp}
        />
      ) : null}
      {phase === "reveal" ? (
        <Reveal {...common} clock={clock} now={now} />
      ) : null}
      {phase === "results" ? <Results {...common} /> : null}
    </div>
  );
}
