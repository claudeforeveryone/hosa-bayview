import { buildPayload, type PushPayload } from "./payload";

// Delivery core. The database queues every new notification for members with a device (0221) and pokes the
// deliver route, which runs this: claim a batch, send each push, report back, repeat until the queue is empty or
// the time budget is spent. The outbox and the sender are passed in, so this is tested without the network.

// One row per (notification, device) from push_claim. A notification with nothing to send comes back once with
// a null endpoint.
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
};

export type Report = {
  // Notifications that leave the queue.
  done: string[];
  // Devices that took a push (failure count reset).
  ok: string[];
  // Devices that refused for another reason (one more failure; the tenth in a row drops the device).
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
  notifications: number;
  sent: number;
  failed: number;
  removed: number;
};

const BATCH = 50;
// Pushes in flight at once, so a big announcement doesn't open hundreds of sockets.
const PARALLEL = 10;

export async function drainOutbox(
  outbox: Outbox,
  send: Sender,
  {
    budgetMs = 40_000,
    now = Date.now,
  }: { budgetMs?: number; now?: () => number } = {},
): Promise<DrainResult> {
  const started = now();
  const total: DrainResult = {
    notifications: 0,
    sent: 0,
    failed: 0,
    removed: 0,
  };

  while (now() - started < budgetMs) {
    const rows = await outbox.claim(BATCH);
    if (rows.length === 0) break;

    const done = [...new Set(rows.map((r) => r.notification_id))];
    const jobs = rows.filter(
      (r): r is ClaimRow & { endpoint: string; p256dh: string; auth: string } =>
        r.endpoint !== null && r.p256dh !== null && r.auth !== null,
    );
    const outcomes: { endpoint: string; outcome: SendOutcome }[] = [];
    for (let i = 0; i < jobs.length; i += PARALLEL) {
      const slice = jobs.slice(i, i + PARALLEL);
      outcomes.push(
        ...(await Promise.all(
          slice.map(async (job) => ({
            endpoint: job.endpoint,
            outcome: await safeSend(send, job),
          })),
        )),
      );
    }

    const ok = new Set<string>();
    const failed = new Set<string>();
    const gone = new Set<string>();
    for (const { endpoint, outcome } of outcomes) {
      if (outcome.ok) ok.add(endpoint);
      else if (outcome.gone) gone.add(endpoint);
      else failed.add(endpoint);
    }
    // A device that went away on one push is gone, whatever happened on another.
    for (const endpoint of gone) {
      ok.delete(endpoint);
      failed.delete(endpoint);
    }

    // A report that fails throws: the lease then runs out and the rows are claimed again. A repeat push carries
    // the same tag, so the phone replaces the first one instead of showing it twice.
    await outbox.report({
      done,
      ok: [...ok],
      failed: [...failed],
      gone: [...gone],
    });

    total.notifications += done.length;
    total.sent += outcomes.filter((o) => o.outcome.ok).length;
    total.failed += failed.size;
    total.removed += gone.size;
  }
  return total;
}

async function safeSend(
  send: Sender,
  job: ClaimRow & { endpoint: string; p256dh: string; auth: string },
): Promise<SendOutcome> {
  try {
    return await send(
      { endpoint: job.endpoint, p256dh: job.p256dh, auth: job.auth },
      buildPayload(job, job.sound !== false),
    );
  } catch {
    return { ok: false, statusCode: null, gone: false };
  }
}
