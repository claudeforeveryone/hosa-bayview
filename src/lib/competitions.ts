// Mock competition helpers: state, ordering and the short lines shown on the BLC pages. Pure, so safe on client and server.
import { formatWhen } from "./when";

export type CompetitionState = "upcoming" | "open" | "closed";

// Mirrors private.room_state in migration 0053. No opening time means it's open already.
export function competitionState(
  opensAt: string | null,
  closesAt: string | null,
  now: number = Date.now(),
): CompetitionState {
  if (opensAt && now < Date.parse(opensAt)) return "upcoming";
  if (closesAt && now >= Date.parse(closesAt)) return "closed";
  return "open";
}

const STATE_LABEL: Record<CompetitionState, string> = {
  upcoming: "Upcoming",
  open: "Open now",
  closed: "Closed",
};

export function stateLabel(state: CompetitionState): string {
  return STATE_LABEL[state];
}

const STATE_RANK: Record<CompetitionState, number> = {
  open: 0,
  upcoming: 1,
  closed: 2,
};

// One list: open first, then upcoming (soonest first), then closed (latest first).
export function orderCompetitions<
  T extends { state: CompetitionState; opens_at: string | null },
>(rows: readonly T[]): T[] {
  const time = (r: T) => (r.opens_at ? Date.parse(r.opens_at) : Number.NaN);
  return [...rows].sort((a, b) => {
    const byState = STATE_RANK[a.state] - STATE_RANK[b.state];
    if (byState) return byState;
    const ta = time(a);
    const tb = time(b);
    // Nulls sink to the bottom of their group.
    if (Number.isNaN(ta) || Number.isNaN(tb))
      return Number.isNaN(ta) === Number.isNaN(tb)
        ? 0
        : Number.isNaN(ta)
          ? 1
          : -1;
    return a.state === "closed" || a.state === "open" ? tb - ta : ta - tb;
  });
}

// "Opens Wed Oct 14, 6:30 p.m. · Closes Wed Oct 14, 8:30 p.m."
export function windowLine(
  opensAt: string | null,
  closesAt: string | null,
): string {
  const parts: string[] = [];
  if (opensAt) parts.push(`Opens ${formatWhen(opensAt)}`);
  if (closesAt) parts.push(`Closes ${formatWhen(closesAt)}`);
  return parts.length ? parts.join(" · ") : "Open with no set times";
}

// Progress for the list row. Upcoming competitions don't show counts to members, so they get nothing.
export function progressLine(
  state: CompetitionState,
  done: number,
  total: number,
): string | null {
  if (state === "upcoming") return null;
  if (!total) return "No tests yet";
  if (state === "open") return `${done} of ${total} done`;
  return `${total} test${total === 1 ? "" : "s"}`;
}

export function percentOf(score: number, total: number): number | null {
  return total > 0 ? Math.round((score / total) * 100) : null;
}

// What your row says for one test on the detail page.
export function myTestStatus(opts: {
  state: CompetitionState;
  attempts: number;
  best: number | null;
  bestTotal: number | null;
}): string {
  if (opts.state === "upcoming") return "Not open yet";
  if (opts.state === "open")
    return opts.attempts > 0 ? "Submitted" : "Not started";
  if (opts.best === null || !opts.bestTotal) return "Not taken";
  const pct = percentOf(opts.best, opts.bestTotal);
  return `${opts.best}/${opts.bestTotal}${pct === null ? "" : ` · ${pct}%`}`;
}

// Results come back sorted by test title then place; this keeps each test's rows together, in that order.
export function groupByTest<T extends { test_id: string; test_title: string }>(
  rows: readonly T[],
): { testId: string; title: string; rows: T[] }[] {
  const groups = new Map<
    string,
    { testId: string; title: string; rows: T[] }
  >();
  for (const row of rows) {
    const g = groups.get(row.test_id) ?? {
      testId: row.test_id,
      title: row.test_title,
      rows: [],
    };
    g.rows.push(row);
    groups.set(row.test_id, g);
  }
  return [...groups.values()];
}
