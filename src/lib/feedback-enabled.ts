import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Send feedback (Settings, More) and Report this question (practice and review) need migration 0231. Until it is on
// the database, feedback_enabled() doesn't exist (PGRST202) and both entry points stay hidden, the way battles hide
// while their RPCs are missing (src/lib/battles.ts), instead of offering buttons that fail on send. Ask teacher is
// older than 0231 and always shows.
// A migration is never taken back, so once the answer is yes this server process stops asking.
let applied = false;

// PostgREST says PGRST202 for a function it doesn't know; Postgres says 42883.
const missing = (code: string | undefined) =>
  code === "PGRST202" || code === "42883";

export const feedbackEnabled = cache(async (): Promise<boolean> => {
  if (applied) return true;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("feedback_enabled");
  if (error) {
    if (!missing(error.code))
      console.error(`Feedback check failed: ${error.message}`);
    return false;
  }
  applied = data === true;
  return applied;
});
