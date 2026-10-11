// Triage that moves feedback out of the filter on screen (Done or Won't fix under Open, say) drops the item from
// the refreshed list. The console keeps a one-line note in its place until the owner leaves the page, so they keep
// their place in the queue and the keyboard focus has somewhere to land. Pure, so the placement is testable.
import {
  inFeedbackFilter,
  type FeedbackCategory,
  type FeedbackFilter,
  type FeedbackStatus,
} from "./owner-metrics";

export type MovedFeedback = {
  id: string;
  // The entry above it on screen when it moved (null: it was first), and its position then, for when that entry
  // has left the list too.
  after: string | null;
  index: number;
  status: FeedbackStatus;
  category: FeedbackCategory;
  sent_by: string;
};

export type FeedbackEntry<R> =
  | { kind: "row"; id: string; row: R }
  | { kind: "moved"; id: string; moved: MovedFeedback };

// The server's rows with a note where each moved item was, in the order the items moved. An item the refreshed
// list still has (the refresh hasn't landed yet) shows as its row.
export function placeMoved<R extends { id: string }>(
  rows: R[],
  moved: MovedFeedback[],
): FeedbackEntry<R>[] {
  const out: FeedbackEntry<R>[] = rows.map((row) => ({
    kind: "row",
    id: row.id,
    row,
  }));
  const listed = new Set(rows.map((r) => r.id));
  for (const m of moved) {
    if (listed.has(m.id)) continue;
    const above =
      m.after === null ? -1 : out.findIndex((e) => e.id === m.after);
    const at =
      m.after === null
        ? 0
        : above >= 0
          ? above + 1
          : Math.min(m.index, out.length);
    out.splice(at, 0, { kind: "moved", id: m.id, moved: m });
  }
  return out;
}

// The note a save leaves, or null when the new status stays under the filter (the row stays and says "Saved.").
// `entries` is the list as it was on screen when Save was pressed, notes included.
export function noteAfterSave(
  entries: { id: string }[],
  item: { id: string; category: FeedbackCategory; sent_by: string },
  status: FeedbackStatus,
  filter: FeedbackFilter,
): MovedFeedback | null {
  if (inFeedbackFilter(status, filter)) return null;
  const index = entries.findIndex((e) => e.id === item.id);
  return {
    id: item.id,
    after: index > 0 ? entries[index - 1].id : null,
    index: Math.max(0, index),
    status,
    category: item.category,
    sent_by: item.sent_by,
  };
}
