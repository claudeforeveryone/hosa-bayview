import type { MovedFeedback } from "@/lib/feedback-moves";
import {
  FEEDBACK_FILTERS,
  FEEDBACK_STATUSES,
  FILTER_LABEL,
  feedbackCount,
  hasOlderPage,
  type FeedbackFilter,
  type FeedbackStatus,
} from "@/lib/owner-metrics";
import type { FeedbackQueue } from "@/lib/owner-types";
import { FeedbackList } from "./feedback-list";
import { Choices, Pager, Sheet } from "./primitives";

// The feedback queue from Settings > Send feedback. Question reports go to the event's trainer instead (Content
// lists the open ones).
export function FeedbackSection({
  base,
  filter,
  page,
  queue,
  extra,
  readOnly = false,
  moved,
}: {
  base: string;
  filter: FeedbackFilter;
  page: number;
  queue: FeedbackQueue;
  extra?: Record<string, string>;
  readOnly?: boolean;
  // Dev gallery only: notes for items already moved out of this filter.
  moved?: MovedFeedback[];
}) {
  const countFor = (f: FeedbackFilter) => feedbackCount(queue.counts, f);
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
      note="Sent from Settings. Set a status and priority as you go. Members never see your notes."
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
      <FeedbackList
        key={`${filter}:${page}`}
        rows={queue.rows}
        filter={filter}
        hrefs={
          Object.fromEntries(
            FEEDBACK_STATUSES.map((s) => [s, href(s)]),
          ) as Record<FeedbackStatus, string>
        }
        empty={
          filter === "open"
            ? "Nothing waiting. New feedback shows up here."
            : "Nothing with this status."
        }
        readOnly={readOnly}
        initialMoved={moved}
      />
      <Pager
        base={base}
        params={params}
        page={page}
        hasMore={hasOlderPage(page, countFor(filter))}
      />
    </Sheet>
  );
}
