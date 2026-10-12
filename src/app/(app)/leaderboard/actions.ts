"use server";

import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { PERIODS, type BoardRow } from "@/lib/activity";
import { getBoard } from "@/lib/activity-data";

const input = z.object({
  period: z.enum(PERIODS),
  classroomId: z.string().uuid().nullable(),
});

// A board for another period, fetched in place so switching periods never reloads the page (a reload swapped
// in the loading screen and dropped the reader back at the top). Same database call as the page itself.
export async function loadBoard(
  period: string,
  classroomId: string | null,
): Promise<{ rows: BoardRow[] } | { error: string }> {
  const parsed = input.safeParse({ period, classroomId });
  if (!parsed.success) return { error: "Couldn't load that board." };
  await requireProfile();
  try {
    return { rows: await getBoard(parsed.data.period, parsed.data.classroomId) };
  } catch (e) {
    console.error("[board:load]", e instanceof Error ? e.message : e);
    return { error: "Couldn't load that board. Try again." };
  }
}
