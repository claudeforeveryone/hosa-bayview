"use client";

import { Download } from "lucide-react";
import { useMemo } from "react";
import {
  buildGrid,
  gradesCsv,
  type GradeCell,
  type GradeRow,
} from "@/lib/grades";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "event";

function Score({ cell }: { cell: GradeCell | null | undefined }) {
  if (!cell) return <span className="text-ink-2">No attempt</span>;
  return (
    <span className="num">
      {cell.pct}%
      {cell.mode === "practice" ? (
        <span className="caps ml-2 text-12 font-normal text-ink-2">
          Practice
        </span>
      ) : null}
    </span>
  );
}

// Members × posted tests, best score each. Trainers see everyone and can export a CSV; members see only their row.
export function GradesView({
  rows,
  canManage,
  classroomName,
}: {
  rows: GradeRow[];
  canManage: boolean;
  classroomName: string;
}) {
  const grid = useMemo(() => buildGrid(rows), [rows]);

  // No members wins: "no posted tests" only makes sense once there is someone to grade.
  if (grid.members.length && !grid.tests.length) {
    return (
      <p className="border-y border-rule-strong px-1 py-4 text-ink-2">
        No posted tests yet.
      </p>
    );
  }
  if (!grid.members.length) {
    return (
      <p className="border-y border-rule-strong px-1 py-4 text-ink-2">
        No members yet.
      </p>
    );
  }

  const download = () => {
    const blob = new Blob([gradesCsv(grid)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(classroomName)}-grades.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="caps num text-16 text-ink-2">
          {grid.members.length} member{grid.members.length === 1 ? "" : "s"} ·{" "}
          {grid.tests.length} test
          {grid.tests.length === 1 ? "" : "s"}
        </p>
        {canManage ? (
          <button
            type="button"
            onClick={download}
            className="caps step inline-flex h-11 items-center gap-2 border border-ink px-4 text-16 hover:bg-band"
          >
            <Download size={18} strokeWidth={1.75} aria-hidden />
            Download CSV
          </button>
        ) : null}
      </div>

      {/* Phones: one block per member. */}
      <div className="grid gap-6 sm:hidden">
        {grid.members.map((m) => (
          <section
            key={m.user_id}
            aria-label={m.full_name}
            className="grid gap-2 border-t border-rule pt-4"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="min-w-0 truncate text-19 font-semibold">
                {m.full_name}
              </h3>
              <p className="num font-display text-26 font-semibold">
                {m.average === null ? "—" : `${m.average}%`}
              </p>
            </div>
            <dl className="grid">
              {grid.tests.map((t) => (
                <div
                  key={t.id}
                  className="flex items-baseline justify-between gap-4 border-b border-rule py-2 text-16"
                >
                  <dt className="min-w-0 truncate text-ink-2">{t.title}</dt>
                  <dd className="shrink-0">
                    <Score cell={m.cells[t.id]} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <section
          aria-label="Test averages"
          className="grid gap-2 border-t-2 border-ink pt-4"
        >
          <h3 className="caps text-16">Test averages</h3>
          <dl className="grid">
            {grid.tests.map((t) => (
              <div
                key={t.id}
                className="flex items-baseline justify-between gap-4 border-b border-rule py-2 text-16"
              >
                <dt className="min-w-0 truncate text-ink-2">{t.title}</dt>
                <dd className="num shrink-0">
                  {grid.testAverages[t.id] === null
                    ? "—"
                    : `${grid.testAverages[t.id]}%`}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      {/* Larger screens: a grid. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-t border-rule text-left">
          <thead>
            <tr className="caps text-14 text-ink-2">
              <th scope="col" className="py-2 pr-4 font-semibold">
                Name
              </th>
              {grid.tests.map((t) => (
                <th
                  key={t.id}
                  scope="col"
                  className="max-w-[14ch] py-2 pr-4 text-right font-semibold"
                >
                  <span className="block truncate" title={t.title}>
                    {t.title}
                  </span>
                </th>
              ))}
              <th scope="col" className="py-2 text-right font-semibold">
                Average
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.members.map((m) => (
              <tr key={m.user_id} className="border-t border-rule">
                <th
                  scope="row"
                  className="max-w-[18ch] truncate py-3 pr-4 text-left text-17 font-medium"
                >
                  {m.full_name}
                </th>
                {grid.tests.map((t) => (
                  <td key={t.id} className="py-3 pr-4 text-right text-17">
                    <Score cell={m.cells[t.id]} />
                  </td>
                ))}
                <td className="num py-3 text-right font-display text-22 font-semibold">
                  {m.average === null ? "—" : `${m.average}%`}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink">
              <th
                scope="row"
                className="py-3 pr-4 text-left text-15 font-semibold uppercase caps"
              >
                Test average
              </th>
              {grid.tests.map((t) => (
                <td
                  key={t.id}
                  className="num py-3 pr-4 text-right text-17 font-semibold"
                >
                  {grid.testAverages[t.id] === null
                    ? "—"
                    : `${grid.testAverages[t.id]}%`}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-15 text-ink-2">
        Best score per test: a timed run counts over practice. Averages cover
        the tests each person has taken.
      </p>
    </div>
  );
}
