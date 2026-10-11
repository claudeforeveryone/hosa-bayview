"use client";

import { useEffect, useState } from "react";
import {
  canPromptInstall,
  subscribeInstall,
  wasJustInstalled,
} from "@/lib/pwa/install-store";
import {
  browserOf,
  INSTALL_DISMISS_KEY,
  isDismissed,
  platformOf,
  type InstallView,
} from "@/lib/pwa/install-logic";

// True when HOSA is running from the home screen (or was installed a moment ago).
export function isStandalone(): boolean {
  if (wasJustInstalled()) return true;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type InstallEnv = Omit<InstallView, "path">;

// Reads the browser once. Storage can throw in private windows, so a failed read counts as never dismissed.
export function readInstallEnv(): InstallEnv {
  const ua = navigator.userAgent;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(INSTALL_DISMISS_KEY);
  } catch {
    stored = null;
  }
  return {
    standalone: isStandalone(),
    phone: window.matchMedia("(max-width: 767px) and (pointer: coarse)").matches,
    dismissed: isDismissed(stored, Date.now()),
    canPrompt: canPromptInstall(),
    platform: platformOf(ua, navigator.maxTouchPoints),
    browser: browserOf(ua, navigator.maxTouchPoints),
  };
}

// null until the first client render, so the server HTML and the first paint agree. Re-reads when the browser
// offers or finishes an install.
export function useInstallEnv(): InstallEnv | null {
  const [env, setEnv] = useState<InstallEnv | null>(null);
  useEffect(() => {
    const refresh = () => setEnv(readInstallEnv());
    refresh();
    return subscribeInstall(refresh);
  }, []);
  return env;
}

// Remember a "Not now" for 30 days. A storage failure still hides the card for this visit (the caller does that).
export function rememberDismissal(): void {
  try {
    localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
  } catch {
    // Private windows can refuse storage.
  }
}
