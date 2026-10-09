import { describe, expect, it } from "vitest";
import { buildGrid, gradesCsv, pct, type GradeRow } from "./grades";

const row = (over: Partial<GradeRow>): GradeRow => ({
  user_id: "u1",
  full_name: "Ana",
  test_id: "t1",
  test_num: 1,
  test_title: "Medical terms",
  mode: null,
  best_score: null,
  best_total: null,
  tries: 0,
  ...over,
});

describe("pct", () => {
  it("rounds to a whole percent and returns null with nothing to grade", () => {
    expect(pct(2, 3)).toBe(67);
    expect(pct(4, 4)).toBe(100);
    expect(pct(null, 4)).toBeNull();
    expect(pct(1, 0)).toBeNull();
  });
});

describe("buildGrid", () => {
  const rows: GradeRow[] = [
    row({
      user_id: "u2",
      full_name: "Ben",
      test_id: "t1",
      mode: "timed",
      best_score: 3,
      best_total: 4,
      tries: 2,
    }),
    row({
      user_id: "u2",
      full_name: "Ben",
      test_id: "t2",
      test_num: 2,
      test_title: "Anatomy",
      mode: "practice",
      best_score: 1,
      best_total: 2,
      tries: 1,
    }),
    row({
      user_id: "u1",
      full_name: "Ana",
      test_id: "t1",
      mode: "timed",
      best_score: 4,
      best_total: 4,
      tries: 1,
    }),
    row({
      user_id: "u1",
      full_name: "Ana",
      test_id: "t2",
      test_num: 2,
      test_title: "Anatomy",
    }),
  ];

  it("orders tests by number and members by name", () => {
    const grid = buildGrid(rows);
    expect(grid.tests.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(grid.members.map((m) => m.full_name)).toEqual(["Ana", "Ben"]);
  });

  it("keeps the mode and marks members with no attempt as empty cells", () => {
    const grid = buildGrid(rows);
    const ana = grid.members[0];
    expect(ana.cells.t1).toEqual({ pct: 100, mode: "timed", tries: 1 });
    expect(ana.cells.t2).toBeNull();
  });

  it("averages each member over the tests they took, and each test over the members who took it", () => {
    const grid = buildGrid(rows);
    expect(grid.members.find((m) => m.full_name === "Ana")?.average).toBe(100);
    expect(grid.members.find((m) => m.full_name === "Ben")?.average).toBe(63);
    expect(grid.testAverages.t1).toBe(88);
    expect(grid.testAverages.t2).toBe(50);
  });
});

describe("gradesCsv", () => {
  it("writes a header, one row per member, and a test-average row", () => {
    const grid = buildGrid([
      row({
        user_id: "u1",
        full_name: "Ana",
        mode: "timed",
        best_score: 4,
        best_total: 4,
        tries: 1,
      }),
      row({
        user_id: "u2",
        full_name: "Ben",
        mode: "practice",
        best_score: 1,
        best_total: 2,
        tries: 1,
      }),
    ]);
    expect(gradesCsv(grid)).toBe(
      [
        "Name,Medical terms,Average",
        "Ana,100,100",
        "Ben,50 (practice),50",
        "Test average,75,",
      ].join("\r\n") + "\r\n",
    );
  });

  it("quotes commas and quotes, and neutralises a leading formula character", () => {
    const grid = buildGrid([
      row({
        user_id: "u1",
        full_name: '=HYPERLINK("x")',
        test_title: "Terms, part 1",
        mode: "timed",
        best_score: 1,
        best_total: 1,
        tries: 1,
      }),
    ]);
    const first = gradesCsv(grid).split("\r\n")[0];
    expect(first).toBe('Name,"Terms, part 1",Average');
    expect(gradesCsv(grid).split("\r\n")[1]).toContain('"\'=HYPERLINK(""x"")"');
  });
});
