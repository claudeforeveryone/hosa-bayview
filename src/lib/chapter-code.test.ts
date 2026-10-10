import { describe, expect, it, vi } from "vitest";
import { clientIp, readChapterGate } from "./chapter-code";

const client = (data: unknown, error: { code?: string; message: string } | null) => ({
  rpc: vi.fn(async () => ({ data, error })),
});

describe("readChapterGate", () => {
  it("reads the gate", async () => {
    expect(await readChapterGate(client(true, null))).toBe(true);
    expect(await readChapterGate(client(false, null))).toBe(false);
  });

  it("is null while migration 0090 isn't applied", async () => {
    expect(await readChapterGate(client(null, { code: "PGRST202", message: "missing" }))).toBeNull();
    expect(await readChapterGate(client(null, { code: "42883", message: "missing" }))).toBeNull();
  });

  it("throws on any other failure", async () => {
    await expect(readChapterGate(client(null, { code: "57014", message: "timeout" }))).rejects.toThrow(/timeout/);
  });
});

describe("clientIp", () => {
  it("takes the first forwarded address, then x-real-ip, else nothing", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("");
  });
});
