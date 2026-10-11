// How a test page hands an attempt in: a tap on Finish/Submit, or the timer at 0:00. Kept out of React so the
// order of things (wait for picks on their way, the "didn't save" gate, the server, the timer's one try) can be
// tested without a browser. take-test.tsx makes one per page and feeds it taps and timer ticks.
import { submitBlock, type SubmitProblem } from "@/lib/attempt-answers";

// How long a submit waits for picks still on their way: a tap waits a while, the timer (or a tap after time is
// up) only briefly, so a request that hangs can't hold an attempt open past its deadline.
export const TAP_WAIT = 10_000;
export const CLOSE_WAIT = 4_000;

// The submit action's reply (its FormState): an error, or done. Null is no reply at all.
export type SubmitReply = { error?: string; ok?: string } | null;

export type Submitter = {
  // A tap on Finish, Submit or Submit now. `confirmedBlank` is the questions blank on screen when the tap came
  // from the "still blank" step. Returns false when a submit is already running.
  tap: (confirmedBlank?: string[]) => boolean;
  // Each countdown tick, with the time left on the server's clock.
  tick: (msLeft: number) => void;
  // A new pick: the last "didn't save" warning is stale, so the next tap warns afresh.
  picked: () => void;
};

export function createSubmitter({
  rows,
  timeUp,
  idle,
  send,
  run,
  onProblem,
  onSent,
}: {
  rows: { question_id: string }[];
  // Whether the deadline has passed on the server's clock (always false for an untimed attempt).
  timeUp: () => boolean;
  // Waits up to `within` ms for picks on their way; resolves with the ones that never reached the server.
  idle: (within: number) => Promise<string[]>;
  send: () => Promise<SubmitReply>;
  // Runs the async submit (React's startTransition, so the page knows a submit is under way).
  run: (job: () => Promise<void>) => void;
  // Why a submit stopped, or null when a new one starts.
  onProblem: (problem: SubmitProblem | null) => void;
  // Handed in. byTap is false for the timer: no tap, so no sound (the browser would refuse it anyway).
  onSent: (byTap: boolean) => void;
}): Submitter {
  let running = false;
  // The timer's own try: once one has started, it doesn't try again (the button is the retry).
  let autoTried = false;
  // The questions the last "didn't save" warning named: tapping again for the same ones submits anyway.
  let warned: string | null = null;

  const start = (byTap: boolean, confirmedBlank: string[] = []) => {
    if (running) return false;
    running = true;
    onProblem(null);
    run(async () => {
      const unsaved = await idle(byTap && !timeUp() ? TAP_WAIT : CLOSE_WAIT);
      const block = submitBlock({
        unsaved,
        byTap,
        deadlinePassed: timeUp(),
        warned,
        rows,
        confirmedBlank,
      });
      if (block) {
        warned = block.key;
        running = false;
        onProblem({ kind: "unsaved", numbers: block.numbers });
        return;
      }
      const r = await send().catch(() => null);
      if (!r || r.error) {
        running = false;
        onProblem(
          r?.error
            ? { kind: "refused", message: r.error }
            : { kind: "offline" },
        );
        return;
      }
      onSent(byTap);
    });
    return true;
  };

  return {
    tap: (confirmedBlank?: string[]) => start(true, confirmedBlank),
    // At 0:00 the attempt hands itself in, once. A tapped submit still running then means the timer's try
    // didn't start, so it isn't used up: if that submit stops short, the next tick tries again.
    tick: (msLeft: number) => {
      if (msLeft <= 0 && !autoTried) autoTried = start(false);
    },
    picked: () => {
      warned = null;
    },
  };
}
