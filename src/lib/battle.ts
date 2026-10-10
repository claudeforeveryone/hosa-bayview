import { z } from "zod";

// Battles (Task 18): pure rules and shapes shared by the battle screens. The server (0096) owns every rule
// that counts; these mirror it for display only.

export const ROUND_MS = 20_000;
export const REVEAL_MS = 5_000;
// Answers sent in the last 1.5 s still count (they score 100, no speed bonus); mirrors private.battle_grace.
export const GRACE_MS = 1_500;
// A player not heard from in 15 s is away and doesn't hold up a round. Each screen pings every 5 s.
export const AWAY_MS = 15_000;
export const PING_MS = 5_000;
// Asks the server a little after its clock should agree, to allow for skew.
const NUDGE_SLACK_MS = 250;
export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 30;
export const DEFAULT_QUESTIONS = 10;
export const QUESTION_COUNTS = [5, 10, 15, 20, 30] as const;

export const FORMATS = ["1v1", "2v2", "3v3", "teams"] as const;
export type BattleFormat = (typeof FORMATS)[number];

export const formatLabel = (f: BattleFormat) => (f === "teams" ? "Teams" : f);

// Most players per team (mirrors private.battle_team_cap).
export const teamCap = (f: BattleFormat) =>
  f === "1v1" ? 1 : f === "2v2" ? 2 : f === "3v3" ? 3 : 20;

// 100 for a right answer plus up to 50 for speed, linear in the time left. Mirrors private.battle_points.
export function battlePoints(correct: boolean, msLeft: number): number {
  if (!correct) return 0;
  const left = Math.min(Math.max(msLeft, 0), ROUND_MS);
  return 100 + Math.round((50 * left) / ROUND_MS);
}

// Codes use the join-code alphabet: no 0, O, 1, I or L.
const CODE = /^[A-HJKMNP-Z2-9]{4}$/;
export function normalizeBattleCode(input: string): string | null {
  const c = input.replace(/\s/g, "").toUpperCase();
  return CODE.test(c) ? c : null;
}

const player = z.object({
  user_id: z.string(),
  name: z.string(),
  team: z.union([z.literal(1), z.literal(2)]),
  active: z.boolean(),
  points: z.number(),
  correct: z.number(),
  answered: z.number(),
  in_round: z.boolean(),
  seen: z.boolean(),
});
export type BattlePlayer = z.infer<typeof player>;

const result = z.object({
  user_id: z.string(),
  choice: z.number(),
  points: z.number(),
  is_correct: z.boolean().nullable(),
});

const round = z.object({
  no: z.number(),
  prompt: z.string(),
  options: z.array(z.string()),
  started_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  answered: z.number(),
  my_choice: z.number().nullable(),
  correct_index: z.number().nullable(),
  results: z.array(result).nullable(),
});
export type BattleRound = z.infer<typeof round>;

const state = z.object({
  id: z.string(),
  code: z.string(),
  format: z.enum(FORMATS),
  status: z.enum(["lobby", "playing", "done"]),
  stale: z.boolean(),
  round: z.number(),
  total: z.number(),
  host_id: z.string().nullable(),
  me: z.string(),
  classroom_id: z.string(),
  classroom_name: z.string().nullable(),
  source_title: z.string().nullable(),
  winner: z.union([z.literal(1), z.literal(2)]).nullable(),
  rematch_id: z.string().nullable(),
  now: z.string(),
  players: z.array(player),
  teams: z.tuple([z.number(), z.number()]),
  current: round.nullable(),
});
export type BattleState = z.infer<typeof state>;

export function parseBattleState(raw: unknown): BattleState | null {
  const r = state.safeParse(raw);
  return r.success ? r.data : null;
}

export type Phase = "lobby" | "question" | "reveal" | "results" | "ended";

// Which screen to show. A round past its 20 s mark reads as closed only once the server says so. A battle
// nobody touched for 30 minutes is over even before the sweep marks it done, and so is a lobby that closed
// without starting (everyone left, or the host opened another).
export function battlePhase(s: BattleState): Phase {
  if (s.stale || (s.status === "done" && s.round === 0)) return "ended";
  if (s.status === "lobby") return "lobby";
  if (s.status === "done") return "results";
  return s.current?.closed_at ? "reveal" : "question";
}

// What this screen should ask advance_battle for, if anything, at server time `now`. The server re-checks
// everything and ignores a step for a round or phase that has moved on, so a late call can't skip a reveal.
// 'question' closes a round once the 20 s and the grace are up, or once every player still here has answered.
// 'reveal' moves on once the reveal has been up its full 5 s (only the host's Next can cut it short).
export function nudgeStep(
  s: BattleState,
  now: number,
): { round: number; step: "question" | "reveal" } | null {
  const cur = s.current;
  if (s.status !== "playing" || s.stale || !cur) return null;
  const mine = s.players.find((p) => p.user_id === s.me);
  if (!mine?.active) return null;
  if (cur.closed_at) {
    return now >= Date.parse(cur.closed_at) + REVEAL_MS + NUDGE_SLACK_MS
      ? { round: cur.no, step: "reveal" }
      : null;
  }
  const over =
    cur.ends_at !== null &&
    now >= Date.parse(cur.ends_at) + GRACE_MS + NUDGE_SLACK_MS;
  const allIn = s.players
    .filter((p) => p.active && p.seen)
    .every((p) => p.in_round);
  return over || allIn ? { round: cur.no, step: "question" } : null;
}

// Realtime does the work while the channel is up; the poll is only a safety net then.
export const pollMs = (connected: boolean) => (connected ? 10_000 : 3_000);

export const me = (s: BattleState) =>
  s.players.find((p) => p.user_id === s.me) ?? null;
export const isHost = (s: BattleState) => s.host_id === s.me;

export function teamPlayers(s: BattleState, team: 1 | 2): BattlePlayer[] {
  return s.players.filter((p) => p.team === team);
}

// Whether the host can start, and if not, what's missing (mirrors start_battle).
export function startCheck(
  s: BattleState,
): { ok: true } | { ok: false; reason: string } {
  const cap = teamCap(s.format);
  const live = s.players.filter((p) => p.active);
  const one = live.filter((p) => p.team === 1).length;
  const two = live.filter((p) => p.team === 2).length;
  if (s.format === "teams") {
    return one >= 1 && two >= 1
      ? { ok: true }
      : { ok: false, reason: "Needs a player on each team" };
  }
  return one === cap && two === cap
    ? { ok: true }
    : { ok: false, reason: `Needs ${cap} on each team` };
}

// Best scorer; ties go to more right answers, then name, so every screen agrees.
export function topPlayer(players: BattlePlayer[]): BattlePlayer | null {
  const sorted = [...players].sort(
    (a, b) =>
      b.points - a.points ||
      b.correct - a.correct ||
      a.name.localeCompare(b.name),
  );
  return sorted[0] && sorted[0].points > 0 ? sorted[0] : null;
}

// Right answers out of the questions played, as a whole percent.
export function accuracy(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

// Points each team scored in the round just shown.
export function roundTeamPoints(s: BattleState): [number, number] {
  const out: [number, number] = [0, 0];
  for (const r of s.current?.results ?? []) {
    const p = s.players.find((x) => x.user_id === r.user_id);
    if (p) out[p.team - 1] += r.points;
  }
  return out;
}

export const teamName = (team: 1 | 2) => `Team ${team === 1 ? "A" : "B"}`;

// Milliseconds left in the round on the server's clock, given the client's offset from it.
export function msLeft(endsAt: string | null, serverNow: number): number {
  if (!endsAt) return 0;
  return Math.max(0, Date.parse(endsAt) - serverNow);
}
