import { describe, expect, it, vi } from "vitest";
import {
  drainOutbox,
  type ClaimRow,
  type Outbox,
  type Report,
  type Sender,
} from "./deliver";

const A = "https://fcm.googleapis.com/fcm/send/phone-a";
const B = "https://web.push.apple.com/phone-b";

function row(over: Partial<ClaimRow>): ClaimRow {
  return {
    notification_id: "n1",
    user_id: "u1",
    kind: "announcement",
    title: "Meeting moved",
    body: "Room 214 at 3:10",
    link: "/announcements",
    endpoint: A,
    p256dh: "key",
    auth: "secret",
    sound: true,
    failure_count: 0,
    attempts: 1,
    ...over,
  };
}

// An outbox that hands out the given batches in order, then nothing, and keeps every report.
function fakeOutbox(batches: ClaimRow[][]) {
  const reports: Report[] = [];
  const claim = vi.fn(async () => batches.shift() ?? []);
  const outbox: Outbox = {
    claim,
    report: async (r) => {
      reports.push(r);
    },
  };
  return { outbox, reports, claim };
}

const okSender: Sender = async () => ({ ok: true });

describe("drainOutbox", () => {
  it("sends each queued notification to every device and clears it", async () => {
    const { outbox, reports } = fakeOutbox([
      [row({ endpoint: A }), row({ endpoint: B })],
    ]);
    const send = vi.fn(okSender);
    const result = await drainOutbox(outbox, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(reports).toEqual([
      { done: ["n1"], retry: [], ok: [A, B], failed: [], gone: [] },
    ]);
    expect(result).toEqual({
      notifications: 1,
      sent: 2,
      failed: 0,
      removed: 0,
      retried: 0,
    });
  });

  it("builds the push from the notification: title, body, same-site link, and its id as the tag", async () => {
    const { outbox } = fakeOutbox([[row({})]]);
    const send = vi.fn(okSender);
    await drainOutbox(outbox, send);
    expect(send).toHaveBeenCalledWith(
      { endpoint: A, p256dh: "key", auth: "secret" },
      {
        title: "Meeting moved",
        body: "Room 214 at 3:10",
        url: "/announcements",
        tag: "n1",
        kind: "announcement",
        silent: false,
      },
    );
  });

  it("sends silently to a device whose notification sound is off", async () => {
    const { outbox } = fakeOutbox([[row({ sound: false })]]);
    const send = vi.fn(okSender);
    await drainOutbox(outbox, send);
    expect(send.mock.calls[0][1].silent).toBe(true);
  });

  it("never lets a push open another site", async () => {
    const { outbox } = fakeOutbox([
      [
        row({ link: "https://evil.example/x" }),
        row({ notification_id: "n2", link: "//evil.example" }),
      ],
    ]);
    const send = vi.fn(okSender);
    await drainOutbox(outbox, send);
    expect(send.mock.calls.map((c) => c[1].url)).toEqual(["/", "/"]);
  });

  it("clears a notification with no device to send to without calling the push service", async () => {
    const { outbox, reports } = fakeOutbox([
      [
        row({
          endpoint: null,
          p256dh: null,
          auth: null,
          sound: null,
          failure_count: null,
        }),
      ],
    ]);
    const send = vi.fn(okSender);
    await drainOutbox(outbox, send);
    expect(send).not.toHaveBeenCalled();
    expect(reports).toEqual([
      { done: ["n1"], retry: [], ok: [], failed: [], gone: [] },
    ]);
  });

  it("drops a 404/410 device and counts a refusal that won't change (400, 403, 413) as a failure", async () => {
    const { outbox, reports } = fakeOutbox([
      [row({ endpoint: A }), row({ endpoint: B })],
    ]);
    const send: Sender = async (target) =>
      target.endpoint === A
        ? { ok: false, statusCode: 410, gone: true }
        : { ok: false, statusCode: 403, gone: false };
    const result = await drainOutbox(outbox, send);
    expect(reports[0]).toEqual({
      done: ["n1"],
      retry: [],
      ok: [],
      failed: [B],
      gone: [A],
    });
    expect(result).toEqual({
      notifications: 1,
      sent: 0,
      failed: 1,
      removed: 1,
      retried: 0,
    });
  });

  it("keeps a notification queued when the push service has a bad moment (5xx, 429, timeout, socket error)", async () => {
    for (const outcome of [
      { ok: false as const, statusCode: 500, gone: false },
      { ok: false as const, statusCode: 503, gone: false },
      { ok: false as const, statusCode: 429, gone: false },
      { ok: false as const, statusCode: null, gone: false },
    ]) {
      const { outbox, reports } = fakeOutbox([[row({})]]);
      const result = await drainOutbox(outbox, async () => outcome);
      // Not a strike against the device: the service, not the phone, had the problem.
      expect(reports[0]).toEqual({
        done: [],
        retry: [{ id: "n1", delivered: [] }],
        ok: [],
        failed: [],
        gone: [],
      });
      expect(result.retried).toBe(1);
      expect(result.notifications).toBe(0);
    }
  });

  it("treats a sender that throws as a passing failure to retry, not a crash", async () => {
    const { outbox, reports } = fakeOutbox([[row({})]]);
    const send: Sender = async () => {
      throw new Error("socket reset");
    };
    await drainOutbox(outbox, send);
    expect(reports[0]).toEqual({
      done: [],
      retry: [{ id: "n1", delivered: [] }],
      ok: [],
      failed: [],
      gone: [],
    });
  });

  it("only retries the devices that missed out: the ones that took it are listed as delivered", async () => {
    const C = "https://updates.push.services.mozilla.com/wpush/v2/phone-c";
    const { outbox, reports } = fakeOutbox([
      [row({ endpoint: A }), row({ endpoint: B }), row({ endpoint: C })],
    ]);
    const send: Sender = async (target) =>
      target.endpoint === A
        ? { ok: true }
        : target.endpoint === B
          ? { ok: false, statusCode: 502, gone: false }
          : { ok: false, statusCode: 400, gone: false };
    await drainOutbox(outbox, send);
    expect(reports[0]).toEqual({
      done: [],
      // A got it and C will never take it, so only B is tried again.
      retry: [{ id: "n1", delivered: [A, C] }],
      ok: [A],
      failed: [C],
      gone: [],
    });
  });

  it("gives up on the last try: the notification leaves the queue and the device takes one strike", async () => {
    const { outbox, reports } = fakeOutbox([[row({ attempts: 5 })]]);
    const result = await drainOutbox(outbox, async () => ({
      ok: false,
      statusCode: 503,
      gone: false,
    }));
    expect(reports[0]).toEqual({
      done: ["n1"],
      retry: [],
      ok: [],
      failed: [A],
      gone: [],
    });
    expect(result).toMatchObject({ notifications: 1, failed: 1, retried: 0 });
  });

  it("delivers on the retry once the push service is back", async () => {
    // The first claim fails on a 503; the database hands the same notification back after its lease.
    const { outbox, reports } = fakeOutbox([
      [row({ attempts: 1 })],
      [row({ attempts: 2 })],
    ]);
    let calls = 0;
    const result = await drainOutbox(outbox, async () =>
      ++calls === 1
        ? { ok: false, statusCode: 503, gone: false }
        : { ok: true },
    );
    expect(reports.map((r) => [r.done, r.retry])).toEqual([
      [[], [{ id: "n1", delivered: [] }]],
      [["n1"], []],
    ]);
    expect(result).toMatchObject({ notifications: 1, sent: 1, retried: 1 });
  });

  it("keeps claiming batches until the queue is empty", async () => {
    const { outbox, reports, claim } = fakeOutbox([
      [row({ notification_id: "n1" })],
      [row({ notification_id: "n2" }), row({ notification_id: "n3" })],
    ]);
    const result = await drainOutbox(outbox, okSender);
    expect(claim).toHaveBeenCalledTimes(3);
    expect(reports.map((r) => r.done)).toEqual([["n1"], ["n2", "n3"]]);
    expect(result.notifications).toBe(3);
  });

  it("stops claiming new batches once the time budget is spent", async () => {
    const { outbox, claim } = fakeOutbox([
      [row({ notification_id: "n1" })],
      [row({ notification_id: "n2" })],
    ]);
    let now = 0;
    const result = await drainOutbox(
      outbox,
      async () => {
        now += 50_000;
        return { ok: true };
      },
      { budgetMs: 40_000, now: () => now },
    );
    expect(claim).toHaveBeenCalledTimes(1);
    expect(result.notifications).toBe(1);
  });

  it("lists a device once per report even when it got several notifications", async () => {
    const { outbox, reports } = fakeOutbox([
      [row({ notification_id: "n1" }), row({ notification_id: "n2" })],
    ]);
    await drainOutbox(outbox, okSender);
    expect(reports[0].ok).toEqual([A]);
    expect(reports[0].done).toEqual(["n1", "n2"]);
  });

  it("lets a failed report propagate so the lease runs out and the rows are retried", async () => {
    const outbox: Outbox = {
      claim: async () => [row({})],
      report: async () => {
        throw new Error("database down");
      },
    };
    await expect(drainOutbox(outbox, okSender)).rejects.toThrow(
      "database down",
    );
  });
});
