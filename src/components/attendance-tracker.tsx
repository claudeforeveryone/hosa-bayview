"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, UserCheck, X } from "lucide-react";
import {
  markAllPresent,
  setRosterMark,
} from "@/app/(app)/admin/attendance/roster-actions";
import { FormMessage } from "@/components/form";
import {
  columnTotal,
  markKey,
  rowTotal,
  weekColumnLabel,
  type RosterWeek,
} from "@/lib/roster";


// Present is green and absent is red, so a week reads at a glance. Weeks still to come stay neutral in the
// season grid (nobody has been absent yet).
const PRESENT = "border-ok bg-ok text-ground font-semibold";
const ABSENT = "border-danger bg-danger text-ground hover:opacity-90";
const UPCOMING = "border-rule-strong text-ink-2 hover:border-ink hover:bg-band";
// The weekly attendance tracker: the chapter's paper sheet, live. Every tap saves at once (one upsert),
// the screen changes first and goes back if the save fails.

export type TrackerPerson = {
  id: string;
  name: string;
  grade: number | null;
  hasAccount: boolean;
};
export type TrackerClass = {
  id: string;
  label: string;
  members: TrackerPerson[];
};

const GENERIC = "That didn't save. Try again.";

// Present cells as a Set of markKey(member, week), with optimistic writes. A failed save is undone only if
// no newer tap on the same cell has happened since.
function useMarks(initial: readonly string[]) {
  const [present, setPresent] = useState(() => new Set(initial));
  const [error, setError] = useState<string | null>(null);
  const version = useRef(new Map<string, number>());

  const apply = (keys: readonly string[], on: boolean) =>
    setPresent((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const save = (
    keys: string[],
    on: boolean,
    write: () => Promise<{ ok: boolean; error?: string }>,
  ) => {
    const stamps = keys.map((k) => {
      const v = (version.current.get(k) ?? 0) + 1;
      version.current.set(k, v);
      return v;
    });
    const before = keys.filter((k) => present.has(k));
    apply(keys, on);
    setError(null);
    const undo = (message: string) => {
      const stale = keys.filter((k, i) => version.current.get(k) === stamps[i]);
      // Put each cell back the way it was before this tap.
      apply(
        stale.filter((k) => before.includes(k)),
        true,
      );
      apply(
        stale.filter((k) => !before.includes(k)),
        false,
      );
      setError(message);
    };
    write()
      .then((r) => {
        if (!r.ok) undo(r.error ?? GENERIC);
      })
      .catch(() => undo(GENERIC));
  };

  const toggle = (memberId: string, weekId: string) => {
    const key = markKey(memberId, weekId);
    const on = !present.has(key);
    save([key], on, () => setRosterMark(memberId, weekId, on));
  };

  const markAll = (memberIds: string[], weekId: string) => {
    const missing = memberIds.filter((m) => !present.has(markKey(m, weekId)));
    if (missing.length === 0) return;
    save(
      missing.map((m) => markKey(m, weekId)),
      true,
      () => markAllPresent(missing, weekId),
    );
  };

  return { present, error, toggle, markAll };
}

// Takes its colour from the row (ink-2 on the sheet, the button's own text on the board). No opacity on top:
// faded ink-2 fell under AA (3.98:1 light). One line, so a long name truncates instead of "Gr" over "11".
function Grade({ grade }: { grade: number | null }) {
  return grade ? (
    <span className="num shrink-0 text-[14px] whitespace-nowrap">
      Gr {grade}
    </span>
  ) : null;
}

function AccountMark() {
  return (
    <span title="Has an account" className="inline-flex shrink-0">
      <UserCheck size={15} strokeWidth={2} aria-hidden />
      <span className="sr-only">(has an account)</span>
    </span>
  );
}

// "All events" for one meeting: a framed block per event, a one-tap Present / Not present per name.
export function WeekBoard({
  classes,
  week,
  initialPresent,
  gridHrefBase,
}: {
  classes: TrackerClass[];
  week: RosterWeek;
  initialPresent: string[];
  // Prefix the class id is appended to for its season sheet.
  gridHrefBase: string;
}) {
  const { present, error, toggle, markAll } = useMarks(initialPresent);

  return (
    <div className="grid gap-4">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {classes.map((c) => {
          const ids = c.members.map((m) => m.id);
          const here = columnTotal(present, ids, week.id);
          const all = here === ids.length;
          return (
            // One fixed column (grid-cols-1), here and on the name list: an auto column grew to the widest name's
            // unwrapped width and pushed the card's contents past a phone's edge instead of truncating the name.
            <li
              key={c.id}
              className="grid grid-cols-1 content-start border-[3px] border-ink"
            >
              <div className="flex items-baseline justify-between gap-3 border-b-[3px] border-ink px-3 py-2.5">
                <Link
                  href={`${gridHrefBase}${c.id}`}
                  className="caps min-w-0 text-[17px] leading-tight underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                >
                  {c.label}
                </Link>
                <span
                  className="caps num shrink-0 text-[15px]"
                  aria-live="polite"
                >
                  {here}/{ids.length} present
                </span>
              </div>
              <ul
                className="grid grid-cols-1 gap-1.5 p-2"
                aria-label={`${c.label} attendance`}
              >
                {c.members.map((m) => {
                  const on = present.has(markKey(m.id, week.id));
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(m.id, week.id)}
                        className={`step press flex min-h-12 w-full items-center gap-2.5 border px-3 py-2 text-left ${
                          on ? PRESENT : ABSENT
                        }`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            className={`min-w-0 truncate text-[17px] ${on ? "font-semibold" : ""}`}
                          >
                            {m.name}
                          </span>
                          {m.hasAccount ? <AccountMark /> : null}
                        </span>
                        <Grade grade={m.grade} />
                        <span className="caps flex w-[7.5rem] shrink-0 items-center justify-end gap-1.5 text-[14px]">
                          {on ? (
                            <Check size={18} strokeWidth={3} aria-hidden />
                          ) : (
                            <X size={18} strokeWidth={3} aria-hidden />
                          )}
                          {on ? "Present" : "Absent"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-rule p-2">
                <button
                  type="button"
                  disabled={all}
                  onClick={() => markAll(ids, week.id)}
                  className="caps step press h-11 w-full border border-ink text-[15px] hover:bg-band disabled:cursor-default disabled:border-rule disabled:text-ink-2 disabled:hover:bg-transparent"
                >
                  {all ? "Everyone present" : "Mark all present"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// One class, the whole season: names down the side, a column per meeting date, a total per row and column.
export function SeasonGrid({
  label,
  members,
  weeks,
  currentIndex,
  initialPresent,
}: {
  label: string;
  members: TrackerPerson[];
  weeks: RosterWeek[];
  currentIndex: number;
  initialPresent: string[];
}) {
  const { present, error, toggle } = useMarks(initialPresent);
  const weekIds = weeks.map((w) => w.id);
  const memberIds = members.map((m) => m.id);
  const cur = (i: number) => (i === currentIndex ? "bg-band" : "");

  return (
    <div className="grid gap-3">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <div
        className="max-w-full overflow-x-auto border-[3px] border-ink"
        role="region"
        aria-label={`${label} sheet`}
        tabIndex={0}
      >
        <table className="num w-max min-w-full border-separate border-spacing-0 text-[16px]">
          <caption className="sr-only">
            {label} attendance. Each cell is a button: pressed means present.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="caps sticky left-0 z-20 border-r-2 border-b-2 border-ink bg-ground px-3 py-2 text-left text-[14px]"
              >
                Name
              </th>
              {weeks.map((w, i) => (
                <th
                  key={w.id}
                  scope="col"
                  className={`caps border-b-2 border-ink px-1 py-2 text-center text-[13px] whitespace-nowrap ${
                    i === currentIndex ? "bg-ink text-ground" : ""
                  }`}
                >
                  {weekColumnLabel(w.meet_on)}
                  {i === currentIndex ? (
                    <span className="sr-only"> (this week)</span>
                  ) : null}
                </th>
              ))}
              <th
                scope="col"
                className="caps border-b-2 border-l-2 border-ink px-3 py-2 text-right text-[14px]"
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r-2 border-b border-r-ink border-b-rule bg-ground px-3 py-1 text-left font-normal"
                >
                  <span className="flex w-[9.5rem] items-center gap-1.5 sm:w-[13rem]">
                    <span className="min-w-0 truncate text-[16px]">
                      {m.name}
                    </span>
                    {m.hasAccount ? <AccountMark /> : null}
                    <span className="ml-auto text-ink-2">
                      <Grade grade={m.grade} />
                    </span>
                  </span>
                </th>
                {weeks.map((w, i) => {
                  const on = present.has(markKey(m.id, w.id));
                  return (
                    <td
                      key={w.id}
                      className={`border-b border-rule p-0.5 text-center ${cur(i)}`}
                    >
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${m.name}, ${weekColumnLabel(w.meet_on)}`}
                        onClick={() => toggle(m.id, w.id)}
                        className={`step press mx-auto grid h-10 w-11 place-items-center border ${
                          on ? PRESENT : i <= currentIndex ? ABSENT : UPCOMING
                        }`}
                      >
                        {on ? (
                          <Check size={20} strokeWidth={3} aria-hidden />
                        ) : i <= currentIndex ? (
                          <X size={18} strokeWidth={3} aria-hidden />
                        ) : null}
                      </button>
                    </td>
                  );
                })}
                <td className="border-b border-l-2 border-b-rule border-l-ink px-3 text-right font-semibold whitespace-nowrap">
                  {rowTotal(present, m.id, weekIds)}/{weeks.length}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th
                scope="row"
                className="caps sticky left-0 z-10 border-t-2 border-r-2 border-ink bg-ground px-3 py-2 text-left text-[14px]"
              >
                Present
              </th>
              {weeks.map((w, i) => (
                <td
                  key={w.id}
                  className={`border-t-2 border-ink px-1 py-2 text-center font-semibold ${cur(i)}`}
                >
                  {columnTotal(present, memberIds, w.id)}
                </td>
              ))}
              <td className="border-t-2 border-l-2 border-ink px-3 py-2 text-right text-ink-2">
                of {members.length}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// Jump to another class's sheet; the URL carries ?class=<id> so it can be shared.
export function ClassPicker({
  options,
  value,
  hrefFor,
}: {
  options: { id: string; label: string; rostered: boolean }[];
  value: string;
  hrefFor: string;
}) {
  const router = useRouter();
  const rostered = options.filter((o) => o.rostered);
  const empty = options.filter((o) => !o.rostered);
  return (
    <div className="grid max-w-md gap-1.5">
      <label htmlFor="class-pick" className="text-[15px] font-medium">
        Event
      </label>
      <select
        id="class-pick"
        value={value}
        onChange={(e) =>
          router.push(`${hrefFor}${encodeURIComponent(e.target.value)}`)
        }
        className="step h-12 w-full border border-rule-strong bg-ground px-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
      >
        {rostered.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
        {empty.length ? (
          <optgroup label="No one joined yet">
            {empty.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </div>
  );
}
