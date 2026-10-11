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
      // No status: a network blip (retried later), or web-push refusing the subscription's keys before sending.
      if (statusCode === null && !canEncryptFor(target)) {
        return { ok: false, statusCode: 400, gone: false };
      }
      return {
        ok: false,
        statusCode,
        gone: statusCode === 404 || statusCode === 410,
      };
    }
  };
}

// web-push encrypts for the subscription's keys before it opens a connection, and throws a plain Error when it can't
// (a key that isn't 65 bytes, isn't a point on the curve, or an auth secret under 16 bytes). That Error has no status,
// like a timeout, so it would be retried 5 times on every notification. Encrypting again here with web-push's own
// code tells the two apart without guessing from error text; a broken key is reported as a refusal (400), one
// strike against the device. Only runs after a failure with no status, so a normal send pays nothing for it.
function canEncryptFor(target: PushTarget): boolean {
  try {
    webpush.encrypt(target.p256dh, target.auth, "", "aes128gcm");
    return true;
  } catch {
    return false;
  }
}
