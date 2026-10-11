"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/form";
import { SettingsSection } from "@/components/settings-section";
import { readNotifySound } from "@/lib/appearance";
import { installGuide } from "@/lib/pwa/install-logic";
import { promptInstall } from "@/lib/pwa/install-store";
import { trackPwa } from "@/lib/pwa/track";
import {
  readError,
  sameServerKey,
  urlBase64ToUint8Array,
} from "@/lib/push/client";
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

// Each device has its own subscription. The Notification sound setting travels with it as `sound`, so a silent
// setting on this device makes its pushes silent; the device is re-saved whenever that setting changes.
const subscribeAppearance = (onChange: () => void) => {
  window.addEventListener("hosa:appearance", onChange);
  return () => window.removeEventListener("hosa:appearance", onChange);
};

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function subscriptionBody(
  sub: PushSubscription,
  extra: Record<string, unknown> = {},
) {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("This browser didn't give a full subscription. Try again.");
  }
  return JSON.stringify({ endpoint: json.endpoint, keys: json.keys, ...extra });
}

// redirect: "manual" so an ended session reads as an error here instead of quietly following to the sign-in page.
async function post(
  url: string,
  method: "POST" | "DELETE",
  body: string,
  fallback: string,
) {
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

const saveDevice = (sub: PushSubscription, sound: boolean) =>
  post(
    "/api/push/subscribe",
    "POST",
    subscriptionBody(sub, { sound }),
    "Couldn't save this device. Try again.",
  );

async function readFacts(vapidPublicKey: string | null): Promise<PushFacts> {
  const env = readInstallEnv();
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const permission = supported ? Notification.permission : "unsupported";
  const subscribed =
    supported && vapidPublicKey !== null
      ? (await currentSubscription()) !== null
      : false;
  return {
    configured: vapidPublicKey !== null,
    iosNeedsHomeScreen: env.platform === "ios" && !env.standalone,
    supported,
    permission,
    subscribed,
  };
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
  const sound = useSyncExternalStore(
    subscribeAppearance,
    readNotifySound,
    () => "on",
  );
  const [facts, setFacts] = useState<PushFacts | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const refresh = useCallback(async () => {
    setFacts(await readFacts(vapidPublicKey));
  }, [vapidPublicKey]);

  // Reads the browser after mount. The guard drops a late answer if the section has gone.
  useEffect(() => {
    let current = true;
    readFacts(vapidPublicKey).then((next) => {
      if (current) setFacts(next);
    });
    return () => {
      current = false;
    };
  }, [vapidPublicKey]);

  const ui: PushUiState | null = facts ? pushUiState(facts) : null;

  // Keeps the server's copy of this device current: on load (the browser may have rotated its keys, or the
  // device was signed in as someone else before) and whenever the Notification sound setting changes. Quiet on
  // failure; the switch still shows the browser's real state.
  useEffect(() => {
    if (ui !== "on") return;
    void currentSubscription()
      .then((sub) => (sub ? saveDevice(sub, sound === "on") : undefined))
      .catch(() => {});
  }, [ui, sound]);

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
        await saveDevice(sub, sound === "on");
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
      const sub = await currentSubscription();
      if (sub) {
        // The server row goes first, so a failed call leaves this device on and the switch honest.
        await post(
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
      const sub = await currentSubscription();
      if (!sub) throw new Error("Turn notifications on first.");
      await post(
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
      description="New announcements, tests, events and competitions, answers to your questions, and role changes, on this device."
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
              {ui === "on"
                ? "On. The chime follows Sound, Notification sound. Stays on until you switch it off here."
                : "Off. Turning it on asks your browser first."}
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
