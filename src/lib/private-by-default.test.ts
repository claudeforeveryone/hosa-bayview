import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "@/proxy";
import { AVATAR_LINK_SECONDS, MATERIAL_LINK_SECONDS } from "./link-lifetimes";
import {
  EXACT_PUBLIC_PATHS,
  isPublicPath,
  PUBLIC_PATHS,
  routeGate,
} from "./route-gate";

const matcher = new RegExp(`^${config.matcher[0]}$`);
const runsProxy = (path: string) => matcher.test(path);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe("private by default", () => {
  it("only the auth routes and a few exact paths are public", () => {
    expect([...PUBLIC_PATHS].sort()).toEqual([
      "/auth",
      "/forgot-password",
      "/login",
      "/signup",
    ]);
    // Each exact path is public for a stated reason: keepalive (cron), push delivery (database, secret checked in
    // the route), and the install/offline files that must load before sign-in.
    expect(EXACT_PUBLIC_PATHS).toEqual([
      "/api/keepalive",
      "/api/push/deliver",
      "/manifest.webmanifest",
      "/sw.js",
      "/offline",
    ]);
  });

  it("every other page route redirects a guest to login", () => {
    const pages = walk("src/app")
      .map((f) => f.replaceAll(String.fromCharCode(92), "/"))
      .filter((f) => /\/page\.tsx$/.test(f))
      .map((f) => f.replace("src/app", "").replace(/\/page\.tsx$/, "") || "/")
      .map(
        (f) => f.replace(/\/\([^/]+\)/g, "").replace(/\[[^\]]+\]/g, "x") || "/",
      );
    expect(pages.length).toBeGreaterThan(20);
    for (const path of pages) {
      const gate = routeGate(path, "", false);
      const isPublic = isPublicPath(path);
      if (isPublic) expect(gate, path).toBeNull();
      else expect(gate, path).not.toBeNull();
    }
    for (const path of [
      "/reset-password",
      "/banned",
      "/events",
      "/c/x",
      "/library",
      "/members/x",
      "/files/x",
    ]) {
      expect(routeGate(path, "", false), path).not.toBeNull();
    }
  });

  it("the proxy matcher skips only static assets and robots.txt", () => {
    for (const path of [
      "/",
      "/login",
      "/events",
      "/c/x",
      "/library",
      "/api/anything",
      "/auth/callback",
      "/members/abc",
      "/files/abc",
    ]) {
      expect(runsProxy(path), path).toBe(true);
    }
    for (const path of [
      "/_next/static/a.js",
      "/_next/image",
      "/favicon.ico",
      "/robots.txt",
      "/brand/x.png",
      "/a.svg",
    ]) {
      expect(runsProxy(path), path).toBe(false);
    }
  });

  it("route handlers are only /auth, /api/keepalive, the push pair (deliver is secret-checked, subscribe is session-checked) and the session-checked /files/[id]", () => {
    const handlers = walk("src/app")
      .map((f) => f.replaceAll(String.fromCharCode(92), "/"))
      .filter((f) => /\/route\.ts$/.test(f));
    expect(handlers.sort()).toEqual([
      "src/app/api/keepalive/route.ts",
      "src/app/api/push/deliver/route.ts",
      "src/app/api/push/subscribe/route.ts",
      "src/app/auth/callback/route.ts",
      "src/app/auth/confirm/route.ts",
      "src/app/auth/signout/route.ts",
      "src/app/files/[id]/route.ts",
    ]);
  });

  it("signed URLs are short: material links a minute (signed per click), avatars an hour", () => {
    expect(MATERIAL_LINK_SECONDS).toBeLessThanOrEqual(60);
    expect(AVATAR_LINK_SECONDS).toBeLessThanOrEqual(3600);
  });

  it("storage code takes its lifetimes from link-lifetimes", () => {
    expect(readFileSync("src/app/files/[id]/route.ts", "utf8")).toContain(
      "= MATERIAL_LINK_SECONDS;",
    );
    expect(readFileSync("src/lib/avatar-urls.ts", "utf8")).toContain(
      "= AVATAR_LINK_SECONDS;",
    );
  });

  it("pages never pre-sign material links; they open through /files/<id>", () => {
    const sources = walk("src")
      .map((f) => f.replaceAll(String.fromCharCode(92), "/"))
      .filter(
        (f) =>
          /\.tsx?$/.test(f) &&
          !f.endsWith(".test.ts") &&
          f !== "src/app/files/[id]/route.ts",
      );
    for (const f of sources) {
      const text = readFileSync(f, "utf8");
      if (
        /from\(["']materials["']\)\s*\.createSignedUrls?\(/.test(
          text.replace(/\s+/g, " "),
        )
      ) {
        throw new Error(`${f} signs material links; use materialHref`);
      }
    }
  });
});
