"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Lobby,
  Question,
  Results,
  Reveal,
  type Actions,
} from "@/components/battle-screens";
import { createClient } from "@/lib/supabase/client";
import { feedback, primeFeedback } from "@/lib/feedback";
import {
  REVEAL_MS,
  battlePhase,
  isHost,
  me as findMe,
  parseBattleState,
  type BattleState,
} from "@/lib/battle";

// A live battle. The server owns the game; this screen keeps a copy of battle_state fresh and calls the RPCs.
// Fresh comes from three places, any one of which is enough: the private realtime channel (a 'sync' broadcast
// and round changes), a poll every few seconds, and a re-read when the tab comes back. Every player's screen
// nudges the game on (advance_battle) when its clock says a round or reveal is over; the server checks the time.

const POLL_MS = 3000;

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

  // Realtime: one private channel per battle.
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
        .on("broadcast", { event: "sync" }, () => void refresh())
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "battle_rounds",
            filter: `battle_id=eq.${id}`,
          },
          () => void refresh(),
        )
        .subscribe((status) => {
          // Joined or rejoined after a drop: catch up on anything missed.
          if (status === "SUBSCRIBED") void refresh();
        });
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, id, refresh]);

  // Poll as a fallback, and re-read when the tab comes back.
  const done = s.status === "done";
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => void refresh(), POLL_MS);
    const onShow = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [done, refresh]);

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
          void refresh();
          return { data: null, ok: true };
        }
        if (e.code === "42501" && fn !== "answer_battle")
          setError("You can't do that in this battle.");
        else setError(sentence(e.message));
        void refresh();
        return { data: null, ok: false };
      }
      void refresh();
      return { data, ok: true };
    },
    [supabase, refresh],
  );

  // Nudge the game on when this clock says the round (20 s) or the reveal (5 s) is over. Retried every 2 s while
  // the server disagrees (clock skew), never more often.
  const nudged = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  useEffect(() => {
    if (s.status !== "playing" || !cur || !mine) return;
    const due = cur.closed_at
      ? Date.parse(cur.closed_at) + REVEAL_MS
      : Date.parse(cur.ends_at ?? s.now);
    const key = `${cur.no}:${cur.closed_at ? "reveal" : "question"}`;
    if (now < due + 250) return;
    if (nudged.current.key === key && now - nudged.current.at < 2000) return;
    nudged.current = { key, at: now };
    void supabase.rpc("advance_battle", { bid: id }).then(
      () => refresh(),
      () => refresh(),
    );
  }, [now, s.status, s.now, cur, mine, supabase, id, refresh]);

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
    next: () => void run("advance_battle"),
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
      <div className="grid justify-items-start gap-4 border-y border-dashed border-rule-strong px-1 py-8 sm:px-3">
        <p className="font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-semibold uppercase">
          This battle is closed to you
        </p>
        <Link
          href="/events"
          className="caps step inline-flex h-12 items-center border border-ink px-5 text-[17px] hover:bg-band"
        >
          Back to events
        </Link>
      </div>
    );
  }

  const common = { s, mine, host, busy, error, act, heading };
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      {phase === "lobby" ? <Lobby {...common} /> : null}
      {phase === "question" ? (
        <Question {...common} choice={choice} clock={clock} now={now} timeUp={timeUp} />
      ) : null}
      {phase === "reveal" ? <Reveal {...common} clock={clock} now={now} /> : null}
      {phase === "results" ? <Results {...common} /> : null}
    </div>
  );
}
