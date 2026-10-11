import { describe, expect, it } from "vitest";
import {
  SKILLS,
  bestRun,
  comebacks,
  levelFor,
  nextUp,
  perfectDays,
  skillProgress,
  skillsFor,
  tierOf,
  topSkills,
  totalTiers,
  type SkillAnswer,
} from "./skills";

const def = (id: string) => SKILLS.find((s) => s.id === id)!;
const at = (min: number) => new Date(Date.UTC(2026, 9, 6, 15, min)).toISOString();
const ans = (min: number, is_correct: boolean | null, question_id = `q${min}`, test_title = "T"): SkillAnswer => ({
  answered_at: at(min),
  is_correct,
  question_id,
  test_title,
});

describe("skill tiers", () => {
  it("counts the tiers reached", () => {
    expect(tierOf(def("reps"), 0)).toBe(0);
    expect(tierOf(def("reps"), 10)).toBe(1);
    expect(tierOf(def("reps"), 499)).toBe(2);
    expect(tierOf(def("reps"), 5000)).toBe(4);
  });

  it("measures progress from the last tier to the next", () => {
    const p = skillProgress(def("reps"), 55);
    expect(p.tier).toBe(1);
    expect(p.next).toBe(100);
    expect(p.progress).toBeCloseTo(0.5);
    expect(skillProgress(def("reps"), 9999)).toMatchObject({ tier: 4, next: null, progress: 1 });
  });

  it("ranks count down: first in the chapter maxes Contender", () => {
    expect(tierOf(def("rank"), 30)).toBe(0);
    expect(tierOf(def("rank"), 10)).toBe(2);
    expect(tierOf(def("rank"), 1)).toBe(4);
    const p = skillProgress(def("rank"), 17);
    expect(p.next).toBe(10);
    expect(p.progress).toBeGreaterThan(0);
    expect(p.progress).toBeLessThan(1);
  });

  it("accuracy needs enough answers behind it", () => {
    expect(def("precision").measure({ answered: 3, correct: 3 })).toBe(0);
    expect(def("precision").measure({ answered: 100, correct: 86 })).toBe(86);
  });

  it("leaves out skills the input can't measure", () => {
    const ids = skillsFor({ answered: 5, correct: 4 }).map((s) => s.def.id);
    expect(ids).toEqual(["reps", "right", "precision"]);
    expect(skillsFor({ answered: 5, correct: 4, battleWins: null }).map((s) => s.def.id)).not.toContain("battles");
    expect(skillsFor({ answered: 1, correct: 1, rank: 4 }).map((s) => s.def.id)).toContain("rank");
    expect(skillsFor({ answered: 0, correct: 0, rank: 4 }).map((s) => s.def.id)).not.toContain("rank");
  });

  it("every skill has four rising (or, for rank, falling) tiers and a unique id", () => {
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(SKILLS.length);
    for (const s of SKILLS) {
      const sorted = [...s.tiers].sort((a, b) => (s.lowerIsBetter ? b - a : a - b));
      expect(s.tiers).toEqual(sorted);
    }
  });
});

describe("answer-based skills", () => {
  it("finds the longest run of right answers, skipping hidden ones", () => {
    expect(bestRun([ans(1, true), ans(2, true), ans(3, false), ans(4, true), ans(5, null), ans(6, true), ans(7, true)])).toBe(3);
    expect(bestRun([])).toBe(0);
  });

  it("orders by time, not by list order", () => {
    expect(bestRun([ans(3, true), ans(1, true), ans(2, false)])).toBe(1);
  });

  it("counts questions missed and later fixed once each", () => {
    expect(
      comebacks([ans(1, false, "a"), ans(2, true, "a"), ans(3, true, "a"), ans(4, true, "b"), ans(5, false, "c")]),
    ).toBe(1);
    // Right first, wrong later: not a comeback.
    expect(comebacks([ans(1, true, "a"), ans(2, false, "a")])).toBe(0);
  });

  it("a perfect day is 10+ graded answers with none wrong", () => {
    const day = Array.from({ length: 10 }, (_, i) => ans(i, true));
    expect(perfectDays(day)).toBe(1);
    expect(perfectDays([...day, ans(20, false)])).toBe(0);
    expect(perfectDays(day.slice(0, 9))).toBe(0);
  });
});

describe("levels", () => {
  it("names the level for the tiers earned", () => {
    expect(levelFor(0).title).toBe("Volunteer");
    expect(levelFor(8).title).toBe("Intern");
    expect(levelFor(60)).toMatchObject({ title: "Chief", next: null });
  });

  it("totals, top picks and the next nudge", () => {
    const list = skillsFor({ answered: 120, correct: 20, reviews: 0 });
    expect(totalTiers(list)).toBe(2 + 1);
    expect(topSkills(list, 1)[0].def.id).toBe("reps");
    expect(nextUp(list)?.def.id).toBeDefined();
  });
});
