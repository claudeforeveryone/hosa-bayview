import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const createClient = vi.fn(() => ({ rpc }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...args: unknown[]) => (createClient as (...a: unknown[]) => unknown)(...args) }));

import { GET } from "./route";

const call = (auth?: string) =>
  GET(new Request("http://localhost/api/keepalive", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pub-key");
  rpc.mockReset().mockResolvedValue({ error: null });
  createClient.mockClear();
});

describe("GET /api/keepalive", () => {
  it("answers 503 when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await call("Bearer ");
    expect(res.status).toBe(503);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("answers 401 with an empty body for a missing or wrong secret", async () => {
    for (const auth of [undefined, "Bearer nope", "s3cret", "Bearer s3cret2"]) {
      const res = await call(auth);
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("");
    }
    expect(createClient).not.toHaveBeenCalled();
  });

  it("runs the keepalive RPC once with the publishable key and answers 204 with no body", async () => {
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(createClient).toHaveBeenCalledWith("https://x.supabase.co", "pub-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("keepalive");
  });

  it("answers 502 on any database error, permission errors included", async () => {
    for (const error of [{ code: "42501" }, { code: "PGRST202" }, { code: "", message: "fetch failed" }]) {
      rpc.mockResolvedValueOnce({ error });
      expect((await call("Bearer s3cret")).status).toBe(502);
    }
  });

  it("answers 502 when the request throws", async () => {
    rpc.mockRejectedValueOnce(new Error("boom"));
    expect((await call("Bearer s3cret")).status).toBe(502);
  });
});
