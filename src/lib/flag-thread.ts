// One member's Ask teacher thread on one question (question_flags, one per member per question), and the rules the
// Ask teacher / Report this question buttons follow. They copy migration 0231, which decides for real:
// - a report is an ask with a reason (wrong key, unclear, typo, something else);
// - while a report is open there is no Ask: Change report holds the note, so adding words never quietly turns the
//   report back into a plain question (and the database keeps the report on an ask anyway);
// - after the trainer replies, asking again stays closed, but a report can reopen the thread, and the database keeps
//   the trainer's last reply on it, shown as the earlier reply until they answer again.
// Pure, so flag-thread.test.ts pins the rules apart from the component.
import type { FlagReason, ReportReason } from "./flag-reasons";

export type FlagState = {
  id: string;
  note: string;
  status: "open" | "answered";
  reply: string;
  reason: FlagReason;
};

export type ThreadButtons = {
  ask: "Ask teacher" | "Ask again" | null;
  report: "Report this question" | "Change report" | "Report again" | null;
};

// Which buttons show under the question. `canReport`: reports are on the database (0231); a report already on the
// thread proves they are, whatever the probe said.
export function threadButtons(
  current: FlagState | null,
  canReport: boolean,
): ThreadButtons {
  const reported = current !== null && current.reason !== "ask";
  const answered = current?.status === "answered";
  const report = canReport || reported;
  return {
    ask: reported || answered ? null : current ? "Ask again" : "Ask teacher",
    report: !report
      ? null
      : reported
        ? answered
          ? "Report again"
          : "Change report"
        : "Report this question",
  };
}

// The thread as the database leaves it after an accepted send, so the page can show it without a reload.
export function afterSend(
  current: FlagState | null,
  sent: {
    id: string;
    mode: "ask" | "report";
    reason: ReportReason | null;
    note: string;
  },
): FlagState {
  const reported = current && current.reason !== "ask" ? current.reason : null;
  return {
    id: sent.id,
    note: sent.note.trim(),
    status: "open",
    // The database keeps the trainer's last reply on a reopened thread (0231).
    reply: current?.reply ?? "",
    // An ask on an open report keeps the report (0231).
    reason:
      sent.mode === "report" && sent.reason ? sent.reason : (reported ?? "ask"),
  };
}
