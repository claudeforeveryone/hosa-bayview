import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  config: null as null | {
    publicKey: string;
    privateKey: string;
    subject: string;
    internalSecret: string;
  },
  outboxSecret: null as string | null,
  drain: vi.fn(),
}));

vi.mock("@/lib/push/config", () => ({ pushConfig: () => state.config }));
vi.mock("@/lib/push/outbox", () => ({
  supabaseOutbox: (secret: string) => {
    state.outboxSecret = secret;
    return { claim: vi.fn(), report: vi.fn() };
  },
}));
vi.mock("@/lib/push/sender", () => ({ makeSender: () => vi.fn() }));
vi.mock("@/lib/push/deliver", () => ({ drainOutbox: state.drain }));

import { POST } from "./route";

const SECRET = "internal-secret-for-tests-0123456789abc";

function request(headers: Record<string, string> = {}) {
  return new Request("https://hosa-bayview.vercel.app/api/push/deliver", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: "{}",
  });
}

describe("POST /api/push/deliver", () => {
  beforeEach(() => {
    state.config = {
      publicKey: "BPub",
      privateKey: "priv",
      subject: "mailto:a@b.co",
      internalSecret: SECRET,
    };
    state.outboxSecret = null;
    state.drain.mockReset();
  });

  it("answers 503 and does nothing while push is not set up", async () => {
    state.config = null;
    const res = await POST(request({ "x-push-secret": SECRET }));
    expect(res.status).toBe(503);
    expect(state.drain).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong secret before touching the queue", async () => {
    for (const headers of [
      {},
      { "x-push-secret": "wrong" },
      { "x-push-secret": `${SECRET}x` },
    ]) {
      const res = await POST(request(headers));
      expect(res.status).toBe(401);
    }
    expect(state.drain).not.toHaveBeenCalled();
    expect(state.outboxSecret).toBeNull();
  });

  it("drains the queue with the configured secret and reports the counts", async () => {
    state.drain.mockResolvedValueOnce({
      notifications: 2,
      sent: 3,
      failed: 0,
      removed: 1,
    });
    const res = await POST(request({ "x-push-secret": SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      notifications: 2,
      sent: 3,
      failed: 0,
      removed: 1,
    });
    expect(state.outboxSecret).toBe(SECRET);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 500 without details when delivery breaks", async () => {
    state.drain.mockRejectedValueOnce(
      new Error("push_claim failed: 42501 Not allowed"),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(request({ "x-push-secret": SECRET }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Delivery failed" });
    spy.mockRestore();
  });
});
