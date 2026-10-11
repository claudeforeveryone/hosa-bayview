// Skills: badges you earn by studying. Every skill has four tiers (I to IV) and is worked out from numbers the
// app already shows you (your stats, your answers, your battle wins), so nothing new is stored and nothing here
// reads data you couldn't already see. Pure, so the rules are testable apart from the pages.
import { dayKey } from "@/lib/when";

export type SkillGroup = "practice" | "accuracy" | "habit" | "explore";

export const SKILL_GROUPS: { id: SkillGroup; label: string; blurb: string }[] = [
  { id: "practice", label: "Practice", blurb: "Put in the reps." },
  { id: "accuracy", label: "Accuracy", blurb: "Get them right." },
  { id: "habit", label: "Habits", blurb: "Show up, again and again." },
  { id: "explore", label: "Explorer", blurb: "Go wide and come back stronger." },
];

// What the skills are worked out from. Anything missing (an event has no Elo, battles may be off) leaves its
// skills out instead of showing them as stuck at zero.
export type SkillAnswer = {
  answered_at: string;
  is_correct: boolean | null;
  question_id: string | null;
  test_title: string;
  favorite?: boolean;
};

export type SkillInput = {
  answered: number;
  correct: number;
  minutes?: number;
  reviews?: number;
  streak?: number;
  signInStreak?: number;
  elo?: number;
  rank?: number; // chapter rank, 1 is first
  battleWins?: number | null;
  answers?: SkillAnswer[];
};

export type SkillDef = {
  id: string;
  name: string;
  group: SkillGroup;
  icon: string; // a key in the page's icon map (lucide names)
  // What one tier asks for, with the number filled in: "Answer 100 questions".
  goal: (n: number) => string;
  unit: (n: number) => string;
  tiers: [number, number, number, number];
  // The current value, or null when the input doesn't carry what this skill needs.
  measure: (input: SkillInput) => number | null;
  // Rank counts down: lower is better.
  lowerIsBetter?: boolean;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-CA")} ${n === 1 ? one : many}`;
const hours = (minutes: number) => Math.floor(minutes / 60);

// Accuracy only counts once there's enough behind it, so three lucky answers can't earn the top tier.
export const ACCURACY_MIN_ANSWERS = 50;

// The longest run of right answers in a row, oldest to newest. Hidden-answer rows (null) don't break a run.
export function bestRun(answers: SkillAnswer[]): number {
  const ordered = [...answers].sort((a, b) => Date.parse(a.answered_at) - Date.parse(b.answered_at));
  let best = 0;
  let run = 0;
  for (const a of ordered) {
    if (a.is_correct === true) best = Math.max(best, ++run);
    else if (a.is_correct === false) run = 0;
  }
  return best;
}

// Questions you once got wrong and later got right.
export function comebacks(answers: SkillAnswer[]): number {
  const ordered = [...answers].sort((a, b) => Date.parse(a.answered_at) - Date.parse(b.answered_at));
  const missed = new Set<string>();
  const fixed = new Set<string>();
  for (const a of ordered) {
    if (!a.question_id) continue;
    if (a.is_correct === false) missed.add(a.question_id);
    else if (a.is_correct === true && missed.has(a.question_id)) fixed.add(a.question_id);
  }
  return fixed.size;
}

// Toronto days with at least 10 graded answers and not one wrong.
export function perfectDays(answers: SkillAnswer[]): number {
  const days = new Map<string, { n: number; wrong: boolean }>();
  for (const a of answers) {
    if (a.is_correct === null) continue;
    const key = dayKey(a.answered_at);
    const d = days.get(key) ?? { n: 0, wrong: false };
    d.n += 1;
    if (!a.is_correct) d.wrong = true;
    days.set(key, d);
  }
  return [...days.values()].filter((d) => d.n >= 10 && !d.wrong).length;
}

export const SKILLS: SkillDef[] = [
  {
    id: "reps",
    name: "Question Machine",
    group: "practice",
    icon: "list-checks",
    goal: (n) => `Answer ${plural(n, "question")}`,
    unit: (n) => plural(n, "question"),
    tiers: [10, 100, 500, 2000],
    measure: (i) => i.answered,
  },
  {
    id: "hours",
    name: "Study Hall",
    group: "practice",
    icon: "clock",
    goal: (n) => `Study for ${plural(hours(n), "hour")}`,
    unit: (n) => plural(hours(n), "hour"),
    tiers: [60, 300, 1200, 3000],
    measure: (i) => (i.minutes === undefined ? null : i.minutes),
  },
  {
    id: "cards",
    name: "Card Shark",
    group: "practice",
    icon: "layers",
    goal: (n) => `Review ${plural(n, "flashcard")}`,
    unit: (n) => plural(n, "card"),
    tiers: [25, 200, 1000, 5000],
    measure: (i) => (i.reviews === undefined ? null : i.reviews),
  },
  {
    id: "right",
    name: "Sharpshooter",
    group: "accuracy",
    icon: "crosshair",
    goal: (n) => `Get ${plural(n, "question")} right`,
    unit: (n) => plural(n, "right answer"),
    tiers: [10, 100, 400, 1500],
    measure: (i) => i.correct,
  },
  {
    id: "precision",
    name: "Steady Hands",
    group: "accuracy",
    icon: "activity",
    goal: (n) => `Hold ${n}% accuracy over ${ACCURACY_MIN_ANSWERS}+ answers`,
    unit: (n) => `${n}%`,
    tiers: [60, 75, 85, 95],
    measure: (i) => (i.answered >= ACCURACY_MIN_ANSWERS ? Math.floor((i.correct / i.answered) * 100) : 0),
  },
  {
    id: "run",
    name: "Hot Streak",
    group: "accuracy",
    icon: "flame",
    goal: (n) => `Get ${n} right in a row`,
    unit: (n) => `${n} in a row`,
    tiers: [5, 10, 25, 50],
    measure: (i) => (i.answers ? bestRun(i.answers) : null),
  },
  {
    id: "perfect",
    name: "Flawless",
    group: "accuracy",
    icon: "badge-check",
    goal: (n) => `Have ${plural(n, "perfect day")} (10+ answers, none wrong)`,
    unit: (n) => plural(n, "perfect day"),
    tiers: [1, 3, 10, 25],
    measure: (i) => (i.answers ? perfectDays(i.answers) : null),
  },
  {
    id: "streak",
    name: "Dedicated",
    group: "habit",
    icon: "calendar-check",
    goal: (n) => `Study ${plural(n, "day")} in a row`,
    unit: (n) => plural(n, "day"),
    tiers: [3, 7, 30, 100],
    measure: (i) => (i.streak === undefined ? null : i.streak),
  },
  {
    id: "signin",
    name: "Regular",
    group: "habit",
    icon: "log-in",
    goal: (n) => `Sign in ${plural(n, "day")} in a row`,
    unit: (n) => plural(n, "day"),
    tiers: [3, 7, 30, 100],
    measure: (i) => (i.signInStreak === undefined ? null : i.signInStreak),
  },
  {
    id: "elo",
    name: "Climber",
    group: "habit",
    icon: "trending-up",
    goal: (n) => `Reach ${n.toLocaleString("en-CA")} Elo`,
    unit: (n) => `${n.toLocaleString("en-CA")} Elo`,
    tiers: [100, 500, 2000, 5000],
    measure: (i) => (i.elo === undefined ? null : i.elo),
  },
  {
    id: "rank",
    name: "Contender",
    group: "habit",
    icon: "trophy",
    goal: (n) => (n === 1 ? "Rank first in the chapter" : `Rank in the chapter's top ${n}`),
    unit: (n) => `#${n}`,
    tiers: [25, 10, 3, 1],
    lowerIsBetter: true,
    measure: (i) => (i.rank === undefined || i.rank <= 0 || i.answered === 0 ? null : i.rank),
  },
  {
    id: "tests",
    name: "Explorer",
    group: "explore",
    icon: "compass",
    goal: (n) => `Answer questions from ${plural(n, "test")}`,
    unit: (n) => plural(n, "test"),
    tiers: [1, 5, 15, 40],
    measure: (i) => (i.answers ? new Set(i.answers.map((a) => a.test_title)).size : null),
  },
  {
    id: "comeback",
    name: "Comeback",
    group: "explore",
    icon: "rotate-ccw",
    goal: (n) => `Get ${plural(n, "question")} right that you once missed`,
    unit: (n) => plural(n, "comeback"),
    tiers: [1, 10, 50, 150],
    measure: (i) => (i.answers ? comebacks(i.answers) : null),
  },
  {
    id: "collector",
    name: "Collector",
    group: "explore",
    icon: "star",
    goal: (n) => `Star ${plural(n, "question")} to review`,
    unit: (n) => plural(n, "star"),
    tiers: [1, 10, 30, 100],
    measure: (i) =>
      i.answers
        ? new Set(i.answers.filter((a) => a.favorite && a.question_id).map((a) => a.question_id)).size
        : null,
  },
  {
    id: "battles",
    name: "Gladiator",
    group: "explore",
    icon: "swords",
    goal: (n) => `Win ${plural(n, "battle")}`,
    unit: (n) => plural(n, "win"),
    tiers: [1, 5, 20, 50],
    measure: (i) => (i.battleWins === undefined || i.battleWins === null ? null : i.battleWins),
  },
];

export const TIER_NAMES = ["I", "II", "III", "IV"] as const;

export type SkillProgress = {
  def: SkillDef;
  value: number;
  tier: number; // 0 (none yet) to 4
  next: number | null; // the next tier's target, null once maxed
  // 0 to 1 toward the next tier, from the last tier earned (1 when maxed).
  progress: number;
};

export function tierOf(def: SkillDef, value: number): number {
  return def.tiers.filter((t) => (def.lowerIsBetter ? value <= t : value >= t)).length;
}

export function skillProgress(def: SkillDef, value: number): SkillProgress {
  const tier = tierOf(def, value);
  const next = tier < def.tiers.length ? def.tiers[tier] : null;
  let progress = 1;
  if (next !== null) {
    if (def.lowerIsBetter) {
      // Rank: from "unranked" (twice the first target) down to the next target.
      const from = tier === 0 ? def.tiers[0] * 2 : def.tiers[tier - 1];
      progress = from === next ? 0 : (from - value) / (from - next);
    } else {
      const from = tier === 0 ? 0 : def.tiers[tier - 1];
      progress = (value - from) / (next - from);
    }
  }
  return { def, value, tier, next, progress: Math.min(1, Math.max(0, progress)) };
}

// Every skill the input can measure, in list order.
export function skillsFor(input: SkillInput, only?: readonly string[]): SkillProgress[] {
  return SKILLS.filter((d) => !only || only.includes(d.id)).flatMap((def) => {
    const value = def.measure(input);
    return value === null ? [] : [skillProgress(def, value)];
  });
}

// Titles for the total tiers earned, from first answer to the top. Hospital ranks, for a health science chapter.
export const LEVELS: { at: number; title: string }[] = [
  { at: 0, title: "Volunteer" },
  { at: 3, title: "Student" },
  { at: 8, title: "Intern" },
  { at: 16, title: "Resident" },
  { at: 28, title: "Fellow" },
  { at: 42, title: "Attending" },
  { at: 54, title: "Chief" },
];

export function levelFor(tiers: number): { title: string; index: number; next: { at: number; title: string } | null } {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (tiers >= LEVELS[i].at) index = i;
  return { title: LEVELS[index].title, index, next: LEVELS[index + 1] ?? null };
}

export const totalTiers = (list: SkillProgress[]) => list.reduce((n, s) => n + s.tier, 0);

// The skills to show off first: highest tier, then closest to the next.
export function topSkills(list: SkillProgress[], n: number): SkillProgress[] {
  return [...list]
    .filter((s) => s.tier > 0)
    .sort((a, b) => b.tier - a.tier || b.progress - a.progress)
    .slice(0, n);
}

// The skill closest to its next tier, as a nudge: "3 more right in a row for Hot Streak II".
export function nextUp(list: SkillProgress[]): SkillProgress | null {
  const open = list.filter((s) => s.next !== null);
  if (!open.length) return null;
  return open.reduce((best, s) => (s.progress > best.progress ? s : best));
}

// Skills that make sense inside one event: what that event's board and your answers there can measure.
export const EVENT_SKILLS = ["reps", "right", "precision", "hours", "run", "perfect", "tests", "comeback"] as const;
