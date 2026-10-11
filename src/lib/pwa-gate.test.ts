import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";
import { routeGate } from "./route-gate";

function directives(csp: string) {
  return new Map(
    csp.split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values] as const;
    }),
  );
}

describe("PWA files and push delivery reach guests", () => {
  it("lets a signed-out phone fetch the manifest, service worker and offline page", () => {
    for (const path of ["/manifest.webmanifest", "/sw.js", "/offline"]) {
      expect(routeGate(path, "", false), path).toBeNull();
    }
  });

  it("lets the database's push call through without a session (the route checks its secret)", () => {
    expect(routeGate("/api/push/deliver", "", false)).toBeNull();
  });

  it("keeps the subscribe route and lookalike paths behind sign-in", () => {
    expect(routeGate("/api/push/subscribe", "", false)).not.toBeNull();
    expect(routeGate("/api/push/deliver/x", "", false)).not.toBeNull();
    expect(routeGate("/sw.js/x", "", false)).not.toBeNull();
    expect(routeGate("/offlinex", "", false)).not.toBeNull();
  });
});

describe("CSP for the service worker", () => {
  it("names the worker and manifest sources, so 'strict-dynamic' cannot block them", () => {
    const d = directives(
      buildCsp("n", { dev: false, supabaseUrl: "https://abc.supabase.co" }),
    );
    expect(d.get("worker-src")).toEqual(["'self'"]);
    expect(d.get("manifest-src")).toEqual(["'self'"]);
    expect(d.get("script-src")).toContain("'strict-dynamic'");
  });
});
