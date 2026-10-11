"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  noteAfterSave,
  placeMoved,
  type MovedFeedback,
} from "@/lib/feedback-moves";
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  type FeedbackFilter,
  type FeedbackStatus,
} from "@/lib/owner-metrics";
import type { FeedbackRow } from "@/lib/owner-types";
import { FeedbackTriage } from "./feedback-triage";
import { Notice } from "./primitives";

// The queue under one filter. Saving a status that leaves the filter (Done under Open, say) refreshes the page
// without that row, so its place keeps a one-line note ("Bug from ... moved to Done.") until the owner leaves the
// page, and the keyboard focus moves onto the note instead of falling back to the top of the page. The parent keys
// this by filter and page, so a new filter starts clean. `initialMoved` is for the dev gallery only.
export function FeedbackList({
  rows,
  filter,
  hrefs,
  empty,
  readOnly = false,
  initialMoved = [],
}: {
  rows: FeedbackRow[];
  filter: FeedbackFilter;
  hrefs: Record<FeedbackStatus, string>;
  empty: string;
  readOnly?: boolean;
  initialMoved?: MovedFeedback[];
}) {
  const [moved, setMoved] = useState<MovedFeedback[]>(initialMoved);
  const entries = placeMoved(rows, moved);

  if (entries.length === 0) return <Notice>{empty}</Notice>;

  const saved = (row: FeedbackRow, status: FeedbackStatus) => {
    const note = noteAfterSave(entries, row, status, filter);
    if (note) setMoved((m) => [...m.filter((x) => x.id !== row.id), note]);
  };

  return (
    <ul className="border-t-[3px] border-ink">
      {entries.map((e) =>
        e.kind === "row" ? (
          <FeedbackTriage
            key={e.id}
            row={e.row}
            readOnly={readOnly}
            onSaved={(status) => saved(e.row, status)}
          />
        ) : (
          <MovedNote key={e.id} moved={e.moved} href={hrefs[e.moved.status]} />
        ),
      )}
    </ul>
  );
}

function MovedNote({ moved, href }: { moved: MovedFeedback; href: string }) {
  const self = useRef<HTMLLIElement>(null);
  // The row it replaces held the focus (its Save button); put it here, where the owner's place in the queue is.
  useEffect(() => {
    self.current?.focus();
  }, []);
  const status = STATUS_LABEL[moved.status];
  return (
    <li
      ref={self}
      tabIndex={-1}
      className="flex scroll-mt-6 flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule py-4 focus-visible:outline-offset-[-2px]"
    >
      <p className="text-[16px]">
        {CATEGORY_LABEL[moved.category]} from {moved.sent_by} moved to {status}.
      </p>
      <Link
        href={href}
        className="caps text-[14px] underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
      >
        Show {status}
      </Link>
    </li>
  );
}
