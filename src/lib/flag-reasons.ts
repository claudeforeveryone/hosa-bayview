// Why a member flagged a question (question_flags.reason, migration 0231). 'ask' is the plain Ask teacher that
// every flag was before 0231; the other four are "Report this question". Pure, so both sides of the flag list
// (the member's review and the trainer's list) and the tests read the same words.

export const FLAG_REASONS = [
  "ask",
  "wrong_answer",
  "unclear",
  "typo",
  "other",
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export const REPORT_REASONS = [
  "wrong_answer",
  "unclear",
  "typo",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

// Same words as private.flag_reason_label, which writes the trainer's notification.
const LABEL: Record<ReportReason, string> = {
  wrong_answer: "Wrong answer key",
  unclear: "Unclear wording",
  typo: "Typo",
  other: "Something else",
};

export function reasonLabel(reason: ReportReason): string {
  return LABEL[reason];
}

// A database without 0231 has no reason column; those flags, and anything unexpected, are plain questions.
export function flagReason(value: unknown): FlagReason {
  return typeof value === "string" &&
    (FLAG_REASONS as readonly string[]).includes(value)
    ? (value as FlagReason)
    : "ask";
}

export function isReportReason(value: unknown): value is ReportReason {
  return (
    typeof value === "string" &&
    (REPORT_REASONS as readonly string[]).includes(value)
  );
}

export const REPORT_NOTE_MAX = 500;

// The checks report_question makes, for the form. Null when the input is fine.
export function checkReport(reason: string, note: string): string | null {
  if (!isReportReason(reason)) return "Pick what is wrong with the question.";
  if (note.trim().length > REPORT_NOTE_MAX)
    return `Keep the note under ${REPORT_NOTE_MAX} characters.`;
  return null;
}
