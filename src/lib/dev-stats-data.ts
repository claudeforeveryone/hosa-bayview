import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Period } from "@/lib/activity";
import type { DevStatsRow } from "@/lib/dev-stats";
import type { Loaded } from "@/lib/owner-data";
import { isStatsViewer } from "@/lib/owner-metrics";

// Server reads for the developer stats page (migration 0105). The database decides who may see them: the
// viewer check is private.stats_viewers, and anyone else gets 42501. Until 0105 is applied the RPCs don't exist.

// PostgREST says PGRST202 for a function it doesn't know; Postgres says 42883.
const missing = (code: string | undefined) =>
  code === "PGRST202" || code === "42883";

type RawRow = Omit<
  DevStatsRow,
  | "banned"
  | "seen_today"
  | "seen_week"
  | "minutes_all"
  | "minutes_7d"
  | "minutes_today"
  | "minutes_period"
  | "clicks_all"
  | "clicks_7d"
  | "clicks_today"
  | "clicks_period"
  | "answered"
  | "correct"
  | "attempts"
  | "finished"
  | "reviews"
  | "battle_wins"
  | "classrooms"
  | "elo"
  | "elo_gain"
> & {
  banned: boolean | null;
  seen_today: boolean | null;
  seen_week: boolean | null;
  minutes_all: number | string;
  minutes_7d: number | string;
  minutes_today: number | string;
  minutes_period: number | string;
  clicks_all: number | string;
  clicks_7d: number | string;
  clicks_today: number | string;
  clicks_period: number | string;
  answered: number | string;
  correct: number | string;
  attempts: number | string;
  finished: number | string;
  reviews: number | string;
  battle_wins: number | string;
  classrooms: number | string;
  elo: number | string;
  elo_gain: number | string;
};

// Whether the signed-in account may open the stats. Any failure reads as no.
// Deliberately no try/catch around createClient: Next's dynamic-rendering signal must not be swallowed.
// Cached for the request, so the layout (nav link) and /developer (its gate) ask the database once between them.
export const canSeeDevStats = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_see_dev_stats");
  if (error) {
    if (!missing(error.code))
      console.error(`Dev stats check failed: ${error.message}`);
    return false;
  }
  return isStatsViewer(data);
});

// The Members tab's rows, in the same three-way answer as the owner_* reads (owner-data.ts): "denied" (42501, the
// viewer row went away) is the not-found page; "missing" (0105 not on this database) and "failed" (a timeout, a
// 5xx, anything else) keep the console and show a note.
export async function getDevStats(
  period: Period,
): Promise<Loaded<DevStatsRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dev_member_stats", { period });
  if (error) {
    if (error.code === "42501") return { ok: false, reason: "denied" };
    if (missing(error.code)) return { ok: false, reason: "missing" };
    console.error(`Dev stats lookup failed: ${error.message}`);
    return { ok: false, reason: "failed" };
  }
  return {
    ok: true,
    data: ((data ?? []) as RawRow[]).map((r) => ({
      ...r,
      banned: r.banned === true,
      seen_today: r.seen_today === true,
      seen_week: r.seen_week === true,
      minutes_all: Number(r.minutes_all),
      minutes_7d: Number(r.minutes_7d),
      minutes_today: Number(r.minutes_today),
      minutes_period: Number(r.minutes_period),
      clicks_all: Number(r.clicks_all),
      clicks_7d: Number(r.clicks_7d),
      clicks_today: Number(r.clicks_today),
      clicks_period: Number(r.clicks_period),
      answered: Number(r.answered),
      correct: Number(r.correct),
      attempts: Number(r.attempts),
      finished: Number(r.finished),
      reviews: Number(r.reviews),
      battle_wins: Number(r.battle_wins),
      classrooms: Number(r.classrooms),
      elo: Number(r.elo),
      elo_gain: Number(r.elo_gain),
    })),
  };
}
