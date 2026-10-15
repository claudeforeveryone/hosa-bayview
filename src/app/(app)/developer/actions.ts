"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  FEEDBACK_MAX,
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  UUID,
} from "@/lib/owner-metrics";

export type TriageResult = { error?: string; ok?: true };

// Owner triage: status, priority and a resolution note. owner_triage_feedback checks the viewer itself (42501 for
// anyone else) and writes the admin_log row; these checks only give a clear message before the round trip.
export async function triageFeedback(
  id: string,
  status: string,
  priority: string,
  resolution: string,
): Promise<TriageResult> {
  if (!UUID.test(id)) return { error: "That feedback is gone." };
  if (!(FEEDBACK_STATUSES as readonly string[]).includes(status))
    return { error: "Pick a status from the list." };
  if (!(FEEDBACK_PRIORITIES as readonly string[]).includes(priority))
    return { error: "Pick a priority from the list." };
  const clean = resolution.replace(/\r\n?/g, "\n").trim();
  if (clean.length > FEEDBACK_MAX)
    return { error: "Keep the note under 1,000 characters." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("owner_triage_feedback", {
    p_id: id,
    p_status: status,
    p_priority: priority,
    p_resolution: clean,
  });
  if (error) {
    if (error.code === "42501")
      return { error: "Only accounts on the stats list can change this." };
    if (error.code === "P0002") return { error: "That feedback is gone." };
    if (error.code === "22023") return { error: `${error.message}.` };
    console.error(`Owner triage failed: ${error.message}`);
    return { error: "That didn't save. Try again." };
  }
  refresh();
  return { ok: true };
}

export type EloResult = { error?: string; ok?: string };

// Developers set a member's Elo (0292). dev_set_elo checks the viewer itself (stats viewers only, 42501 for anyone
// else, executives included), adds the difference to the ledger and logs it; these checks only give a clear message
// before the round trip.
export async function setElo(userId: string, elo: number): Promise<EloResult> {
  if (!UUID.test(userId)) return { error: "Pick a member from the list." };
  if (!Number.isInteger(elo) || elo < 0 || elo > 1_000_000)
    return { error: "Pick a whole number from 0 to 1,000,000." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dev_set_elo", {
    p_user: userId,
    p_elo: elo,
  });
  if (error) {
    if (error.code === "42501") return { error: "Only developers can change Elo." };
    if (error.code === "P0002") return { error: "That person is gone. Reload the page." };
    if (error.code === "22023") return { error: `${error.message}.` };
    if (error.code === "PGRST202")
      return { error: "This needs the latest database update (0292)." };
    console.error(`Set Elo failed: ${error.message}`);
    return { error: "That didn't save. Try again." };
  }
  refresh();
  return { ok: `Elo is now ${Number(data ?? elo).toLocaleString("en-CA")}.` };
}
