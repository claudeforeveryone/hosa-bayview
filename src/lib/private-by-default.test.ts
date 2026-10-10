import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "@/proxy";
import { PUBLIC_PATHS, routeGate } from "./route-gate";

const matcher = new RegExp(`^${config.matcher[0]}$`);
const runsProxy = (path: string) => matcher.test(path);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe("private by default", () => {
  it("only the auth routes are public", () => {
    expect([...PUBLIC_PATHS].sort()).toEqual(["/auth", "/forgot-password", "/login", "/signup"]);
  });

  it("every other page route redirects a guest to login", () => {
    const pages = walk("src/app")
      .map((f) => f.replaceAll(String.fromCharCode(92), "/"))
      .filter((f) => /\/page\.tsx$/.test(f))
      .map((f) => f.replace("src/app", "").replace(/\/page\.tsx$/, "") || "/")
      .map((f) => f.replace(/\/\([^/]+\)/g, "").replace(/\[[^\]]+\]/g, "x") || "/");
    expect(pages.length).toBeGreaterThan(20);
    for (const path of pages) {
      const gate = routeGate(path, "", false);
      const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
      if (isPublic) expect(gate, path).toBeNull();
      else expect(gate, path).not.toBeNull();
    }
    for (const path of ["/reset-password", "/banned", "/events", "/c/x", "/library", "/members/x"]) {
      expect(routeGate(path, "", false), path).not.toBeNull();
    }
  });

  it("the proxy matcher skips only static assets and robots.txt", () => {
    for (const path of ["/", "/login", "/events", "/c/x", "/library", "/api/anything", "/auth/callback", "/members/abc"]) {
      expect(runsProxy(path), path).toBe(true);
    }
    for (const path of ["/_next/static/a.js", "/_next/image", "/favicon.ico", "/robots.txt", "/brand/x.png", "/a.svg"]) {
      expect(runsProxy(path), path).toBe(false);
    }
  });

  it("route handlers outside /auth do not exist", () => {
    const handlers = walk("src/app")
      .map((f) => f.replaceAll(String.fromCharCode(92), "/"))
      .filter((f) => /\/route\.ts$/.test(f));
    expect(handlers.sort()).toEqual([
      "src/app/auth/callback/route.ts",
      "src/app/auth/confirm/route.ts",
      "src/app/auth/signout/route.ts",
    ]);
  });

  it("signed URLs live at most an hour", () => {
    for (const f of ["src/app/(app)/library/queries.ts", "src/lib/avatar-urls.ts"]) {
      const m = readFileSync(f, "utf8").match(/(?:LINK_SECONDS|LIFETIME_SECONDS) = ([\d* ]+);/);
      expect(m, f).not.toBeNull();
      expect(eval(m![1]), f).toBeLessThanOrEqual(3600);
    }
  });
});
