"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/form";
import {
  installCardMode,
  type InstallCard as Mode,
} from "@/lib/pwa/install-logic";
import { promptInstall } from "@/lib/pwa/install-store";
import { trackPwa } from "@/lib/pwa/track";
import { AndroidMenuSteps, IosSteps } from "./install-steps";
import { rememberDismissal, useInstallEnv } from "./use-install-env";

// Held back a few seconds so it never lands on top of the opening animation or the first tap.
const SHOW_AFTER_MS = 3500;

// A small card on phones in a browser tab, above the bottom bar. Android Chrome gets an Install button (its own
// prompt); iPhone gets the Share, Add to Home Screen steps (iOS has no prompt); browsers inside other apps are
// asked to open the page in a real browser. "Not now" hides it for 30 days; Settings > Phone app always has it.
export function InstallCard() {
  const env = useInstallEnv();
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const tracked = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const mode: Mode =
    env && ready && !hidden ? installCardMode({ ...env, path }) : null;

  useEffect(() => {
    if (!mode || !env || tracked.current) return;
    tracked.current = true;
    trackPwa({
      name: "install_prompt_shown",
      code:
        env.platform === "ios"
          ? "ios"
          : env.platform === "android"
            ? "android"
            : "other",
    });
  }, [mode, env]);

  if (!mode || !env) return null;

  const dismiss = () => {
    rememberDismissal();
    setHidden(true);
  };

  const install = async () => {
    const outcome = await promptInstall();
    // Installed, or refused in the browser's own dialog: either way the card has done its job.
    if (outcome === "accepted") setHidden(true);
    else dismiss();
  };

  return (
    <aside
      aria-labelledby="install-card-h"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-md gap-4 border-[3px] border-ink bg-ground p-4 text-ink motion-safe:transition-[translate,opacity] motion-safe:duration-200 motion-safe:ease-out motion-safe:starting:translate-y-3 motion-safe:starting:opacity-0 lg:hidden"
    >
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- the home screen icon itself, 44 px. */}
        <img
          src="/icons/icon-192.png"
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0"
        />
        <h2
          id="install-card-h"
          className="font-display min-w-0 flex-1 text-[24px] leading-[0.95] font-bold uppercase"
        >
          {mode === "open-in-browser"
            ? "Open in your browser"
            : "Put HOSA on your home screen"}
        </h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="step press -mr-1 inline-flex size-11 shrink-0 items-center justify-center hover:bg-band"
        >
          <X size={22} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      {mode === "android-prompt" ? (
        <p className="text-[16px] text-ink-2">
          Opens full screen in one tap, and can buzz you when a new test or
          announcement drops.
        </p>
      ) : null}
      {mode === "ios" ? <IosSteps browser={env.browser} /> : null}
      {mode === "android-menu" ? <AndroidMenuSteps /> : null}
      {mode === "open-in-browser" ? (
        <p className="text-[16px] text-ink-2">
          This app&apos;s built-in browser can&apos;t add HOSA to your home
          screen. Open this page in{" "}
          {env.platform === "ios" ? "Safari" : "Chrome"}, then add it from
          there.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {mode === "android-prompt" ? (
          <Button type="button" onClick={install}>
            Install
          </Button>
        ) : null}
        <Button type="button" variant="line" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </aside>
  );
}
