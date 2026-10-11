import { describe, expect, it } from "vitest";
import { auditLine } from "./owner-audit";
import type { AuditRow } from "./owner-types";

const row = (action: string, target_name = "", detail = ""): AuditRow => ({
  id: 1,
  created_at: "2026-10-11T12:00:00Z",
  actor_name: "Sample Exec",
  action,
  target_name,
  detail,
});

// One line of the owner console's audit log, read the way /admin reads the same rows.
describe("auditLine", () => {
  it("names who was changed for a role change, with its detail", () => {
    expect(
      auditLine(row("role", "Sample Member", "trainee to trainer")),
    ).toEqual({
      verb: "changed the role of",
      target: "Sample Member",
      feedback: false,
      detail: "trainee to trainer",
    });
  });

  // A passcode claim names the claimer as its target, so the line would read "X used the admin passcode X".
  it("leaves the target off a passcode claim, and never shows a passcode row's detail", () => {
    expect(
      auditLine(row("passcode_used", "Sample Exec", "secret-ish")),
    ).toEqual({
      verb: "used the admin passcode, which then cleared",
      target: null,
      feedback: false,
      detail: "",
    });
    expect(auditLine(row("passcode", "", "new code")).detail).toBe("");
  });

  it("marks a triage row so it can link to the feedback", () => {
    expect(
      auditLine(row("feedback", "feedback #1a2b3c4d", "status new to done")),
    ).toEqual({
      verb: "triaged",
      target: "feedback #1a2b3c4d",
      feedback: true,
      detail: "status new to done",
    });
  });

  it("falls back to the raw action for one it doesn't know, and to no target when there is none", () => {
    expect(auditLine(row("something_new"))).toEqual({
      verb: "something_new",
      target: null,
      feedback: false,
      detail: "",
    });
  });
});
