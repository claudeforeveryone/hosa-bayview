import { describe, expect, it, vi } from "vitest";
import { PUSH_DEVICE_EVENT } from "./browser";
import { watchPushFacts } from "./rereads";

// Stand-ins for window, document and navigator.permissions, built on Node's EventTarget.
function fakeBrowser({
  permissions = "supported",
}: { permissions?: "supported" | "missing" | "refuses" } = {}) {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const status = new EventTarget();
  let answer: (s: EventTarget) => void = () => {};
  const query = vi.fn(
    () =>
      new Promise<EventTarget>((resolve, reject) => {
        if (permissions === "refuses") reject(new TypeError("unsupported"));
        else answer = resolve;
      }),
  );
  return {
    env: {
      win,
      doc,
      permissions: permissions === "missing" ? undefined : { query },
    },
    win,
    doc,
    status,
    query,
    // The browser answers the permission query (it is async in every browser).
    answerQuery: async () => {
      answer(status);
      await Promise.resolve();
    },
    show: () => {
      doc.visibilityState = "visible";
      doc.dispatchEvent(new Event("visibilitychange"));
    },
    hide: () => {
      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
    },
    pageshow: (persisted: boolean) =>
      win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted })),
  };
}

describe("watchPushFacts", () => {
  it("reads again when the page comes back into view (an installed app resuming), not when it goes", () => {
    const b = fakeBrowser();
    const read = vi.fn();
    watchPushFacts(read, b.env);
    b.hide();
    expect(read).not.toHaveBeenCalled();
    b.show();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads again when the page is restored from the back/forward cache, not on its first load", () => {
    const b = fakeBrowser();
    const read = vi.fn();
    watchPushFacts(read, b.env);
    b.pageshow(false);
    expect(read).not.toHaveBeenCalled();
    b.pageshow(true);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads again when the browser reports the notifications permission changed", async () => {
    const b = fakeBrowser();
    const read = vi.fn();
    watchPushFacts(read, b.env);
    expect(b.query).toHaveBeenCalledWith({ name: "notifications" });
    await b.answerQuery();
    b.status.dispatchEvent(new Event("change"));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads again when this device changes in another view", () => {
    const b = fakeBrowser();
    const read = vi.fn();
    watchPushFacts(read, b.env);
    b.win.dispatchEvent(new Event(PUSH_DEVICE_EVENT));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("stops reading once stopped, including a permission answer that arrives late", async () => {
    const b = fakeBrowser();
    const read = vi.fn();
    const stop = watchPushFacts(read, b.env);
    stop();
    await b.answerQuery();
    b.show();
    b.pageshow(true);
    b.win.dispatchEvent(new Event(PUSH_DEVICE_EVENT));
    b.status.dispatchEvent(new Event("change"));
    expect(read).not.toHaveBeenCalled();
  });

  it("still works where the Permissions API is missing or refuses the notifications name", async () => {
    for (const permissions of ["missing", "refuses"] as const) {
      const b = fakeBrowser({ permissions });
      const read = vi.fn();
      expect(() => watchPushFacts(read, b.env)).not.toThrow();
      await Promise.resolve();
      b.show();
      expect(read).toHaveBeenCalledTimes(1);
    }
  });
});
