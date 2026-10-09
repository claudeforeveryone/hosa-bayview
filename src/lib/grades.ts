// Classroom grades: one row per member per posted test, from the classroom_grades RPC.
// Pure helpers only; the grid and CSV are built here so they can be tested without a database.

export type GradeRow = {
  user_id: string;
  full_name: string;
  test_id: string;
  test_num: number;
  test_title: string;
  mode: "timed" | "practice" | null;
  best_score: number | null;
  best_total: number | null;
  tries: number;
};

export type GradeCell = {
  pct: number;
  mode: "timed" | "practice";
  tries: number;
};

export type GradeGrid = {
  tests: { id: string; num: number; title: string }[];
  members: {
    user_id: string;
    full_name: string;
    cells: Record<string, GradeCell | null>;
    average: number | null;
  }[];
  testAverages: Record<string, number | null>;
};

// Whole-number percent, or null when there is no finished attempt to grade.
export function pct(score: number | null, total: number | null): number | null {
  if (score === null || total === null || total <= 0) return null;
  return Math.round((score / total) * 100);
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export function buildGrid(rows: GradeRow[]): GradeGrid {
  const testMap = new Map<string, { id: string; num: number; title: string }>();
  const memberMap = new Map<
    string,
    {
      user_id: string;
      full_name: string;
      cells: Record<string, GradeCell | null>;
    }
  >();

  for (const r of rows) {
    if (!testMap.has(r.test_id))
      testMap.set(r.test_id, {
        id: r.test_id,
        num: r.test_num,
        title: r.test_title,
      });
    let member = memberMap.get(r.user_id);
    if (!member) {
      member = { user_id: r.user_id, full_name: r.full_name, cells: {} };
      memberMap.set(r.user_id, member);
    }
    const value = pct(r.best_score, r.best_total);
    member.cells[r.test_id] =
      value !== null && r.mode
        ? { pct: value, mode: r.mode, tries: r.tries }
        : null;
  }

  const tests = [...testMap.values()].sort((a, b) => a.num - b.num);
  const members = [...memberMap.values()]
    .sort((a, b) =>
      a.full_name.localeCompare(b.full_name, "en-CA", { sensitivity: "base" }),
    )
    .map((m) => ({
      ...m,
      average: mean(Object.values(m.cells).flatMap((c) => (c ? [c.pct] : []))),
    }));

  const testAverages: Record<string, number | null> = {};
  for (const t of tests) {
    testAverages[t.id] = mean(
      members.flatMap((m) => (m.cells[t.id] ? [m.cells[t.id]!.pct] : [])),
    );
  }

  return { tests, members, testAverages };
}

// Spreadsheets run a leading = + - or @ as a formula; prefix those so a name can't do that.
function csvField(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function gradesCsv(grid: GradeGrid): string {
  const header = ["Name", ...grid.tests.map((t) => t.title), "Average"];
  const cell = (c: GradeCell | null) =>
    c ? `${c.pct}${c.mode === "practice" ? " (practice)" : ""}` : "";
  const lines = [header];
  for (const m of grid.members) {
    lines.push([
      m.full_name,
      ...grid.tests.map((t) => cell(m.cells[t.id] ?? null)),
      m.average === null ? "" : String(m.average),
    ]);
  }
  lines.push([
    "Test average",
    ...grid.tests.map((t) =>
      grid.testAverages[t.id] === null ? "" : String(grid.testAverages[t.id]),
    ),
    "",
  ]);
  return (
    lines.map((line) => line.map(csvField).join(",")).join("\r\n") + "\r\n"
  );
}
