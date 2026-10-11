import {
  FEEDBACK_FILTERS,
  FILTER_LABEL,
  PAGE_SIZE,
  type FeedbackFilter,
} from "@/lib/owner-metrics";
import type { FeedbackQueue } from "@/lib/owner-types";
import { FeedbackTriage } from "./feedback-triage";
import { Choices, Notice, Pager, Sheet } from "./primitives";

// The feedback queue from Settings > Send feedback. Question reports go to the event's trainer instead (Content
// lists the open ones).
export function FeedbackSection({
  base,
  filter,
  page,
  queue,
  extra,
  readOnly = false,
}: {
  base: string;
  filter: FeedbackFilter;
  page: number;
  queue: FeedbackQueue;
  extra?: Record<string, string>;
  readOnly?: boolean;
}) {
  const { counts } = queue;
  const countFor = (f: FeedbackFilter) =>
    f === "open"
      ? counts.new + counts.planned
      : f === "all"
        ? counts.new + counts.planned + counts.done + counts.wont_fix
        : counts[f];
  const href = (f: FeedbackFilter) => {
    const search = new URLSearchParams({ ...extra, tab: "feedback" });
    if (f !== "open") search.set("status", f);
    return `${base}?${search.toString()}`;
  };
  const params: Record<string, string> = { ...extra, tab: "feedback" };
  if (filter !== "open") params.status = filter;

  return (
    <Sheet
      id="feedback-h"
      title="Feedback"
      note="Sent from Settings. Set a status and priority as you go; your notes stay with you."
    >
      <Choices
        label="Status"
        items={FEEDBACK_FILTERS.map((f) => ({
          href: href(f),
          text: FILTER_LABEL[f],
          current: f === filter,
          count: countFor(f),
        }))}
      />
      {queue.rows.length === 0 ? (
        <Notice>
          {filter === "open"
            ? "Nothing waiting. New feedback shows up here."
            : "Nothing with this status."}
        </Notice>
      ) : (
        <ul className="border-t-[3px] border-ink">
          {queue.rows.map((row) => (
            <FeedbackTriage key={row.id} row={row} readOnly={readOnly} />
          ))}
        </ul>
      )}
      <Pager
        base={base}
        params={params}
        page={page}
        hasMore={queue.rows.length === PAGE_SIZE}
      />
    </Sheet>
  );
}
