import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SystemInfo } from "@/lib/owner-types";
import { SystemSection } from "./system";

// System health as the owner sees it. Each fact once: the headline Build figure carries the commit, environment
// and branch, so the rows under it only add what it doesn't say.

const INFO: SystemInfo = {
  deployment: {
    commit: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    branch: "main",
    environment: "production",
    repo: "sample-owner/sample-repo",
  },
  db: "up",
  latencyMs: 42,
  data: null,
};
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
const count = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

describe("SystemSection", () => {
  it("says the build, environment and branch once each", () => {
    const out = text(
      renderToStaticMarkup(createElement(SystemSection, { info: INFO })),
    );
    expect(count(out, "a1b2c3d")).toBe(1);
    expect(count(out, "production")).toBe(1);
    expect(count(out, "main")).toBe(1);
  });

  it("links the commit on GitHub from the Build figure", () => {
    const out = renderToStaticMarkup(
      createElement(SystemSection, { info: INFO }),
    );
    expect(out).toContain(
      'href="https://github.com/sample-owner/sample-repo/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"',
    );
  });

  it("keeps the database clock and the server-errors pointer", () => {
    const out = text(
      renderToStaticMarkup(createElement(SystemSection, { info: INFO })),
    );
    expect(out).toContain("Database clock");
    expect(out).toContain(
      "Server errors Read them in the host's runtime logs. Not stored",
    );
  });
});
