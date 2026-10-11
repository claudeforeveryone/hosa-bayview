import { describe, expect, it } from "vitest";
import { readError, sameServerKey, urlBase64ToUint8Array } from "./client";

// 65 bytes, as an uncompressed P-256 public key: 0x04 then 64 bytes.
const BYTES = new Uint8Array([4, ...Array.from({ length: 64 }, (_, i) => (i * 7) % 256)]);
const KEY = Buffer.from(BYTES).toString("base64url");

describe("urlBase64ToUint8Array", () => {
  it("decodes an unpadded base64url VAPID key to its 65 bytes", () => {
    expect(KEY).not.toContain("=");
    expect([...urlBase64ToUint8Array(KEY)]).toEqual([...BYTES]);
  });
});

describe("sameServerKey", () => {
  it("matches a subscription made with the same key", () => {
    expect(sameServerKey(BYTES.slice().buffer, KEY)).toBe(true);
  });

  it("spots a subscription from an older key, or none at all", () => {
    const other = BYTES.slice();
    other[10] ^= 1;
    expect(sameServerKey(other.buffer, KEY)).toBe(false);
    expect(sameServerKey(null, KEY)).toBe(false);
    expect(sameServerKey(new Uint8Array(3).buffer, KEY)).toBe(false);
  });
});

describe("readError", () => {
  it("uses the server's message when there is one", async () => {
    const res = new Response(JSON.stringify({ error: "That push service is not allowed" }), { status: 400 });
    expect(await readError(res, "fallback")).toBe("That push service is not allowed");
  });

  it("falls back for an empty or non-JSON answer", async () => {
    expect(await readError(new Response("<html>", { status: 500 }), "fallback")).toBe("fallback");
    expect(await readError(new Response(null, { status: 502 }), "fallback")).toBe("fallback");
  });
});
