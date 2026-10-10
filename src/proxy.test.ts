import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let signedIn = false;
let refresh = false;
let outage = false;

// Fake SSR client: optionally "refreshes" the session by writing a cookie plus no-store headers.
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _u: string,
    _k: string,
    { cookies }: { cookies: { setAll: (c: { name: string; value: string; options: object }[], h: Record<string, string>) => void } },
  ) => ({
    auth: {
      getClaims: async () => {
        if (refresh) {
          cookies.setAll([{ name: "sb-token", value: "fresh", options: { path: "/" } }], {
            "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
          });
        }
        if (outage) {
          const { AuthRetryableFetchError } = await import("@supabase/supabase-js");
          return { data: null, error: new AuthRetryableFetchError("fetch failed", 0) };
        }
        return { data: signedIn ? { claims: { sub: "u1" } } : null, error: null };
      },
    },
  }),
}));

const { proxy } = await import("./proxy");
const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);

describe("proxy", () => {
  beforeEach(() => {
    signedIn = false;
    refresh = false;
    outage = false;
  });

  it("redirects guests to login with next", async () => {
    signedIn = false;
    refresh = false;
    const res = await proxy(req("/profile"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fprofile");
  });

  it("carries refreshed cookies and no-store headers onto redirects", async () => {
    signedIn = true;
    refresh = true;
    const res = await proxy(req("/login"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
    expect(res.cookies.get("sb-token")?.value).toBe("fresh");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("doesn't bounce anyone to login when the auth server is unreachable", async () => {
    outage = true;
    const res = await proxy(req("/profile"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes signed-in requests through with refreshed cookies", async () => {
    signedIn = true;
    refresh = true;
    const res = await proxy(req("/"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get("sb-token")?.value).toBe("fresh");
  });

  it("sends a nonce CSP on pass-through, redirect and outage responses", async () => {
    signedIn = true;
    for (const [path, flag] of [["/", "pass"], ["/login", "redirect"], ["/profile", "outage"]] as const) {
      outage = flag === "outage";
      const res = await proxy(req(path));
      const csp = res.headers.get("content-security-policy") ?? "";
      expect(csp, flag).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
      expect(csp, flag).toContain("frame-ancestors 'none'");
    }
  });

  it("hands Next.js the same nonce it sent the browser", async () => {
    signedIn = true;
    const res = await proxy(req("/"));
    const sent = /'nonce-([^']+)'/.exec(res.headers.get("content-security-policy") ?? "")?.[1];
    // NextResponse.next({ request }) forwards overridden request headers as x-middleware-request-*.
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(sent);
    expect(res.headers.get("x-middleware-request-content-security-policy")).toContain(`'nonce-${sent}'`);
  });

  it("uses a new nonce for every request", async () => {
    signedIn = true;
    const a = (await proxy(req("/"))).headers.get("content-security-policy");
    const b = (await proxy(req("/"))).headers.get("content-security-policy");
    expect(a).not.toBe(b);
  });
});
