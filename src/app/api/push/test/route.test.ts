import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  userId: "u1" as string | null,
  config: { publicKey: "B", privateKey: "p", subject: "mailto:a@b.co", internalSecret: "s" } as object | null,
  owned: true,
  send: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getUserId: async () => state.userId }));
vi.mock("@/lib/push/config", () => ({ pushConfig: () => state.config }));
vi.mock("@/lib/push/sender", () => ({ makeSender: () => state.send }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => {
          state.eq(col, val);
          return {
            maybeSingle: async () => ({ data: state.owned ? { endpoint: val } : null, error: null }),
          };
        },
      }),
    }),
  }),
}));

import { POST } from "./route";

const SITE = "https://hosa-bayview.vercel.app";
const FCM = "https://fcm.googleapis.com/fcm/send/abc123";
const SUB = { endpoint: FCM, keys: { p256dh: `B${"a".repeat(86)}`, auth: "a".repeat(22) } };

const call = (body: unknown = SUB, headers: Record<string, string> = { origin: SITE }) =>
  POST(
    new Request(`${SITE}/api/push/test`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.userId = "u1";
  state.config = { publicKey: "B", privateKey: "p", subject: "mailto:a@b.co", internalSecret: "s" };
  state.owned = true;
  state.send.mockReset();
  state.eq.mockReset();
});

describe("POST /api/push/test", () => {
  it("sends one push, through the real push service, to the member's own device", async () => {
    state.send.mockResolvedValueOnce({ ok: true });
    const res = await call();
    expect(res.status).toBe(204);
    expect(state.eq).toHaveBeenCalledWith("endpoint", FCM);
    expect(state.send).toHaveBeenCalledTimes(1);
    const [target, payload] = state.send.mock.calls[0];
    expect(target).toEqual({ endpoint: FCM, p256dh: SUB.keys.p256dh, auth: SUB.keys.auth });
    expect(payload).toMatchObject({ url: "/settings?tab=app", silent: false });
  });

  it("only sends to a device saved for this member (RLS shows only their own)", async () => {
    state.owned = false;
    const res = await call();
    expect(res.status).toBe(404);
    expect(state.send).not.toHaveBeenCalled();
  });

  it("needs a session, this site, a valid subscription and push set up", async () => {
    state.userId = null;
    expect((await call()).status).toBe(401);
    state.userId = "u1";
    expect((await call(SUB, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call({ ...SUB, endpoint: "https://evil.example/x" })).status).toBe(400);
    state.config = null;
    expect((await call()).status).toBe(503);
    expect(state.send).not.toHaveBeenCalled();
  });

  it("explains an expired device and a refused push", async () => {
    state.send.mockResolvedValueOnce({ ok: false, statusCode: 410, gone: true });
    const gone = await call();
    expect(gone.status).toBe(410);
    expect((await gone.json()).error).toMatch(/off and on again/);
    state.send.mockResolvedValueOnce({ ok: false, statusCode: 500, gone: false });
    expect((await call()).status).toBe(502);
  });
});
