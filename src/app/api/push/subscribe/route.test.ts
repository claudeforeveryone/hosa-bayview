import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  userId: "u1" as string | null | Error,
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getUserId: async () => {
    if (state.userId instanceof Error) throw state.userId;
    return state.userId;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: state.rpc, from: state.from }),
}));

import { DELETE, POST } from "./route";

const SITE = "https://hosa-bayview.vercel.app";
const FCM = "https://fcm.googleapis.com/fcm/send/abc123";
const P256DH = `B${"a".repeat(86)}`;
const AUTH = "a".repeat(22);
const SUB = { endpoint: FCM, keys: { p256dh: P256DH, auth: AUTH } };

function call(
  method: "POST" | "DELETE",
  body: unknown,
  headers: Record<string, string> = { origin: SITE },
) {
  return new Request(`${SITE}/api/push/subscribe`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  state.userId = "u1";
  state.rpc.mockReset();
  state.from.mockReset();
});

describe("POST /api/push/subscribe", () => {
  it("saves the device through the RPC and answers 204", async () => {
    state.rpc.mockResolvedValue({ error: null });
    const res = await POST(call("POST", { ...SUB, sound: false }));
    expect(res.status).toBe(204);
    expect(state.rpc).toHaveBeenCalledWith("push_subscribe", {
      p_endpoint: FCM,
      p_p256dh: P256DH,
      p_auth: AUTH,
      p_sound: false,
    });
  });

  it("defaults the sound setting to on", async () => {
    state.rpc.mockResolvedValue({ error: null });
    await POST(call("POST", SUB));
    expect(state.rpc.mock.calls[0][1].p_sound).toBe(true);
  });

  it("answers 401 to a signed-out browser without touching the database", async () => {
    state.userId = null;
    const res = await POST(call("POST", SUB));
    expect(res.status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("answers 503 when the auth server can't be reached", async () => {
    state.userId = new Error("Auth server unreachable");
    const res = await POST(call("POST", SUB));
    expect(res.status).toBe(503);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses a call from another site", async () => {
    for (const headers of [
      { origin: "https://evil.example" },
      { origin: SITE, "sec-fetch-site": "cross-site" },
    ] as Record<string, string>[]) {
      const res = await POST(call("POST", SUB, headers));
      expect(res.status).toBe(403);
    }
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses a bad endpoint before touching the database", async () => {
    const res = await POST(
      call("POST", { ...SUB, endpoint: "https://evil.example/x" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("That push service is not allowed");
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses a body that isn't JSON", async () => {
    const res = await POST(call("POST", "not json"));
    expect(res.status).toBe(400);
  });

  it("passes the database's device-limit refusal to the browser as 400", async () => {
    state.rpc.mockResolvedValue({
      error: {
        code: "53400",
        message: "This account already has 12 devices with notifications on",
      },
    });
    const res = await POST(call("POST", SUB));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("12 devices");
  });

  it("hides unexpected database errors behind a plain message", async () => {
    state.rpc.mockResolvedValue({
      error: { code: "XX000", message: "internal detail" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(call("POST", SUB));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(
      "Could not save this device. Try again.",
    );
    spy.mockRestore();
  });
});

describe("DELETE /api/push/subscribe", () => {
  it("deletes only this endpoint (RLS keeps it to the member's own rows) and answers 204", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    state.from.mockReturnValue({ delete: () => ({ eq }) });
    const res = await DELETE(call("DELETE", { endpoint: FCM }));
    expect(res.status).toBe(204);
    expect(state.from).toHaveBeenCalledWith("push_subscriptions");
    expect(eq).toHaveBeenCalledWith("endpoint", FCM);
  });

  it("answers 401 to a signed-out browser", async () => {
    state.userId = null;
    const res = await DELETE(call("DELETE", { endpoint: FCM }));
    expect(res.status).toBe(401);
    expect(state.from).not.toHaveBeenCalled();
  });

  it("refuses an endpoint off the allowlist", async () => {
    const res = await DELETE(
      call("DELETE", { endpoint: "http://fcm.googleapis.com/x" }),
    );
    expect(res.status).toBe(400);
    expect(state.from).not.toHaveBeenCalled();
  });
});
