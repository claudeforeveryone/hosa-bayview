import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUDIT_VERB, auditLine } from "./owner-audit";
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

// The search box sits over lines that read "Sample Exec triaged feedback #1a2b3c4d", so owner_audit (0232) has to
// match those verbs, not only the stored action code. The database keeps its own copy in private.audit_verb; this
// pins the two together, so a verb added here and not there (or the reverse) fails.
describe("the log's search", () => {
  const sql = readFileSync(
    fileURLToPath(
      new URL("../../supabase/migrations/0232_owner_console.sql", import.meta.url),
    ),
    "utf8",
  );
  // The body of one function in the migration: what sits between the $$ after its header and the closing $$.
  const fn = (name: string) => {
    const at = sql.indexOf(`create or replace function ${name}(`);
    if (at < 0) return "";
    const open = sql.indexOf("$$", at) + 2;
    return sql.slice(open, sql.indexOf("$$", open));
  };

  it("knows the same verb as the log for every action", () => {
    const pairs = Object.fromEntries(
      [...fn("private.audit_verb").matchAll(/when '([a-z_]+)' then '([^']*)'/g)].map(
        (m) => [m[1], m[2]],
      ),
    );
    expect(pairs).toEqual(AUDIT_VERB);
    expect(pairs.feedback).toBe("triaged");
  });

  it("searches the verb as well as the name, the action code and the detail", () => {
    expect(fn("public.owner_audit")).toMatch(
      /private\.audit_verb\(l\.action\) ilike needle/,
    );
  });
});
