import { describe, expect, it, vi } from "vitest";
import {
  createAnswerSaves,
  SAVE_FAILED,
  type SaveReply,
  type Settled,
} from "./answer-saves";

// Each send waits until the test settles it, so the order of replies is under the test's control.
function harness() {
  const sent: [string, number][] = [];
  const waiting: {
    resolve: (r: SaveReply) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const settled: Settled[] = [];
  const saves = createAnswerSaves(
    (qid, selected) => {
      sent.push([qid, selected]);
      return new Promise<SaveReply>((resolve, reject) =>
        waiting.push({ resolve, reject }),
      );
    },
    (s) => settled.push(s),
  );
  // Let queued microtasks run, so the next send (if any) has started.
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { saves, sent, waiting, settled, tick };
}

describe("createAnswerSaves", () => {
  it("sends one pick and reports it as the latest", async () => {
    const h = harness();
    const p = h.saves.save("q1", 2);
    expect(h.sent).toEqual([["q1", 2]]);
    h.waiting[0].resolve({ selected_index: 2, is_correct: null });
    await p;
    expect(h.settled).toEqual([
      {
        qid: "q1",
        sent: 2,
        reply: { selected_index: 2, is_correct: null },
        latest: true,
      },
    ]);
  });

  it("keeps a change made while the first save is in flight and sends only the newest", async () => {
    const h = harness();
    const first = h.saves.save("q1", 0);
    h.saves.save("q1", 1);
    h.saves.save("q1", 3);
    expect(h.sent).toEqual([["q1", 0]]);
    h.waiting[0].resolve({ selected_index: 0 });
    await h.tick();
    expect(h.sent).toEqual([
      ["q1", 0],
      ["q1", 3],
    ]);
    h.waiting[1].resolve({ selected_index: 3 });
    await h.saves.idle();
    await first;
    expect(h.settled.map((s) => [s.sent, s.latest])).toEqual([
      [0, false],
      [3, true],
    ]);
  });

  it("reports a failed save as the latest error so the screen can revert it", async () => {
    const h = harness();
    h.saves.save("q1", 1);
    h.waiting[0].resolve({ error: "Time is up" });
    await h.saves.idle();
    expect(h.settled).toEqual([
      { qid: "q1", sent: 1, reply: { error: "Time is up" }, latest: true },
    ]);
  });

  it("turns a network failure (thrown send) into the save-failed message", async () => {
    const h = harness();
    h.saves.save("q1", 1);
    h.waiting[0].reject(new TypeError("Failed to fetch"));
    await h.saves.idle();
    expect(h.settled).toEqual([
      { qid: "q1", sent: 1, reply: { error: SAVE_FAILED }, latest: true },
    ]);
  });

  it("does not hide a newer pick behind an older failure", async () => {
    const h = harness();
    h.saves.save("q1", 0);
    h.saves.save("q1", 2);
    h.waiting[0].reject(new TypeError("Failed to fetch"));
    await h.tick();
    expect(h.sent).toEqual([
      ["q1", 0],
      ["q1", 2],
    ]);
    h.waiting[1].resolve({ selected_index: 2 });
    await h.saves.idle();
    expect(
      h.settled.map((s) => [s.sent, s.latest, Boolean(s.reply.error)]),
    ).toEqual([
      [0, false, true],
      [2, true, false],
    ]);
  });

  it("saves different questions side by side without holding each other up", async () => {
    const h = harness();
    h.saves.save("q1", 0);
    h.saves.save("q2", 1);
    expect(h.sent).toEqual([
      ["q1", 0],
      ["q2", 1],
    ]);
    h.waiting[1].resolve({ selected_index: 1 });
    h.waiting[0].resolve({ selected_index: 0 });
    await h.saves.idle();
    expect(h.settled.map((s) => s.qid).sort()).toEqual(["q1", "q2"]);
  });

  it("idle names the questions whose newest pick didn't save, so a submit can stop", async () => {
    const h = harness();
    h.saves.save("q1", 0);
    h.saves.save("q2", 1);
    h.waiting[0].reject(new TypeError("Failed to fetch"));
    h.waiting[1].resolve({ selected_index: 1 });
    expect(await h.saves.idle()).toEqual(["q1"]);
  });

  it("forgets a failure once a later pick for that question saves", async () => {
    const h = harness();
    h.saves.save("q1", 0);
    h.waiting[0].resolve({ error: SAVE_FAILED });
    expect(await h.saves.idle()).toEqual(["q1"]);
    h.saves.save("q1", 2);
    h.waiting[1].resolve({ selected_index: 2 });
    expect(await h.saves.idle()).toEqual([]);
  });

  it("does not count an older failure when a newer pick for the question saved", async () => {
    const h = harness();
    h.saves.save("q1", 0);
    h.saves.save("q1", 3);
    h.waiting[0].reject(new TypeError("Failed to fetch"));
    await h.tick();
    h.waiting[1].resolve({ selected_index: 3 });
    expect(await h.saves.idle()).toEqual([]);
  });

  it("doesn't count a pick the server refused for good as unsaved, so it can't hold a submit", async () => {
    // "Time is up", "This attempt is already submitted", "Practice is off for this test": picking again gets the
    // same answer, so blocking a submit on them would loop.
    const h = harness();
    h.saves.save("q1", 0);
    h.saves.save("q2", 1);
    h.waiting[0].resolve({ error: "Time is up." });
    h.waiting[1].resolve({ error: "This attempt is already submitted." });
    expect(await h.saves.idle()).toEqual([]);
  });

  it("counts a pick that never reached the database as unsaved", async () => {
    const h = harness();
    h.saves.save("q1", 0);
    h.saves.save("q2", 1);
    h.saves.save("q3", 2);
    h.waiting[0].reject(new TypeError("Failed to fetch"));
    h.waiting[1].resolve(undefined as unknown as SaveReply);
    h.waiting[2].resolve({ error: SAVE_FAILED });
    expect((await h.saves.idle()).sort()).toEqual(["q1", "q2", "q3"]);
  });

  it("idle can give up waiting after a while and names the saves still on their way", async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      h.saves.save("q1", 0);
      h.saves.save("q2", 1);
      h.waiting[1].resolve({ selected_index: 1 });
      const waiting = h.saves.idle(4000);
      await vi.advanceTimersByTimeAsync(3999);
      let out: string[] | null = null;
      void waiting.then((x) => (out = x));
      await vi.advanceTimersByTimeAsync(0);
      expect(out).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(await waiting).toEqual(["q1"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("idle with a time limit still resolves as soon as everything settles", async () => {
    const h = harness();
    h.saves.save("q1", 0);
    const waiting = h.saves.idle(60_000);
    h.waiting[0].resolve({ selected_index: 0 });
    expect(await waiting).toEqual([]);
  });

  it("idle waits for everything in flight, then resolves", async () => {
    const h = harness();
    h.saves.save("q1", 0);
    let done = false;
    const waiting = h.saves.idle().then(() => {
      done = true;
    });
    await h.tick();
    expect(done).toBe(false);
    h.waiting[0].resolve({ selected_index: 0 });
    await waiting;
    expect(done).toBe(true);
  });
});
