import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/avatar";
import {
  STATUS_LABEL,
  STATUSES,
  countStatuses,
  type Status,
} from "@/lib/attendance";
import {
  meetingDateLabel,
  STATE_LABEL,
  type MeetingState,
} from "@/lib/meetings";

export type RosterEntry = {
  user_id: string;
  name: string;
  src: string | null;
  status: Status | null;
};

export type MeetingItem = {
  key: string;
  title: string;
  date: string; // YYYY-MM-DD
  kindLabel: string;
  none: boolean; // a listed week with no meeting: shown, never expanded, never counted
  state: MeetingState | "off-schedule";
  isNext: boolean;
  note?: string;
  // Managers: the roster with each member's mark, shown when the row opens.
  members?: RosterEntry[];
  // Managers: the week's sheet, to take or edit attendance.
  sheetWeek?: string | null;
  // Members: their own mark only (RLS hides everyone else's).
  ownStatus?: Status | null;
};

const STATUS_TONE: Record<Status, string> = {
  present: "text-ink",
  late: "text-ink",
  absent: "text-danger",
  excused: "text-ink-2",
};

// The schedule, oldest first. Managers' rows open to show the roster with pictures and marks; members see
// their own status on each row.
export function MeetingList({
  items,
  classroomId,
  manage,
}: {
  items: MeetingItem[];
  classroomId: string;
  manage: boolean;
}) {
  return (
    <ul className="border-t border-rule">
      {items.map((item) => (
        <li key={item.key} className="border-b border-rule">
          {item.none || !manage || !item.members ? (
            <MeetingRowStatic item={item} />
          ) : (
            <MeetingRowOpen item={item} classroomId={classroomId} />
          )}
        </li>
      ))}
    </ul>
  );
}

function RowHead({ item, right }: { item: MeetingItem; right: ReactNode }) {
  return (
    <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
      <span className="min-w-0">
        <span
          className={`block truncate text-[19px] font-semibold ${item.none ? "text-ink-2" : ""}`}
        >
          {item.title}
        </span>
        <span className="caps block text-[15px] text-ink-2">
          {[
            meetingDateLabel(item.date),
            item.kindLabel,
            stateText(item),
            item.isNext ? "Next" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {right}
    </span>
  );
}

// The kind label already says "No meeting" or "Off schedule", so the state only adds for real meetings.
function stateText(item: MeetingItem): string | null {
  if (item.none || item.state === "off-schedule" || item.state === "no-meeting")
    return null;
  return STATE_LABEL[item.state];
}

function MeetingRowStatic({ item }: { item: MeetingItem }) {
  const own = item.ownStatus ?? null;
  const right = item.none ? null : (
    <span
      className={`caps text-[15px] ${own ? STATUS_TONE[own] : "text-ink-2"}`}
    >
      {own
        ? STATUS_LABEL[own]
        : item.state === "upcoming" || item.state === "today"
          ? "Not yet"
          : "Not marked"}
    </span>
  );
  return (
    <div className="px-1 py-4 sm:px-3">
      <RowHead item={item} right={right} />
      {item.note ? (
        <p className="mt-2 text-[16px] whitespace-pre-line text-ink-2">
          {item.note}
        </p>
      ) : null}
    </div>
  );
}

function MeetingRowOpen({
  item,
  classroomId,
}: {
  item: MeetingItem;
  classroomId: string;
}) {
  const members = item.members ?? [];
  const counts = countStatuses(
    members.flatMap((m) => (m.status ? [m.status] : [])),
  );
  const unmarked = members.length - STATUSES.reduce((n, s) => n + counts[s], 0);
  return (
    <details className="group">
      <summary className="step grid min-h-14 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-4 hover:bg-band sm:px-3 [&::-webkit-details-marker]:hidden">
        <RowHead
          item={item}
          right={
            <ChevronDown
              size={18}
              strokeWidth={2}
              aria-hidden
              className="text-ink-2 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out group-open:rotate-180"
            />
          }
        />
      </summary>
      <div className="grid gap-4 px-1 pt-1 pb-6 sm:px-3">
        <p className="caps num text-[15px] text-ink-2">
          {STATUSES.map((s) => `${counts[s]} ${STATUS_LABEL[s]}`).join(" · ")} ·{" "}
          {unmarked} not marked
        </p>
        {members.length === 0 ? (
          <p className="text-[16px] text-ink-2">No members yet.</p>
        ) : (
          <ul className="border-t border-rule">
            {members.map((m) => (
              <li
                key={m.user_id}
                className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-2"
              >
                <Avatar name={m.name} src={m.src} size="sm" />
                <span className="min-w-0 truncate text-[17px]">{m.name}</span>
                <span
                  className={`caps text-[15px] ${m.status ? STATUS_TONE[m.status] : "text-ink-2"}`}
                >
                  {m.status ? STATUS_LABEL[m.status] : "Not marked"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {item.note ? (
          <p className="text-[16px] whitespace-pre-line text-ink-2">
            {item.note}
          </p>
        ) : null}
        {item.sheetWeek ? (
          <Link
            href={`/c/${classroomId}/attendance?week=${item.sheetWeek}`}
            className="caps justify-self-start text-[15px] underline underline-offset-4"
          >
            Open the sheet
          </Link>
        ) : null}
      </div>
    </details>
  );
}
