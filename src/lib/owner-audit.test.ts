import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUDIT_VERB, auditLine } from "./owner-audit";
import { PRIORITY_LABEL, STATUS_LABEL } from "./owner-metrics";
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
      auditLine(row("feedback", "feedback #1a2b3c4d", "status New to Done")),
    ).toEqual({
      verb: "triaged",
      target: "feedback #1a2b3c4d",
      feedback: true,
      detail: "status New to Done",
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
      new URL(
        "../../supabase/migrations/0232_owner_console.sql",
        import.meta.url,
      ),
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
      [
        ...fn("private.audit_verb").matchAll(
          /when '([a-z_]+)' then '([^']*)'/g,
        ),
      ].map((m) => [m[1], m[2]]),
    );
    expect(pairs).toEqual(AUDIT_VERB);
    expect(pairs.feedback).toBe("triaged");
  });

  it("searches the verb as well as the name, the action code and the detail", () => {
    expect(fn("public.owner_audit")).toMatch(
      /private\.audit_verb\(l\.action\) ilike needle/,
    );
  });

  // admin_log's own policy is "executives read" (0052): ban reasons, warnings, former roles. A stats viewer who
  // isn't an executive is refused before the query (owner_console.sql checks the refusal on a real database).
  it("is for executive viewers only, checked before the log is read", () => {
    const body = fn("public.owner_audit");
    const guard = body.indexOf("if not private.is_executive() then");
    expect(guard).toBeGreaterThan(
      body.indexOf("private.require_stats_viewer()"),
    );
    expect(guard).toBeLessThan(body.indexOf("from public.admin_log"));
    expect(body.slice(guard, guard + 160)).toMatch(/errcode = '42501'/);
  });
});

// Triage lines say what the chips say ("status Planned to Won't fix"), so the log never shows a code like wont_fix
// and a search for the words finds the line. private.triage_label is the database's copy of the two label maps.
describe("triage lines in the log", () => {
  const sql = readFileSync(
    fileURLToPath(
      new URL(
        "../../supabase/migrations/0232_owner_console.sql",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const at = sql.indexOf("create or replace function private.triage_label(");
  const open = sql.indexOf("$$", at) + 2;
  const body = sql.slice(open, sql.indexOf("$$", open));

  it("uses the console's words for every status and priority", () => {
    const pairs = Object.fromEntries(
      [...body.matchAll(/when '([a-z_]+)' then '((?:[^']|'')*)'/g)].map((m) => [
        m[1],
        m[2].replaceAll("''", "'"),
      ]),
    );
    expect(at).toBeGreaterThan(-1);
    expect(pairs).toEqual({ ...STATUS_LABEL, ...PRIORITY_LABEL });
    expect(pairs.wont_fix).toBe("Won't fix");
  });

  it("writes the words, never the codes, into the detail", () => {
    const triage = sql.slice(
      sql.indexOf("create or replace function public.owner_triage_feedback("),
    );
    const lines = triage
      .slice(0, triage.indexOf("$$;", triage.indexOf("$$") + 2))
      .split(/\r?\n/);
    const status = lines.find((l) => l.includes("'status '"));
    const priority = lines.findIndex((l) => l.includes("'priority '"));
    expect(status).toContain("private.triage_label(before_row.status)");
    expect(status).toContain("private.triage_label(p_status)");
    expect(lines.slice(priority, priority + 2).join(" ")).toMatch(
      /private\.triage_label\(before_row\.priority\).*private\.triage_label\(p_priority\)/,
    );
  });
});
