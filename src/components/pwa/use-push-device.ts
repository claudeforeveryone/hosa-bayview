"use client";

import { useEffect } from "react";
import { readNotifySound } from "@/lib/appearance";
import {
  currentSubscription,
  dropDevice,
  PUSH_DEVICE_EVENT,
  pushSupported,
  saveDevice,
} from "@/lib/push/browser";
import { sameServerKey } from "@/lib/push/client";
import { deviceSyncStep } from "@/lib/push/device-sync";
import { isShortSession } from "@/lib/push/short-session";

// The last save this page load (member, device, sound). Module state, so client navigations between layouts
// don't save twice; a full load starts again.
let lastSaved: string | null = null;

// Signed-in pages: keep this device's push row current (see src/lib/push/device-sync.ts). Runs on load and
// whenever an appearance setting changes, which is how a new Notification sound setting reaches the server
// whichever Settings tab it was changed on. Quiet on failure: the next load or change tries again.
export function usePushDeviceSync(
  pushKey: string | null,
  userId: string | null,
): void {
  useEffect(() => {
    if (!pushKey || !userId || !pushSupported()) return;
    let alive = true;
    let busy = false;
    let again = false;

    const sync = async () => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        do {
          again = false;
          const sub = await currentSubscription();
          const sound = readNotifySound() === "on";
          const step = deviceSyncStep({
            userId,
            permission: Notification.permission,
            subscription: sub
              ? {
                  endpoint: sub.endpoint,
                  sameKey: sameServerKey(
                    sub.options.applicationServerKey,
                    pushKey,
                  ),
                }
              : null,
            sound,
            shortSession: isShortSession(document.cookie),
            lastSaved,
          });
          if (!alive || !sub) return;
          if (step.kind === "save") {
            await saveDevice(sub, sound);
            lastSaved = step.key;
          } else if (step.kind === "drop") {
            await dropDevice(sub);
            lastSaved = null;
            window.dispatchEvent(new Event(PUSH_DEVICE_EVENT));
          }
        } while (again && alive);
      } catch {
        // Offline, signed out mid-way, or the push tables aren't there yet. Nothing to show for it.
      } finally {
        busy = false;
      }
    };

    void sync();
    window.addEventListener("hosa:appearance", sync);
    return () => {
      alive = false;
      window.removeEventListener("hosa:appearance", sync);
    };
  }, [pushKey, userId]);
}

// Signed-out pages (sign-in and sign-up): this browser keeps no push subscription without a session, so the next
// person to sign in here starts with notifications off instead of inheriting the last member's. Sign-out already
// removed the server row (src/lib/push/forget.ts); this ends the browser's half.
export function useForgetPushDevice(active: boolean): void {
  useEffect(() => {
    if (!active || !pushSupported()) return;
    lastSaved = null;
    void currentSubscription()
      .then((sub) => sub?.unsubscribe())
      .catch(() => {});
  }, [active]);
}
