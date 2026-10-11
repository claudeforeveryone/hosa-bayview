"use client";

import { useCallback, useEffect, useState } from "react";
import { readNotifySound } from "@/lib/appearance";
import { trackPwa } from "@/lib/pwa/track";
import {
  PUSH_DEVICE_EVENT,
  pushSupported,
  readSubscription,
  saveDevice,
  send,
  subscriptionBody,
} from "@/lib/push/browser";
import { sameServerKey, urlBase64ToUint8Array } from "@/lib/push/client";
import { isShortSession, NEEDS_STAY_SIGNED_IN } from "@/lib/push/short-session";
import {
  pushUiState,
  type PushFacts,
  type PushUiState,
} from "@/lib/push/state";
import { readInstallEnv } from "./use-install-env";

// Notifications on this device: what the browser says, and turning them on and off. Shared by Settings > Phone
// app, the install card's notifications ask and the line on /notifications, so all three behave the same. The
// layer on every signed-in page (usePushDeviceSync) keeps the server's copy current after that.

const UNSUPPORTED = {
  supported: false,
  permission: "unsupported",
  subscribed: false,
} as const;

async function readFacts(vapidPublicKey: string | null): Promise<PushFacts> {
  const env = readInstallEnv();
  const base = {
    configured: vapidPublicKey !== null,
    iosNeedsHomeScreen: env.platform === "ios" && !env.standalone,
    shortSession: isShortSession(document.cookie),
  };
  if (!pushSupported()) return { ...base, ...UNSUPPORTED };
  try {
    const sub = vapidPublicKey ? await readSubscription() : null;
    return {
      ...base,
      supported: true,
      permission: Notification.permission,
      // A subscription made with an older server key can't receive anything, so it doesn't count as on.
      subscribed:
        sub !== null &&
        vapidPublicKey !== null &&
        sameServerKey(sub.options.applicationServerKey, vapidPublicKey),
    };
  } catch {
    // The browser won't run service workers for the site (storage or cookies blocked), so no push here.
    return { ...base, ...UNSUPPORTED };
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export type PushNote = { tone: "error" | "ok"; text: string } | null;

export type PushControl = {
  // null until the browser has been read.
  ui: PushUiState | null;
  busy: boolean;
  note: PushNote;
  // Resolves true once this device is on and saved for the member.
  turnOn: () => Promise<boolean>;
  turnOff: () => Promise<void>;
  sendTest: () => Promise<void>;
};

export function usePushControl(vapidPublicKey: string | null): PushControl {
  const [facts, setFacts] = useState<PushFacts | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<PushNote>(null);

  // readFacts never throws; the catch is for anything unforeseen, so a view can't hang on "Checking".
  const refresh = useCallback(async () => {
    const next = await readFacts(vapidPublicKey).catch(() => null);
    if (next) setFacts(next);
  }, [vapidPublicKey]);

  // Reads the browser after mount, and again whenever this device changes (here, in another view, or when the
  // layer drops a dead subscription). The guard drops a late answer if the view has gone.
  useEffect(() => {
    let current = true;
    const read = () => {
      readFacts(vapidPublicKey)
        .then((next) => {
          if (current) setFacts(next);
        })
        .catch(() => {
          if (current)
            setFacts({
              configured: vapidPublicKey !== null,
              iosNeedsHomeScreen: false,
              shortSession: false,
              ...UNSUPPORTED,
            });
        });
    };
    read();
    window.addEventListener(PUSH_DEVICE_EVENT, read);
    return () => {
      current = false;
      window.removeEventListener(PUSH_DEVICE_EVENT, read);
    };
  }, [vapidPublicKey]);

  // Tells every other view on the page (and this one) to read the device again.
  const changed = () => window.dispatchEvent(new Event(PUSH_DEVICE_EVENT));

  async function turnOn(): Promise<boolean> {
    if (!vapidPublicKey) return false;
    setBusy(true);
    setNote(null);
    let on = false;
    try {
      if (isShortSession(document.cookie))
        throw new Error(NEEDS_STAY_SIGNED_IN);
      // First thing in the tap, so the browser allows the question.
      const permission = await Notification.requestPermission();
      if (permission === "default") {
        setNote({
          tone: "error",
          text: "No answer from the browser. Try again when you're ready.",
        });
        return false;
      }
      if (permission !== "granted") return false;
      const registration = await withTimeout(
        navigator.serviceWorker.ready,
        8000,
        "The app is still starting. Try again in a moment.",
      );
      let sub = await registration.pushManager.getSubscription();
      if (
        sub &&
        !sameServerKey(sub.options.applicationServerKey, vapidPublicKey)
      ) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await registration.pushManager
        .subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })
        .catch(() => {
          // The browser's own reasons ("Registration failed - ...") mean nothing to a member.
          throw new Error(
            "This browser wouldn't set up notifications. Check it allows them for HOSA, then try again.",
          );
        });
      try {
        await saveDevice(sub, readNotifySound() === "on");
      } catch (err) {
        await sub.unsubscribe().catch(() => {});
        throw err;
      }
      trackPwa({ name: "push_enabled" });
      setNote({ tone: "ok", text: "Send yourself a test to check it." });
      on = true;
      return true;
    } catch (err) {
      setNote({
        tone: "error",
        text:
          err instanceof Error
            ? err.message
            : "Couldn't turn notifications on.",
      });
      return false;
    } finally {
      setBusy(false);
      await refresh();
      if (on) changed();
    }
  }

  async function turnOff(): Promise<void> {
    setBusy(true);
    setNote(null);
    let off = false;
    try {
      const sub = await readSubscription();
      if (sub) {
        // The server row goes first, so a failed call leaves this device on and the control honest.
        await send(
          "/api/push/subscribe",
          "DELETE",
          JSON.stringify({ endpoint: sub.endpoint }),
          "Couldn't turn this device off. Try again.",
        );
        await sub.unsubscribe();
      }
      off = true;
    } catch (err) {
      setNote({
        tone: "error",
        text:
          err instanceof Error ? err.message : "Couldn't turn this device off.",
      });
    } finally {
      setBusy(false);
      await refresh();
      if (off) changed();
    }
  }

  async function sendTest(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const sub = await readSubscription();
      if (!sub) throw new Error("Turn notifications on first.");
      await send(
        "/api/push/test",
        "POST",
        subscriptionBody(sub),
        "The test didn't go out. Try again.",
      );
      setNote({ tone: "ok", text: "Sent. It should land in a few seconds." });
    } catch (err) {
      setNote({
        tone: "error",
        text: err instanceof Error ? err.message : "The test didn't go out.",
      });
    } finally {
      setBusy(false);
    }
  }

  return {
    ui: facts ? pushUiState(facts) : null,
    busy,
    note,
    turnOn,
    turnOff,
    sendTest,
  };
}
