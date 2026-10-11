import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, currentEdge, readChapterGate } from "./chapter-code";

const client = (
  data: unknown,
  error: { code?: string; message: string } | null,
) => ({
  rpc: vi.fn(async () => ({ data, error })),
});

describe("readChapterGate", () => {
  it("reads the gate", async () => {
    expect(await readChapterGate(client(true, null))).toBe(true);
    expect(await readChapterGate(client(false, null))).toBe(false);
  });

  it("is null while migration 0090 isn't applied", async () => {
    expect(
      await readChapterGate(
        client(null, { code: "PGRST202", message: "missing" }),
      ),
    ).toBeNull();
    expect(
      await readChapterGate(
        client(null, { code: "42883", message: "missing" }),
      ),
    ).toBeNull();
  });

  it("throws on any other failure", async () => {
    await expect(
      readChapterGate(client(null, { code: "57014", message: "timeout" })),
    ).rejects.toThrow(/timeout/);
  });
});

describe("clientIp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("on Vercel takes the first forwarded address, then x-real-ip, else nothing", () => {
    expect(
      clientIp(
        new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }),
        "vercel",
      ),
    ).toBe("203.0.113.7");
    expect(
      clientIp(new Headers({ "x-real-ip": "198.51.100.2" }), "vercel"),
    ).toBe("198.51.100.2");
    expect(clientIp(new Headers(), "vercel")).toBe("");
  });

  it("on Vercel ignores a cf-connecting-ip the client made up", () => {
    const h = new Headers({
      "cf-connecting-ip": "192.0.2.99",
      "x-forwarded-for": "203.0.113.7",
    });
    expect(clientIp(h, "vercel")).toBe("203.0.113.7");
  });

  it("on Cloudflare takes cf-connecting-ip and ignores x-forwarded-for, which the client can seed", () => {
    // Cloudflare appends to a client-supplied x-forwarded-for, so its first entry is whatever the client sent.
    const h = new Headers({
      "x-forwarded-for": "192.0.2.99, 203.0.113.7",
      "cf-connecting-ip": " 203.0.113.7 ",
    });
    expect(clientIp(h, "cloudflare")).toBe("203.0.113.7");
    expect(
      clientIp(
        new Headers({
          "x-forwarded-for": "192.0.2.99",
          "x-real-ip": "192.0.2.98",
        }),
        "cloudflare",
      ),
    ).toBe("");
  });

  it("caps the address at 100 characters", () => {
    expect(
      clientIp(
        new Headers({ "cf-connecting-ip": "a".repeat(150) }),
        "cloudflare",
      ),
    ).toHaveLength(100);
  });

  it("works out the platform from the runtime when not told", () => {
    const h = new Headers({
      "x-forwarded-for": "192.0.2.99",
      "cf-connecting-ip": "203.0.113.7",
    });
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    expect(currentEdge()).toBe("cloudflare");
    expect(clientIp(h)).toBe("203.0.113.7");
    vi.stubGlobal("navigator", { userAgent: "Node.js/22" });
    expect(currentEdge()).toBe("vercel");
    expect(clientIp(h)).toBe("192.0.2.99");
    vi.stubGlobal("navigator", undefined);
    expect(currentEdge()).toBe("vercel");
  });
});
