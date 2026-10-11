import { describe, expect, it } from "vitest";
import {
  CLOSE_WAIT,
  TAP_WAIT,
  createSubmitter,
  type SubmitReply,
} from "@/lib/attempt-submit";
import type { SubmitProblem } from "@/lib/attempt-answers";

const rows = [{ question_id: "a" }, { question_id: "b" }];

// A test page with stand-ins the test drives: the server clock (`late`), what the saves report as unsaved,
// and the server's replies to each submit (an Error is a request that threw). `hold()` keeps the next wait
// for saves open until `release()`, so a submit can still be running when the timer reaches zero.
function page({
  unsaved = [] as string[],
  replies = [] as (SubmitReply | Error)[],
} = {}) {
  const seen = {
    waits: [] as number[],
    sends: 0,
    problems: [] as (SubmitProblem | null)[],
    sent: [] as boolean[],
  };
  const jobs: Promise<void>[] = [];
  let late = false;
  let held: ((ids: string[]) => void) | null = null;
  let holdNext = false;
  const submitter = createSubmitter({
    rows,
    timeUp: () => late,
    idle: (within) => {
      seen.waits.push(within);
      if (!holdNext) return Promise.resolve(unsaved);
      holdNext = false;
      return new Promise<string[]>((r) => (held = r));
    },
    send: async () => {
      seen.sends += 1;
      // Done, unless the test scripted a reply (null is no reply at all).
      const r = replies.length ? replies.shift()! : { ok: "Submitted." };
      if (r instanceof Error) throw r;
      return r;
    },
    run: (job) => void jobs.push(job()),
    onProblem: (p) => seen.problems.push(p),
    onSent: (byTap) => seen.sent.push(byTap),
  });
  return {
    submitter,
    seen,
    // Lets every submit started so far run to its end.
    settle: () => Promise.all(jobs),
    timeIsUp: () => {
      late = true;
    },
    hold: () => {
      holdNext = true;
    },
    release: (ids: string[] = unsaved) => held?.(ids),
    lastProblem: () => seen.problems.at(-1),
  };
}

describe("createSubmitter: how long a submit waits for picks on their way", () => {
  it("waits up to 10 s on a tap before the deadline", async () => {
    const p = page();
    p.submitter.tap();
    await p.settle();
    expect(p.seen.waits).toEqual([TAP_WAIT]);
  });

  it("waits only 4 s on a tap after the deadline, so a hung save can't hold the attempt open", async () => {
    const p = page();
    p.timeIsUp();
    p.submitter.tap();
    await p.settle();
    expect(p.seen.waits).toEqual([CLOSE_WAIT]);
  });

  it("waits only 4 s when the timer submits", async () => {
    const p = page();
    p.timeIsUp();
    p.submitter.tick(0);
    await p.settle();
    expect(p.seen.waits).toEqual([CLOSE_WAIT]);
  });
});

describe("createSubmitter: the timer", () => {
  it("submits by itself at 0:00 and not before, with no sound", async () => {
    const p = page();
    p.submitter.tick(1500);
    p.submitter.tick(1);
    expect(p.seen.sends).toBe(0);
    p.timeIsUp();
    p.submitter.tick(0);
    await p.settle();
    expect(p.seen.sends).toBe(1);
    expect(p.seen.sent).toEqual([false]);
  });

  it("tries again on the next tick when a tapped submit was running at 0:00 and then stopped short", async () => {
    const p = page({ replies: [null] });
    p.hold();
    expect(p.submitter.tap()).toBe(true);
    // 0:00 while the tap is still waiting for saves: the timer's own try can't start, so it isn't used up.
    p.timeIsUp();
    p.submitter.tick(0);
    p.release();
    await p.settle();
    // The tapped submit couldn't reach the server.
    expect(p.seen.sends).toBe(1);
    expect(p.lastProblem()).toEqual({ kind: "offline" });
    p.submitter.tick(-500);
    await p.settle();
    expect(p.seen.sends).toBe(2);
    expect(p.seen.sent).toEqual([false]);
  });

  it("hands the attempt in when a tap was stopped for a lost pick before the deadline", async () => {
    const p = page({ unsaved: ["b"] });
    p.submitter.tap();
    await p.settle();
    expect(p.lastProblem()).toEqual({ kind: "unsaved", numbers: [2] });
    expect(p.seen.sends).toBe(0);
    p.timeIsUp();
    p.submitter.tick(0);
    await p.settle();
    expect(p.seen.sends).toBe(1);
    expect(p.seen.sent).toEqual([false]);
  });

  it("tries once: when its own submit fails, the button is the retry", async () => {
    const p = page({ replies: [null] });
    p.timeIsUp();
    p.submitter.tick(0);
    await p.settle();
    expect(p.lastProblem()).toEqual({ kind: "offline" });
    p.submitter.tick(-500);
    p.submitter.tick(-1000);
    await p.settle();
    expect(p.seen.sends).toBe(1);
    expect(p.submitter.tap()).toBe(true);
    await p.settle();
    expect(p.seen.sends).toBe(2);
    expect(p.seen.sent).toEqual([true]);
  });
});

describe("createSubmitter: taps", () => {
  it("ignores a second tap while a submit is running", async () => {
    const p = page();
    p.hold();
    expect(p.submitter.tap()).toBe(true);
    expect(p.submitter.tap()).toBe(false);
    p.release();
    await p.settle();
    expect(p.seen.sends).toBe(1);
  });

  it("stops once for a lost pick, then the next tap hands in what's saved", async () => {
    const p = page({ unsaved: ["a"] });
    p.submitter.tap();
    await p.settle();
    expect(p.lastProblem()).toEqual({ kind: "unsaved", numbers: [1] });
    p.submitter.tap();
    await p.settle();
    expect(p.seen.sends).toBe(1);
    expect(p.seen.sent).toEqual([true]);
  });

  it("warns afresh after a new pick", async () => {
    const p = page({ unsaved: ["a"] });
    p.submitter.tap();
    await p.settle();
    p.submitter.picked();
    p.submitter.tap();
    await p.settle();
    expect(p.seen.sends).toBe(0);
    expect(p.lastProblem()).toEqual({ kind: "unsaved", numbers: [1] });
  });

  it("doesn't stop a tap from the still-blank step for the lost pick it just confirmed blank", async () => {
    const p = page({ unsaved: ["a"] });
    p.submitter.tap(["a"]);
    await p.settle();
    expect(p.seen.sends).toBe(1);
    expect(p.seen.sent).toEqual([true]);
  });

  it("shows the server's reason, and a thrown request as no connection, then lets the taker try again", async () => {
    const p = page({
      replies: [{ error: "This attempt is already submitted." }, new Error()],
    });
    p.submitter.tap();
    await p.settle();
    expect(p.lastProblem()).toEqual({
      kind: "refused",
      message: "This attempt is already submitted.",
    });
    p.submitter.tap();
    await p.settle();
    expect(p.lastProblem()).toEqual({ kind: "offline" });
    expect(p.submitter.tap()).toBe(true);
  });

  it("clears the last problem when a submit starts", async () => {
    const p = page({ unsaved: ["a"] });
    p.submitter.tap();
    await p.settle();
    p.submitter.tap();
    expect(p.seen.problems).toEqual([
      null,
      { kind: "unsaved", numbers: [1] },
      null,
    ]);
    await p.settle();
  });
});
