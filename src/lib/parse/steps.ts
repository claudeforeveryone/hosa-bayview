// Skill steps typed one per line, with optional trailing points: "Wash hands | 2". Pure; safe on client and server.
import { z } from "zod";

export type Step = { text: string; points?: number };

export const STEP_TEXT_MAX = 500;
export const STEPS_MAX = 100;
export const POINTS_MAX = 100;

// "1. ", "2) ", "- ", "* ", "• " at the start of a pasted rating-sheet line. Needs the space, so "1.5 mL" stays.
const MARKER = /^(?:\d{1,3}[.)]|[-*•])\s+/;
const POINTS = /\s*\|\s*(\d+(?:\.\d+)?)\s*$/;

export function parseSteps(input: string): Step[] {
  const steps: Step[] = [];
  for (const raw of input.split(/\r\n?|\n/)) {
    let line = raw.trim().replace(MARKER, "");
    if (!line) continue;
    const m = POINTS.exec(line);
    if (m) {
      line = line.slice(0, m.index).trim();
      if (line) {
        steps.push({ text: line, points: Number(m[1]) });
        continue;
      }
      line = raw.trim();
    }
    steps.push({ text: line });
  }
  return steps;
}

// Back to the textarea form, for editing.
export function stepsToText(steps: Step[]): string {
  return steps.map((s) => (s.points === undefined ? s.text : `${s.text} | ${s.points}`)).join("\n");
}

// Sum of scored steps; null when no step carries points.
export function totalPoints(steps: Step[]): number | null {
  const scored = steps.filter((s) => s.points !== undefined);
  return scored.length ? scored.reduce((sum, s) => sum + (s.points ?? 0), 0) : null;
}

// The database stores steps as plain jsonb, so this is the only shape check.
export const stepsSchema = z
  .array(
    z.object({
      text: z.string().min(1).max(STEP_TEXT_MAX, `Keep each step under ${STEP_TEXT_MAX} characters.`),
      points: z
        .number()
        .int("Points are whole numbers.")
        .min(0, "Points can't be negative.")
        .max(POINTS_MAX, `Points go up to ${POINTS_MAX}.`)
        .optional(),
    }),
  )
  .max(STEPS_MAX, `Up to ${STEPS_MAX} steps.`);

// Steps as stored. The column is any jsonb array, so read defensively: a step needs text; bad points are dropped.
export function cleanSteps(value: unknown): Step[] {
  if (!Array.isArray(value)) return [];
  const steps: Step[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { text, points } = item as { text?: unknown; points?: unknown };
    if (typeof text !== "string" || !text.trim()) continue;
    const ok = typeof points === "number" && Number.isFinite(points) && points >= 0;
    steps.push(ok ? { text: text.trim(), points } : { text: text.trim() });
  }
  return steps;
}
