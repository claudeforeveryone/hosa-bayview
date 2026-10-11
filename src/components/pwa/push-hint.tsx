"use client";

import Link from "next/link";
import { usePushControl } from "./use-push-control";

const link =
  "step text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink";

// /notifications: one line when this device could get these as phone notifications but doesn't yet. Silent when
// push is on, blocked, unsupported or not set up for the site, so it never nags about something a tap can't fix.
export function PushHint({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  const { ui } = usePushControl(vapidPublicKey);
  if (ui === "off") {
    return (
      <p className="text-[16px] text-ink-2">
        Get these as notifications on this device too.{" "}
        <Link href="/settings?tab=app" className={link}>
          Turn them on in Settings
        </Link>
        .
      </p>
    );
  }
  if (ui === "needs-home-screen") {
    return (
      <p className="text-[16px] text-ink-2">
        On iPhone, these can buzz you once HOSA is on your Home Screen.{" "}
        <Link href="/settings?tab=app" className={link}>
          Settings shows how
        </Link>
        .
      </p>
    );
  }
  return null;
}
