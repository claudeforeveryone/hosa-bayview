import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "./csp";

const SUPABASE = "https://abc.supabase.co";

function directives(csp: string) {
  return new Map(
    csp.split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values] as const;
    }),
  );
}

describe("buildCsp", () => {
  it("allows only nonce'd scripts (plus what they load) in production", () => {
    const d = directives(
      buildCsp("n0nce", { dev: false, supabaseUrl: SUPABASE }),
    );
    expect(d.get("script-src")).toEqual([
      "'self'",
      "'nonce-n0nce'",
      "'strict-dynamic'",
    ]);
  });

  it("adds unsafe-eval only in development", () => {
    const d = directives(
      buildCsp("n0nce", { dev: true, supabaseUrl: SUPABASE }),
    );
    expect(d.get("script-src")).toContain("'unsafe-eval'");
    const prod = directives(
      buildCsp("n0nce", { dev: false, supabaseUrl: SUPABASE }),
    );
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("lets the app reach Supabase for data, uploads and signed images", () => {
    const d = directives(buildCsp("n", { dev: false, supabaseUrl: SUPABASE }));
    expect(d.get("connect-src")).toEqual([
      "'self'",
      SUPABASE,
      "wss://abc.supabase.co",
    ]);
    expect(d.get("img-src")).toContain(SUPABASE);
  });

  it("blocks framing, plugins, base hijacks and off-site form posts", () => {
    const d = directives(buildCsp("n", { dev: false, supabaseUrl: SUPABASE }));
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("object-src")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'self'"]);
    expect(d.get("form-action")).toEqual(["'self'"]);
  });

  it("drops a missing or malformed Supabase URL instead of emitting junk", () => {
    const d = directives(
      buildCsp("n", { dev: false, supabaseUrl: "not a url" }),
    );
    expect(d.get("connect-src")).toEqual(["'self'"]);
    const none = directives(
      buildCsp("n", { dev: false, supabaseUrl: undefined }),
    );
    expect(none.get("img-src")).toEqual(["'self'", "blob:", "data:"]);
  });
});

describe("newNonce", () => {
  it("is fresh base64 every call", () => {
    const a = newNonce();
    const b = newNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
