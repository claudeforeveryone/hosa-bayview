import { createClient } from "@/lib/supabase/client";
import { LUCKY_EVENT, type LuckyReason, parseRollResult } from "@/lib/lucky";

// Asks the server for a lucky roll. If it paid, the overlay hears about it through a window event.
// The server allows one roll per reason per Toronto day, so calling this again is harmless.
// Never throws: a missed roll is just no bonus.
export async function rollLuckyBonus(reason: LuckyReason): Promise<void> {
  try {
    const { data, error } = await createClient().rpc("roll_lucky_bonus", {
      p_reason: reason,
    });
    if (error) return;
    const amount = parseRollResult(data);
    if (amount === null) return;
    window.dispatchEvent(
      new CustomEvent(LUCKY_EVENT, { detail: { amount, reason } }),
    );
  } catch {
    // Bonuses are a treat, not a requirement.
  }
}
