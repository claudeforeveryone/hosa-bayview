import { beforeEach, describe, expect, it, vi } from "vitest";

const head = vi.fn();
const from = vi.fn(() => ({ select: head }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({ from })) }));

import { GET } from "./route";

const call = (auth?: string) =>
  GET(new Request("http://localhost/api/keepalive", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s3cret");
  head.mockReset().mockResolvedValue({ error: null, status: 200 });
  from.mockClear();
});

describe("GET /api/keepalive", () => {
  it("answers 503 when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await call("Bearer ");
    expect(res.status).toBe(503);
    expect(from).not.toHaveBeenCalled();
  });

  it("answers 401 with an empty body for a missing or wrong secret", async () => {
    for (const auth of [undefined, "Bearer nope", "s3cret", "Bearer s3cret2"]) {
      const res = await call(auth);
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("");
    }
    expect(from).not.toHaveBeenCalled();
  });

  it("touches Postgres once and answers 204 with no body", async () => {
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(from).toHaveBeenCalledTimes(1);
    expect(head).toHaveBeenCalledTimes(1);
  });

  it("counts a permission error as proof Postgres answered", async () => {
    head.mockResolvedValue({ error: { code: "42501" }, status: 401 });
    expect((await call("Bearer s3cret")).status).toBe(204);
  });

  it("answers 502 when the database cannot be reached", async () => {
    head.mockResolvedValue({ error: { code: "", message: "fetch failed" }, status: 0 });
    expect((await call("Bearer s3cret")).status).toBe(502);
    head.mockRejectedValue(new Error("boom"));
    expect((await call("Bearer s3cret")).status).toBe(502);
  });
});
