"use client";

import { useState } from "react";
import Link from "next/link";
import {
  INSTALL_DISMISS_KEY,
  pushHintMode,
  PUSH_CARD_DISMISS_KEY,
} from "@/lib/pwa/install-logic";
import { rememberDismissal, useInstallEnv } from "./use-install-env";
import { usePushControl } from "./use-push-control";

const link =
  "step text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink";

// /notifications: one line when this device could get these as phone notifications but doesn't yet. It is the only
// ask on this page (the install card stays off it). Silent when push is on, blocked, unsupported or not set up for
// the site, so it never nags about something a tap can't fix, and for 30 days after a "Not now", here or on the
// card (they share the keys).
export function PushHint({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  const env = useInstallEnv();
  const { ui } = usePushControl(vapidPublicKey);
  const [hidden, setHidden] = useState(false);
  const mode = env && !hidden ? pushHintMode(ui, env) : null;
  if (!mode) return null;

  const dismiss = () => {
    rememberDismissal(
      mode === "turn-on" ? PUSH_CARD_DISMISS_KEY : INSTALL_DISMISS_KEY,
    );
    setHidden(true);
  };

  return (
    <div className="flex items-start gap-4">
      {mode === "turn-on" ? (
        <p className="min-w-0 pt-2 text-[16px] text-ink-2">
          Get these as notifications on this device too.{" "}
          <Link href="/settings?tab=app" className={link}>
            Turn them on in Settings
          </Link>
          .
        </p>
      ) : (
        <p className="min-w-0 pt-2 text-[16px] text-ink-2">
          On iPhone, these can buzz you once HOSA is on your Home Screen.{" "}
          <Link href="/settings?tab=app" className={link}>
            Settings shows how
          </Link>
          .
        </p>
      )}
      <button
        type="button"
        onClick={dismiss}
        className="caps step -mr-2 inline-flex h-11 shrink-0 items-center px-2 text-[15px] text-ink-2 hover:text-ink"
      >
        Not now
      </button>
    </div>
  );
}
