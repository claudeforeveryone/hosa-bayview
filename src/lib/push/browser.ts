// Browser-side push plumbing shared by Settings > Phone app and the layer that keeps this device's row current.
// Only imported by client components.
import { readError } from "./client";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// This browser's push subscription. Throws when the browser refuses service workers for the site (a
// SecurityError when storage or cookies are blocked), so Settings can say push isn't available here.
export async function readSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager?.getSubscription()) ?? null;
}

// The same, for background work that should stay quiet: a refusal reads as no subscription.
export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    return await readSubscription();
  } catch {
    return null;
  }
}

export function subscriptionBody(
  sub: PushSubscription,
  extra: Record<string, unknown> = {},
): string {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("This browser didn't give a full subscription. Try again.");
  }
  return JSON.stringify({ endpoint: json.endpoint, keys: json.keys, ...extra });
}

// redirect: "manual" so an ended session reads as an error here instead of quietly following to the sign-in page.
export async function send(
  url: string,
  method: "POST" | "DELETE",
  body: string,
  fallback: string,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body,
    credentials: "same-origin",
    redirect: "manual",
  });
  if (res.type === "opaqueredirect")
    throw new Error("Sign in again to change notifications.");
  if (!res.ok) throw new Error(await readError(res, fallback));
  return res;
}

// Saves (or moves) this device to whoever is signed in, with its Notification sound setting.
export const saveDevice = (sub: PushSubscription, sound: boolean) =>
  send(
    "/api/push/subscribe",
    "POST",
    subscriptionBody(sub, { sound }),
    "Couldn't save this device. Try again.",
  );

// Best effort, both halves at once: the server row (needs a session) and the browser's subscription (works
// without one; once it is gone the push service refuses anything still sent to it, and the sender drops the row).
export async function dropDevice(sub: PushSubscription): Promise<void> {
  await Promise.allSettled([
    send(
      "/api/push/subscribe",
      "DELETE",
      JSON.stringify({ endpoint: sub.endpoint }),
      "Couldn't turn this device off.",
    ),
    sub.unsubscribe(),
  ]);
}

// Settings listens for this to re-read the switch after the layer changed the device behind its back.
export const PUSH_DEVICE_EVENT = "hosa:push-device";
