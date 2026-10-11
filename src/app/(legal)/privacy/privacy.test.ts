import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { POLICY_COVERS } from "@/lib/legal";
import { SETTINGS_TABS } from "@/lib/settings-tabs";
import PrivacyPage from "./page";
import { PrivacyPolicy } from "./policy";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

// Every migration in this tree, comments dropped, so a comment that mentions a table doesn't count as creating it.
const MIGRATIONS = "supabase/migrations";
const schema = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8").replace(/--.*$/gm, ""))
  .join("\n");
const createsTable = (name: string) =>
  new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${name}\\b`,
    "i",
  ).test(schema);

// The policy describes features other tracks add only while they're in the tree. Merging one of those tracks (or this
// page into a tree that has them) fails here until the matching flag is flipped, so the live policy never describes
// data the site doesn't collect, and never leaves out data it does.
describe("privacy policy covers what this tree collects", () => {
  it.each([
    ["phoneApp", "push_subscriptions", "push notifications (hosa-pwa, 0220)"],
    ["usageCounts", "analytics_events", "usage counts (hosa-owner, 0230)"],
    ["feedback", "feedback", "the feedback form (hosa-owner, 0231)"],
  ] as const)(
    "POLICY_COVERS.%s is on exactly when the tree creates public.%s",
    (flag, table, feature) => {
      const inTree = createsTable(table);
      const fix = inTree
        ? `This tree has ${feature}, but /privacy doesn't describe it. Set POLICY_COVERS.${flag} to true in src/lib/legal.ts, and change LEGAL_EFFECTIVE if the policy is already live.`
        : `/privacy describes ${feature}, which isn't in this tree. Set POLICY_COVERS.${flag} to false in src/lib/legal.ts.`;
      expect(POLICY_COVERS[flag], fix).toBe(inTree);
    },
  );

  it("only sends members to Settings tabs that exist", () => {
    const page = text(renderToStaticMarkup(createElement(PrivacyPage)));
    const named = [
      ...page.matchAll(/in Settings, ([A-Z][a-z]*(?: [a-z]+)*)/g),
    ].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    const labels = SETTINGS_TABS.map((t) => t.label);
    for (const label of named)
      expect(labels, `Settings, ${label}`).toContain(label);
  });
});

const ALL = [false, true].flatMap((phoneApp) =>
  [false, true].flatMap((usageCounts) =>
    [false, true].map((feedback) => ({ phoneApp, usageCounts, feedback })),
  ),
);
const policy = (covers: (typeof ALL)[number]) =>
  text(renderToStaticMarkup(createElement(PrivacyPolicy, { covers })));

describe("privacy policy text, for every mix of features", () => {
  it.each(ALL)("%o reads as whole sentences", (covers) => {
    const page = policy(covers);
    expect(page).not.toMatch(/ ,|,\.|\.\.| \.|\bundefined\b|\bfalse\b/);
  });

  it.each(ALL)("%o describes push only with the phone app", (covers) => {
    const page = policy(covers);
    expect(/push/i.test(page)).toBe(covers.phoneApp);
    expect(page.includes("Settings, Phone app")).toBe(covers.phoneApp);
    // Without push, the bell is the only kind of notice, and it can't be switched off.
    expect(page.includes("(the bell) can't be turned off")).toBe(
      !covers.phoneApp,
    );
  });

  it.each(ALL)(
    "%o lists usage counts and their 13 months only with them",
    (covers) => {
      const page = policy(covers);
      expect(page.includes("Usage counts.")).toBe(covers.usageCounts);
      expect(page.includes("Usage counts: 13 months.")).toBe(
        covers.usageCounts,
      );
      expect(page.includes("count usage")).toBe(covers.usageCounts);
    },
  );

  it.each(ALL)("%o names feedback only with the form", (covers) => {
    expect(policy(covers).includes("feedback you send us")).toBe(
      covers.feedback,
    );
  });

  // A list whose items contain "and" needs the comma before its last "and", or "files and links and questions" reads
  // as one item.
  it.each(ALL)("%o keeps the serial comma in its lists", (covers) => {
    const page = policy(covers);
    expect(page).toContain(
      covers.feedback
        ? "files and links, questions you send with Ask teacher, and feedback you send us."
        : "files and links, and questions you send with Ask teacher.",
    );
    if (covers.usageCounts)
      expect(page).toContain(
        "send you notices, keep the site safe, and count usage so we know what to fix.",
      );
  });

  // The phone app sends the phone's platform (android, ios or other) with its install events, stored next to the
  // account (0230). So the page may never say usage counts leave out device details, and it says the platform is kept
  // whenever both features are in.
  it.each(ALL)("%o is honest about the phone platform", (covers) => {
    const page = policy(covers);
    expect(page).not.toMatch(/device details/);
    expect(page.includes("Android or iPhone")).toBe(
      covers.phoneApp && covers.usageCounts,
    );
    if (covers.usageCounts)
      expect(page).toContain("your browser or device model");
  });

  // Housekeeping (the picture sweep) is off until the owner approves it, and an in-app removal on 2026-10-09 left its
  // picture file behind. So the page can't promise every deleted account's picture is gone.
  it.each(ALL)(
    "%o doesn't promise every deleted account's picture is erased",
    (covers) => {
      const page = policy(covers);
      expect(page).not.toMatch(/its picture is erased\./i);
      expect(page).toContain("we check that the picture is gone");
    },
  );
});
