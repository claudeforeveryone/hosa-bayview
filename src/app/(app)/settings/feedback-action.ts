"use server";

import { requireProfile } from "@/lib/auth";
import { deploymentFrom } from "@/lib/deployment";
import { checkFeedback } from "@/lib/owner-metrics";
import { createClient } from "@/lib/supabase/server";

export type FeedbackResult = { error?: string; ok?: string };

// Settings > Send feedback (0231). send_feedback checks the member, the words and the daily limit again; its
// messages are our own RAISE texts, so they can be shown as they are. The build is read here on the server from
// Vercel's variables, never taken from the browser.
export async function sendFeedback(
  category: string,
  body: string,
): Promise<FeedbackResult> {
  await requireProfile();
  const clean = body.replace(/\r\n?/g, "\n").trim();
  const problem = checkFeedback(category, clean);
  if (problem) return { error: problem };
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_feedback", {
    p_category: category,
    p_body: clean,
    p_build: deploymentFrom(process.env).commit,
  });
  if (error) {
    if (error.code === "22023" || error.code === "53400")
      return { error: `${error.message}.` };
    if (error.code === "42501")
      return { error: "Your account can't send feedback right now." };
    if (error.code === "PGRST202" || error.code === "42883")
      return { error: "Feedback isn't switched on yet. Try again soon." };
    console.error(`Feedback did not save: ${error.message}`);
    return { error: "That didn't send. Try again." };
  }
  return { ok: "Sent. Thanks for telling us." };
}
