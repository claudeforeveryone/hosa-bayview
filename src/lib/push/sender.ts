import webpush from "web-push";
import type { PushConfig } from "./config";
import type { PushPayload } from "./payload";
import type { PushTarget, Sender, SendOutcome } from "./deliver";

// The one place that talks to a push service. The VAPID keys go with each request, so nothing global is set.
export function makeSender(cfg: PushConfig): Sender {
  const vapidDetails = {
    subject: cfg.subject,
    publicKey: cfg.publicKey,
    privateKey: cfg.privateKey,
  };
  return async (
    target: PushTarget,
    payload: PushPayload,
  ): Promise<SendOutcome> => {
    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        JSON.stringify(payload),
        {
          // A day to deliver to a phone that is off. Anything older is stale news for a study app.
          TTL: 60 * 60 * 24,
          urgency: "normal",
          // One slow push service must not hold up the rest of the batch.
          timeout: 10_000,
          vapidDetails,
        },
      );
      return { ok: true };
    } catch (err) {
      const code = (err as { statusCode?: unknown })?.statusCode;
      const statusCode = typeof code === "number" ? code : null;
      return {
        ok: false,
        statusCode,
        gone: statusCode === 404 || statusCode === 410,
      };
    }
  };
}
