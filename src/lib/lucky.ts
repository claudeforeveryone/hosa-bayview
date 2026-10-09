// Pure helpers for lucky bonuses. The server rolls and pays (migration 0036); this file names, checks and times them.

export const LUCKY_REASONS = ["visit", "test", "flashcards"] as const;
export type LuckyReason = (typeof LUCKY_REASONS)[number];

export const LUCKY_LABEL: Record<LuckyReason, string> = {
  visit: "Visit",
  test: "Test",
  flashcards: "Flashcards",
};

// Amounts of this size or more are the jackpot. Regular bonuses stop at 25.
export const JACKPOT = 50;

// Window event that carries a paid bonus from the roller to the overlay.
export const LUCKY_EVENT = "hosa:lucky-bonus";

const SHOW_MS = 3200;
const JACKPOT_SHOW_MS = 5000;

export const isLuckyReason = (value: unknown): value is LuckyReason =>
  typeof value === "string" &&
  (LUCKY_REASONS as readonly string[]).includes(value);

export const isJackpot = (amount: number) => amount >= JACKPOT;

// How long the banner stays up before it clears itself. Tapping clears it sooner.
export const luckyDuration = (amount: number) =>
  isJackpot(amount) ? JACKPOT_SHOW_MS : SHOW_MS;

// Burst size: more pieces for the jackpot.
export const particleCount = (amount: number) => (isJackpot(amount) ? 24 : 12);

// The RPC returns the amount paid: a whole number from 5 to 50, or 0 for no bonus. Anything else is no bonus.
export function parseRollResult(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n)) return null;
  if (n < 1 || n > JACKPOT) return null;
  return n;
}

// A bonus event detail, checked before it reaches the overlay.
export function parseLuckyEvent(
  detail: unknown,
): { amount: number; reason: LuckyReason } | null {
  if (typeof detail !== "object" || detail === null) return null;
  const { amount, reason } = detail as { amount?: unknown; reason?: unknown };
  const paid = parseRollResult(amount);
  if (paid === null || !isLuckyReason(reason)) return null;
  return { amount: paid, reason };
}

// The line on a profile: "+12 Visit · +50 Test". Unknown reasons show as they are.
export function formatBonusLine(
  rows: { amount: number; reason: string }[],
): string {
  return rows
    .map((r) => {
      const label = isLuckyReason(r.reason) ? LUCKY_LABEL[r.reason] : r.reason;
      return `+${Math.round(r.amount)} ${label}`;
    })
    .join(" · ");
}
