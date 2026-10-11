import { buildPayload, type PushPayload } from "./payload";

// Delivery core. The database queues every new notification for members with a device (0221) and pokes the
// deliver route, which runs this: claim a batch, send each push, report back, repeat until the queue is empty or
// the time budget is spent. The outbox and the sender are passed in, so this is tested without the network.

// One row per (notification, device) from push_claim. A notification with nothing left to send comes back once
// with a null endpoint. Devices that already have the notification (from an earlier try) are left out.
export type ClaimRow = {
  notification_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  sound: boolean | null;
  failure_count: number | null;
  // Which try this is for the notification, counting this one (push_claim adds one before handing it out).
  attempts: number;
};

// push_claim stops handing a notification out after this many tries (0221: attempts < 5).
export const MAX_ATTEMPTS = 5;

export type Report = {
  // Notifications that leave the queue.
  done: string[];
  // Notifications that stay queued for another try because the push service had a passing problem, or because
  // the time budget ran out before every device was tried. delivered lists the devices that already have it (or
  // will never take it), so the next try skips them. untried: some devices weren't tried this time and none had a
  // passing failure, so push_report gives the try back (it doesn't count towards the 5).
  retry: { id: string; delivered: string[]; untried?: true }[];
  // Devices that took a push (failure count reset).
  ok: string[];
  // Devices that refused in a way a retry won't fix, or still failed on the last try (one more failure; the
  // tenth in a row drops the device).
  failed: string[];
  // Devices the push service says no longer exist (404/410): dropped at once.
  gone: string[];
};

export type Outbox = {
  claim(limit: number): Promise<ClaimRow[]>;
  report(report: Report): Promise<void>;
};

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type SendOutcome =
  { ok: true } | { ok: false; statusCode: number | null; gone: boolean };

export type Sender = (
  target: PushTarget,
  payload: PushPayload,
) => Promise<SendOutcome>;

export type DrainResult = {
  // Notifications that left the queue.
  notifications: number;
  sent: number;
  failed: number;
  removed: number;
  // Notifications left queued for another try.
  retried: number;
};

// A push service that is overloaded (429), down (5xx) or unreachable (no status: timeout, reset, DNS) may well
// take the same push a minute later. Anything else (400, 401, 403, 413) will refuse it again.
export function isPassingFailure(outcome: SendOutcome): boolean {
  if (outcome.ok || outcome.gone) return false;
  const code = outcome.statusCode;
  return code === null || code === 429 || code >= 500;
}

const BATCH = 50;
// Pushes in flight at once, so a big announcement doesn't open hundreds of sockets.
const PARALLEL = 10;

// The time budget is checked before each claim and before each wave of PARALLEL pushes, and no push may take longer
// than sendTimeoutMs (web-push's own timeout only covers an idle socket). So the last wave starts before budgetMs
// and ends by budgetMs + sendTimeoutMs, which leaves the route (maxDuration 60 s) time to report.
export async function drainOutbox(
  outbox: Outbox,
  send: Sender,
  {
    budgetMs = 40_000,
    sendTimeoutMs = 12_000,
    now = Date.now,
  }: { budgetMs?: number; sendTimeoutMs?: number; now?: () => number } = {},
): Promise<DrainResult> {
  const started = now();
  const inBudget = () => now() - started < budgetMs;
  const total: DrainResult = {
    notifications: 0,
    sent: 0,
    failed: 0,
    removed: 0,
    retried: 0,
  };

  while (inBudget()) {
    const rows = await outbox.claim(BATCH);
    if (rows.length === 0) break;

    const jobs = rows.filter(
      (r): r is ClaimRow & { endpoint: string; p256dh: string; auth: string } =>
        r.endpoint !== null && r.p256dh !== null && r.auth !== null,
    );
    const outcomes: {
      job: ClaimRow & { endpoint: string };
      outcome: SendOutcome;
    }[] = [];
    let sentUpTo = 0;
    while (sentUpTo < jobs.length && inBudget()) {
      const slice = jobs.slice(sentUpTo, sentUpTo + PARALLEL);
      outcomes.push(
        ...(await Promise.all(
          slice.map(async (job) => ({
            job,
            outcome: await safeSend(send, job, sendTimeoutMs),
          })),
        )),
      );
      sentUpTo += slice.length;
    }
    // Out of time before every device was tried: those notifications go back to the queue as they are.
    const untried = new Set(
      jobs.slice(sentUpTo).map((job) => job.notification_id),
    );

    const ok = new Set<string>();
    const failed = new Set<string>();
    const gone = new Set<string>();
    // Per notification: the devices that are finished with it, and whether any device should get another try.
    const finished = new Map<string, string[]>();
    const again = new Set<string>();
    for (const r of rows) finished.set(r.notification_id, []);
    for (const { job, outcome } of outcomes) {
      const id = job.notification_id;
      if (outcome.ok) ok.add(job.endpoint);
      else if (outcome.gone) gone.add(job.endpoint);
      else if (isPassingFailure(outcome) && job.attempts < MAX_ATTEMPTS) {
        // Not counted against the device: the service had the problem, and the push goes out again shortly.
        again.add(id);
        continue;
      } else failed.add(job.endpoint);
      finished.get(id)!.push(job.endpoint);
    }
    // A device that went away on one push is gone, whatever happened on another.
    for (const endpoint of gone) {
      ok.delete(endpoint);
      failed.delete(endpoint);
    }

    const done = [...finished.keys()].filter(
      (id) => !again.has(id) && !untried.has(id),
    );
    const retry: Report["retry"] = [...finished.keys()]
      .filter((id) => again.has(id) || untried.has(id))
      .map((id) => ({
        id,
        delivered: [...new Set(finished.get(id))],
        // A passing failure on a device that was tried counts the try as usual.
        ...(again.has(id) ? {} : { untried: true as const }),
      }));

    // A report that fails throws: the lease then runs out and the rows are claimed again. A repeat push carries
    // the same tag, so the phone replaces the first one instead of showing it twice.
    await outbox.report({
      done,
      retry,
      ok: [...ok],
      failed: [...failed],
      gone: [...gone],
    });

    total.notifications += done.length;
    total.retried += retry.length;
    total.sent += outcomes.filter((o) => o.outcome.ok).length;
    total.failed += failed.size;
    total.removed += gone.size;
  }
  return total;
}

const NO_ANSWER: SendOutcome = { ok: false, statusCode: null, gone: false };

// A throw or a push still out after the deadline is a passing failure (no status), so it is tried again later.
async function safeSend(
  send: Sender,
  job: ClaimRow & { endpoint: string; p256dh: string; auth: string },
  timeoutMs: number,
): Promise<SendOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<SendOutcome>((resolve) => {
    timer = setTimeout(() => resolve(NO_ANSWER), timeoutMs);
  });
  try {
    return await Promise.race([
      send(
        { endpoint: job.endpoint, p256dh: job.p256dh, auth: job.auth },
        buildPayload(job, job.sound !== false),
      ),
      deadline,
    ]);
  } catch {
    return NO_ANSWER;
  } finally {
    clearTimeout(timer);
  }
}
