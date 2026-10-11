import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const createClient = vi.fn(() => ({ rpc }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...args: unknown[]) => (createClient as (...a: unknown[]) => unknown)(...args) }));

const adminRpc = vi.fn();
const remove = vi.fn();
const storageFrom = vi.fn(() => ({ remove }));
const createAdminClient = vi.fn(() => ({ rpc: adminRpc, storage: { from: storageFrom } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createAdminClient() }));

import { GET } from "./route";

const ORPHAN = "68401c95-0000-4000-8000-000000000001/82fc451f-df84-418c-967b-6f35309106b5.gif";

const call = (auth?: string) =>
  GET(new Request("http://localhost/api/keepalive", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pub-key");
  rpc.mockReset().mockResolvedValue({ error: null });
  createClient.mockClear();
  adminRpc.mockReset().mockResolvedValue({ data: [], error: null });
  remove.mockReset().mockResolvedValue({ data: [], error: null });
  storageFrom.mockClear();
  createAdminClient.mockClear();
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

  it("runs keepalive, then the wrong-code purge, with the publishable key and answers 204 with no body", async () => {
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(createClient).toHaveBeenCalledWith("https://x.supabase.co", "pub-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(rpc.mock.calls).toEqual([["keepalive"], ["purge_attempt_logs"]]);
  });

  it("answers 502 on any database error, permission errors included", async () => {
    for (const error of [{ code: "42501" }, { code: "PGRST202" }, { code: "", message: "fetch failed" }]) {
      rpc.mockResolvedValueOnce({ error });
      expect((await call("Bearer s3cret")).status).toBe(502);
    }
  });

  it("answers 500 and logs it when the wrong-code purge fails, after keepalive worked", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const failure of [
      () => rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { code: "PGRST202", message: "not found" } }),
      () => rpc.mockResolvedValueOnce({ error: null }).mockRejectedValueOnce(new Error("fetch failed")),
    ]) {
      failure();
      log.mockClear();
      const res = await call("Bearer s3cret");
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("");
      expect(log).toHaveBeenCalledWith(expect.stringContaining("purge_attempt_logs"));
    }
    log.mockRestore();
  });

  it("erases the picture files of deleted accounts with the secret key", async () => {
    adminRpc.mockResolvedValueOnce({ data: [ORPHAN], error: null });
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(204);
    expect(adminRpc).toHaveBeenCalledWith("orphan_avatar_files");
    expect(storageFrom).toHaveBeenCalledWith("avatars");
    expect(remove).toHaveBeenCalledWith([ORPHAN]);
  });

  it("removes nothing and answers 500 when the sweep looks wrong", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const many = Array.from({ length: 21 }, (_, i) => `68401c95-0000-4000-8000-${String(i).padStart(12, "0")}/a.gif`);
    for (const data of [
      many, // more deleted accounts in one day than this chapter ever has: stop and let a person look
      ["chapter/banner.png"], // not a member's folder
      [ORPHAN, "../" + ORPHAN],
      [ORPHAN, "68401C95-0000-4000-8000-000000000001/x.gif"],
      [""],
    ]) {
      adminRpc.mockResolvedValueOnce({ data, error: null });
      log.mockClear();
      const res = await call("Bearer s3cret");
      expect(res.status).toBe(500);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("avatar"));
    }
    expect(remove).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("still sweeps at the limit of 20 files", async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `68401c95-0000-4000-8000-${String(i).padStart(12, "0")}/a.webp`);
    adminRpc.mockResolvedValueOnce({ data: twenty, error: null });
    expect((await call("Bearer s3cret")).status).toBe(204);
    expect(remove).toHaveBeenCalledWith(twenty);
  });

  it("answers 500 when the sweep can't run or fails, and the purge still runs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failures = [
      () => createAdminClient.mockImplementationOnce(() => { throw new Error("SUPABASE_SECRET_KEY is not set"); }),
      () => adminRpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "not found" } }),
      () => {
        adminRpc.mockResolvedValueOnce({ data: [ORPHAN], error: null });
        remove.mockResolvedValueOnce({ data: null, error: { message: "storage down" } });
      },
    ];
    for (const fail of failures) {
      fail();
      rpc.mockClear();
      log.mockClear();
      const res = await call("Bearer s3cret");
      expect(res.status).toBe(500);
      expect(rpc.mock.calls).toEqual([["keepalive"], ["purge_attempt_logs"]]);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("avatar"));
    }
    log.mockRestore();
  });

  it("skips housekeeping when keepalive fails", async () => {
    rpc.mockResolvedValueOnce({ error: { code: "", message: "fetch failed" } });
    expect((await call("Bearer s3cret")).status).toBe(502);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("answers 502 when the request throws", async () => {
    rpc.mockRejectedValueOnce(new Error("boom"));
    expect((await call("Bearer s3cret")).status).toBe(502);
  });
});
