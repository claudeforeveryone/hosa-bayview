import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Runs the real public/sw.js in a stand-in worker scope and taps a notification. The browser lets a
// notificationclick use ONE window interaction (focus or open), like Chromium does; a second one is refused.

const ORIGIN = "https://hosa.example";
const source = readFileSync("public/sw.js", "utf8");

type Win = {
  url: string;
  frameType: string;
  focus: () => Promise<Win>;
  navigate?: (url: string) => Promise<Win | null>;
};

function tap(
  open: {
    url: string;
    frameType?: string;
    controlled?: boolean;
    noNavigate?: boolean;
  }[],
  link = "/notifications",
) {
  const log: string[] = [];
  let interactions = 1;
  const spend = (what: string) => {
    if (interactions < 1) {
      log.push(`${what} refused`);
      throw new Error("Not allowed to open or focus a window.");
    }
    interactions -= 1;
    log.push(what);
  };
  const win = (
    url: string,
    frameType = "top-level",
    controlled = true,
  ): Win => {
    const w: Win = {
      url,
      frameType,
      focus: async () => {
        spend(`focus ${w.url}`);
        return w;
      },
      navigate: async (to: string) => {
        log.push(`navigate ${w.url}`);
        // A window this worker doesn't control can't be navigated from here.
        if (!controlled) throw new TypeError("not controlled");
        return win(to, frameType, controlled);
      },
    };
    return w;
  };
  const windows = open.map((o) => {
    const w = win(o.url, o.frameType, o.controlled);
    if (o.noNavigate) delete w.navigate;
    return w;
  });
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      handlers[type] = fn;
    },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url: string) => {
        spend(`open ${url}`);
        return win(url);
      },
    },
  };
  new Function("self", source)(self);
  let done: Promise<unknown> = Promise.resolve();
  handlers.notificationclick({
    notification: { close: () => log.push("close"), data: { url: link } },
    waitUntil: (p: Promise<unknown>) => {
      done = p;
    },
  });
  return done.then(
    () => log,
    () => log,
  );
}

describe("service worker: tapping a notification", () => {
  it("takes an open HOSA window to the notification's page, then brings it forward", async () => {
    expect(await tap([{ url: `${ORIGIN}/calendar` }])).toEqual([
      "close",
      `navigate ${ORIGIN}/calendar`,
      `focus ${ORIGIN}/notifications`,
    ]);
  });

  it("just brings forward a window already on that page", async () => {
    expect(await tap([{ url: `${ORIGIN}/notifications` }])).toEqual([
      "close",
      `focus ${ORIGIN}/notifications`,
    ]);
  });

  it("still opens the page when the open window can't be navigated (opened before the worker took over)", async () => {
    const log = await tap([{ url: `${ORIGIN}/calendar`, controlled: false }]);
    expect(log).toEqual([
      "close",
      `navigate ${ORIGIN}/calendar`,
      `open ${ORIGIN}/notifications`,
    ]);
    expect(log.some((l) => l.endsWith("refused"))).toBe(false);
  });

  it("still opens the page in a browser whose windows have no navigate()", async () => {
    const log = await tap([
      { url: `${ORIGIN}/calendar`, controlled: true, noNavigate: true },
    ]);
    expect(log).toEqual(["close", `open ${ORIGIN}/notifications`]);
  });

  it("skips frames inside other pages and windows of other sites", async () => {
    expect(
      await tap([
        { url: `${ORIGIN}/calendar`, frameType: "nested" },
        { url: "https://elsewhere.example/" },
      ]),
    ).toEqual(["close", `open ${ORIGIN}/notifications`]);
  });

  it("opens the home page for a link that isn't a path on this site", async () => {
    expect(await tap([], "https://evil.example/")).toEqual([
      "close",
      `open ${ORIGIN}/`,
    ]);
  });
});
