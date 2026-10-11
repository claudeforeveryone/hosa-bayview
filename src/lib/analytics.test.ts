import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TAXONOMY, TRACKED_EVENTS, isTracked } from "./analytics";

describe("isTracked", () => {
  it("accepts a stored event with a code from its list", () => {
    expect(isTracked("resource_opened", "file")).toBe(true);
    expect(isTracked("vocab_session_completed", "career")).toBe(true);
    expect(isTracked("push_enabled", "ios")).toBe(true);
  });

  it("refuses codes off the list, missing codes and names a table already records", () => {
    expect(isTracked("resource_opened", "video")).toBe(false);
    expect(isTracked("push_enabled", null)).toBe(false);
    expect(isTracked("practice_started", "deck")).toBe(false);
    expect(isTracked("page_view", "file")).toBe(false);
  });
});

describe("the taxonomy", () => {
  it("names all fourteen shared events once", () => {
    expect(TAXONOMY.map((t) => t.event)).toEqual([
      "account_created",
      "onboarding_completed",
      "event_selected",
      "practice_started",
      "practice_completed",
      "exam_completed",
      "vocab_session_completed",
      "resource_opened",
      "duel_started",
      "duel_completed",
      "feedback_submitted",
      "install_prompt_shown",
      "app_installed",
      "push_enabled",
    ]);
  });

  it("stores only the events no table records", () => {
    expect(Object.keys(TRACKED_EVENTS).sort()).toEqual([
      "app_installed",
      "install_prompt_shown",
      "push_enabled",
      "resource_opened",
      "vocab_session_completed",
    ]);
  });

  // The database refuses anything else (0230 analytics_code_ok), so the two lists must say the same thing.
  it("matches migration 0230 name for name and code for code", () => {
    const sql = readFileSync(
      fileURLToPath(
        new URL(
          "../../supabase/migrations/0230_analytics_events.sql",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    const fromSql: Record<string, string[]> = {};
    for (const m of sql.matchAll(
      /when '([a-z_]+)' then p_code in \(([^)]*)\)/g,
    )) {
      fromSql[m[1]] = [...m[2].matchAll(/'([a-z]+)'/g)].map((c) => c[1]);
    }
    expect(fromSql).toEqual(
      Object.fromEntries(
        Object.entries(TRACKED_EVENTS).map(([k, v]) => [k, [...v]]),
      ),
    );
  });
});
