"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Segments } from "@/components/appearance";
import { Button } from "@/components/form";
import { SettingsSection } from "@/components/settings-section";
import { handOffFocus } from "@/lib/focus-handoff";
import { installGuide } from "@/lib/pwa/install-logic";
import { promptInstall } from "@/lib/pwa/install-store";
import {
  AndroidMenuSteps,
  IosSteps,
  OpenInBrowserSteps,
} from "./install-steps";
import { useInstallEnv } from "./use-install-env";
import { usePushControl } from "./use-push-control";

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

const copy = "text-16 text-ink-2";

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
          <OpenInBrowserSteps
            platform={env.platform}
            then="and come back to this page."
          />
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
// tab; this section only turns the device on and off (usePushControl, shared with the install card).

const PUSH_OPTIONS: { id: "off" | "on"; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "on", label: "On" },
];

const soundLink =
  "step text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink";

// Kept focusable (aria-disabled, not disabled) while a change is in flight: a disabled button drops keyboard focus.
const pending = "aria-disabled:cursor-wait aria-disabled:opacity-60";

// When turning on ends in a state with no control (blocked in the browser's question, say), the segments go and the
// paragraph that explains it takes their place. Focus follows, so a keyboard or screen reader user lands on the
// explanation instead of the top of the page.
const STATE_ID = "push-state";
const toStateLine = handOffFocus(() =>
  document.getElementById(STATE_ID)?.focus(),
);
const line = { id: STATE_ID, tabIndex: -1, className: copy };

function NotificationSettings({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  const { ui, busy, note, turnOn, turnOff, sendTest } =
    usePushControl(vapidPublicKey);

  return (
    <SettingsSection
      id="push-h"
      title="Notifications"
      description="Everything the bell shows, on this device."
    >
      <div className="grid gap-4">
        {ui === null ? <p {...line}>Checking this browser&hellip;</p> : null}
        {ui === "unavailable" ? (
          <p {...line}>
            Notifications aren&apos;t switched on for the site yet. The bell
            still works.
          </p>
        ) : null}
        {ui === "needs-home-screen" ? (
          <p {...line}>
            iPhone and iPad only send web notifications to installed apps. Add
            HOSA to your Home Screen (steps above), open it from there, and turn
            notifications on here.
          </p>
        ) : null}
        {ui === "unsupported" ? (
          <p {...line}>
            This browser can&apos;t do notifications. Chrome on Android, or the
            installed app on iPhone, can.
          </p>
        ) : null}
        {ui === "needs-stay-signed-in" ? (
          <p {...line}>
            Notifications need Stay signed in. Without it, HOSA signs you out
            when this browser closes, but notifications would keep arriving. Log
            out, then log back in with Stay signed in ticked.
          </p>
        ) : null}
        {ui === "blocked" ? (
          <p {...line}>
            Notifications are blocked for HOSA. Allow them in your
            browser&apos;s site settings (or the phone&apos;s Settings,
            Notifications, HOSA), then come back.
          </p>
        ) : null}
        {ui === "on" || ui === "off" ? (
          <div ref={toStateLine} className="grid gap-4">
            <Segments
              name="push-device"
              label="Notifications on this device"
              options={PUSH_OPTIONS}
              value={ui}
              busy={busy}
              onPick={(v) => void (v === "on" ? turnOn() : turnOff())}
              hint={
                ui === "on" ? (
                  <>
                    On while you&apos;re signed in on this device. Sound follows
                    the Notification sound switch on the{" "}
                    <Link href="/settings?tab=sound" className={soundLink}>
                      Sound tab
                    </Link>
                    .
                  </>
                ) : (
                  "Off. Pick On, then Allow if asked."
                )
              }
            />
            {ui === "on" ? (
              <div>
                <Button
                  type="button"
                  variant="line"
                  onClick={() => {
                    if (!busy) void sendTest();
                  }}
                  aria-disabled={busy || undefined}
                  className={pending}
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
          className={`text-16 ${note?.tone === "error" ? "text-danger" : "text-ok"}`}
        >
          {note?.text ?? ""}
        </p>
      </div>
    </SettingsSection>
  );
}
