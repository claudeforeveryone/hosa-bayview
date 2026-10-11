import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

const { track } = await import("./track");

describe("track", () => {
  beforeEach(() => rpc.mockReset());

  it("sends a taxonomy event to record_event", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await track("resource_opened", "file");
    expect(rpc).toHaveBeenCalledWith("record_event", {
      p_name: "resource_opened",
      p_code: "file",
    });
  });

  it("never sends a name or code off the list", async () => {
    await track("resource_opened" as never, "pdf" as never);
    await track("page_viewed" as never, "file" as never);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("swallows a database error, a rejected call and a throw", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    await expect(track("vocab_session_completed", "deck")).resolves.toBe(false);
    rpc.mockRejectedValueOnce(new Error("offline"));
    await expect(track("vocab_session_completed", "deck")).resolves.toBe(false);
    rpc.mockImplementationOnce(() => {
      throw new Error("no window");
    });
    await expect(track("app_installed", "ios")).resolves.toBe(false);
  });

  it("reports whether the database kept it", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(track("push_enabled", "android")).resolves.toBe(true);
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(track("push_enabled", "android")).resolves.toBe(false);
  });
});
