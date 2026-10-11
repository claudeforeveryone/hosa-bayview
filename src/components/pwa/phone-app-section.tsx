"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/form";
import { SettingsSection } from "@/components/settings-section";
import { readNotifySound } from "@/lib/appearance";
import { installGuide } from "@/lib/pwa/install-logic";
import { promptInstall } from "@/lib/pwa/install-store";
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
import {
  pushUiState,
  type PushFacts,
  type PushUiState,
} from "@/lib/push/state";
import { AndroidMenuSteps, IosSteps } from "./install-steps";
import { readInstallEnv, useInstallEnv } from "./use-install-env";

// Settings > Phone app: the permanent home for installing HOSA and for notifications on this device.
export function PhoneAppTab({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12">
      <InstallSettings />
      <NotificationSettings vapidPublicKey={vapidPublicKey} />
    </div>
  );
}

const copy = "text-[16px] text-ink-2";

function InstallSettings() {
  const env = useInstallEnv();
  const path = usePathname();
  const [note, setNote] = useState<string | null>(null);
  const guide = env ? installGuide({ ...env, path }) : null;

  const install = async () => {
    setNote(null);
    const outcome = await promptInstall();
    if (outcome === "unavailable") {
      setNote(
        "Your browser hasn't offered the install yet. Use its menu instead.",
      );
    }
  };

  return (
    <SettingsSection
      id="install-h"
      title="Home screen"
      description="HOSA installs like an app: its own icon, full screen, no address bar."
    >
      <div className="grid gap-4">
        {guide === null ? (
          <p className={copy}>Checking this browser&hellip;</p>
        ) : null}
        {guide === "installed" ? (
          <p className={copy}>
            You&apos;re using the installed app. Nothing to do here.
          </p>
        ) : null}
        {guide === "prompt" ? (
          <div>
            <Button type="button" onClick={install}>
              Install HOSA
            </Button>
          </div>
        ) : null}
        {guide === "ios" && env ? <IosSteps browser={env.browser} /> : null}
        {guide === "android-menu" ? <AndroidMenuSteps /> : null}
        {guide === "open-in-browser" && env ? (
          <p className={copy}>
            This app&apos;s built-in browser can&apos;t install HOSA. Open this
            page in {env.platform === "ios" ? "Safari" : "Chrome"}, then come
            back here.
          </p>
        ) : null}
        {guide === "desktop" ? (
          <p className={copy}>
            On a computer, Chrome and Edge show an install button at the right
            of the address bar. On your phone, open this page and follow the
            steps here.
          </p>
        ) : null}
        {note ? (
          <p role="status" className={copy}>
            {note}
          </p>
        ) : null}
      </div>
    </SettingsSection>
  );
}

// Each device has its own subscription, saved for whoever is signed in. The layer on every signed-in page
// (usePushDeviceSync) keeps the server's copy current, including the Notification sound setting from the Sound
// tab; this section only turns the device on and off.

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

type Note = { tone: "error" | "ok"; text: string } | null;

function NotificationSettings({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  const [facts, setFacts] = useState<PushFacts | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  // readFacts never throws; the catch is for anything unforeseen, so the section can't hang on "Checking".
  const refresh = useCallback(async () => {
    const next = await readFacts(vapidPublicKey).catch(() => null);
    if (next) setFacts(next);
  }, [vapidPublicKey]);

  // Reads the browser after mount, and again when the layer drops a dead subscription. The guard drops a late
  // answer if the section has gone.
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

  const ui: PushUiState | null = facts ? pushUiState(facts) : null;

  async function turnOn() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setNote(null);
    try {
      // First thing in the tap, so the browser allows the question.
      const permission = await Notification.requestPermission();
      if (permission === "default") {
        setNote({
          tone: "error",
          text: "No answer from the browser. Tap again when you're ready.",
        });
        return;
      }
      if (permission !== "granted") return;
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
      setNote({ tone: "ok", text: "On. Send yourself a test to check it." });
    } catch (err) {
      setNote({
        tone: "error",
        text:
          err instanceof Error
            ? err.message
            : "Couldn't turn notifications on.",
      });
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function turnOff() {
    setBusy(true);
    setNote(null);
    try {
      const sub = await readSubscription();
      if (sub) {
        // The server row goes first, so a failed call leaves this device on and the switch honest.
        await send(
          "/api/push/subscribe",
          "DELETE",
          JSON.stringify({ endpoint: sub.endpoint }),
          "Couldn't turn this device off. Try again.",
        );
        await sub.unsubscribe();
      }
    } catch (err) {
      setNote({
        tone: "error",
        text:
          err instanceof Error ? err.message : "Couldn't turn this device off.",
      });
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function sendTest() {
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

  return (
    <SettingsSection
      id="push-h"
      title="Notifications"
      description="Announcements, tests, events, questions, replies and role changes, on this device."
    >
      <div className="grid gap-4">
        {ui === null ? (
          <p className={copy}>Checking this browser&hellip;</p>
        ) : null}
        {ui === "unavailable" ? (
          <p className={copy}>
            Phone notifications aren&apos;t switched on for the site yet. The
            bell still works.
          </p>
        ) : null}
        {ui === "needs-home-screen" ? (
          <p className={copy}>
            iPhone and iPad only send web notifications to installed apps. Add
            HOSA to your Home Screen (steps above), open it from there, and turn
            notifications on here.
          </p>
        ) : null}
        {ui === "unsupported" ? (
          <p className={copy}>
            This browser can&apos;t do notifications. Chrome on Android, or the
            installed app on iPhone, can.
          </p>
        ) : null}
        {ui === "blocked" ? (
          <p className={copy}>
            Notifications are blocked for HOSA. Allow them in your
            browser&apos;s site settings (or the phone&apos;s Settings,
            Notifications, HOSA), then come back.
          </p>
        ) : null}
        {ui === "on" || ui === "off" ? (
          <div className="grid gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={ui === "on"}
              aria-describedby="push-switch-hint"
              disabled={busy}
              onClick={ui === "on" ? turnOff : turnOn}
              className="press flex min-h-12 w-full items-center justify-between gap-6 text-left disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-[17px] font-semibold">
                Notifications on this device
              </span>
              <span
                aria-hidden
                className={`relative inline-flex h-8 w-14 shrink-0 border-2 border-ink ${ui === "on" ? "bg-ink" : "bg-ground"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 size-6 transition-transform duration-150 ease-out motion-reduce:transition-none ${
                    ui === "on" ? "translate-x-6 bg-ground" : "bg-ink"
                  }`}
                />
              </span>
            </button>
            <p id="push-switch-hint" className="text-[15px] text-ink-2">
              {ui === "on" ? (
                <>
                  On while you&apos;re signed in on this device. Sound follows
                  the Notification sound switch on the{" "}
                  <Link
                    href="/settings?tab=sound"
                    className="step text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                  >
                    Sound tab
                  </Link>
                  .
                </>
              ) : (
                "Off. Turning it on asks your browser first."
              )}
            </p>
            {ui === "on" ? (
              <div>
                <Button
                  type="button"
                  variant="line"
                  onClick={sendTest}
                  disabled={busy}
                >
                  Send a test
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        <p
          id="push-note"
          role="status"
          aria-live="polite"
          className={`text-[16px] ${note?.tone === "error" ? "text-danger" : "text-ok"}`}
        >
          {note?.text ?? ""}
        </p>
      </div>
    </SettingsSection>
  );
}
