// Pure helpers for member profiles: grade, initials, and the grade filter. No server imports.

export const GRADES = [9, 10, 11, 12] as const;
export type Grade = (typeof GRADES)[number];

// Accepts a number or a numeric string (form fields, search params). Anything else is no grade.
export function parseGrade(value: unknown): Grade | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{1,2}$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  return (GRADES as readonly number[]).includes(n) ? (n as Grade) : null;
}

export const gradeLabel = (grade: number | null | undefined) =>
  grade ? `Grade ${grade}` : "No grade";

// Up to two letters: first letter of the first and last word. Falls back to "?" for a blank name.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "";
  const last =
    words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}

// Members in one grade, or everyone when no grade is picked.
export function filterByGrade<T extends { grade?: number | null }>(
  rows: T[],
  grade: Grade | null,
): T[] {
  return grade === null ? rows : rows.filter((r) => r.grade === grade);
}
