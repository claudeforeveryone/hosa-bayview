// Match times and personal-best wording. The server decides whether a match counts (record_match);
// these helpers only turn its answer into text.

// A standard round is 10 cards, or the whole deck when it has fewer. Mirrors record_match (migration 0038).
export const STANDARD_ROUND = 10;

export function standardRound(cardCount: number): number {
  return Math.min(STANDARD_ROUND, cardCount);
}

// Under a minute: 12.3 s. A minute or more: 1:05.3. Tenths are rounded, so 59.96 s reads as 1:00.0.
export function formatMatchTime(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 100));
  if (tenths < 600) return `${(tenths / 10).toFixed(1)} s`;
  const minutes = Math.floor(tenths / 600);
  const rest = tenths - minutes * 600;
  const seconds = String(Math.floor(rest / 10)).padStart(2, "0");
  return `${minutes}:${seconds}.${rest % 10}`;
}

export type MatchOutcome = {
  isFullDeck: boolean;
  isNewBest: boolean;
  // Best standard-round time before this match, or null when there was none.
  previousBestMs: number | null;
};

// One line under the finish time. A new best wins; otherwise the best so far; a short round with no best says so.
export function matchNote(outcome: MatchOutcome): string {
  if (outcome.isNewBest) return "New best";
  if (outcome.previousBestMs !== null) return `Best ${formatMatchTime(outcome.previousBestMs)}`;
  return "Not a full round, so not counted";
}

// The server rule, mirrored so the same rule can be tested without a database: a full-deck match
// beats the previous best only when it is strictly faster, and the first full-deck match is always a new best.
export function beatsBest(previousBestMs: number | null, timeMs: number, isFullDeck: boolean): boolean {
  return isFullDeck && (previousBestMs === null || timeMs < previousBestMs);
}
