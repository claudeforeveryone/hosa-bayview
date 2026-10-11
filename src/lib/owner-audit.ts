// How the owner console's audit log reads one admin_log row (0052): the same verbs and the same hiding rules as the
// log on /admin (src/app/(app)/admin/content.tsx), plus feedback triage (0232). Pure, so the test pins it.
import type { AuditRow } from "./owner-types";

const VERB: Record<string, string> = {
  role: "changed the role of",
  banned: "banned",
  unbanned: "unbanned",
  title: "set the title of",
  warned: "warned",
  removed: "removed",
  passcode: "changed the admin passcode",
  passcode_used: "used the admin passcode, which then cleared",
  chapter_code: "updated the chapter code",
  gif: "changed GIF pictures for",
  feedback: "triaged",
};

export type AuditLine = {
  verb: string;
  // Who or what the change was to, or null when the line reads better without one.
  target: string | null;
  // A triage row: its target ("feedback #1a2b3c4d") links to the feedback list.
  feedback: boolean;
  detail: string;
};

export function auditLine(r: AuditRow): AuditLine {
  const passcode = r.action === "passcode" || r.action === "passcode_used";
  return {
    verb: VERB[r.action] ?? r.action,
    // A passcode claim's target is the claimer, so naming it would repeat the actor.
    target:
      r.target_name && r.action !== "passcode_used" ? r.target_name : null,
    feedback: r.action === "feedback",
    // Passcode rows never show their detail.
    detail: passcode ? "" : (r.detail ?? ""),
  };
}
