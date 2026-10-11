"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/form";
import { focusRegion, handOffFocus } from "@/lib/focus-handoff";
import {
  installCardMode,
  isQuietPath,
  PUSH_CARD_DISMISS_KEY,
  type InstallCard as Mode,
} from "@/lib/pwa/install-logic";
import { promptInstall } from "@/lib/pwa/install-store";
import { trackPwa } from "@/lib/pwa/track";
import {
  AndroidMenuShortSteps,
  IosShortSteps,
  OpenInBrowserSteps,
} from "./install-steps";
import { rememberDismissal, useInstallEnv } from "./use-install-env";
import { usePushControl } from "./use-push-control";

// Held back a few seconds so it never lands on top of the opening animation or the first tap.
const SHOW_AFTER_MS = 3500;

// Turn on and Send a test stay focusable (aria-disabled, not disabled) while they work: a disabled button drops
// keyboard focus.
const pending = "aria-disabled:cursor-wait aria-disabled:opacity-60";

// The card can go while it holds keyboard focus: Not now, Done, Install, or a Turn on the browser's question
// refused. Focus then moves to the page's main content rather than falling back to the top of the page. Turning on
// from the card swaps Turn on for Done, and focus moves to Done.
const DONE_ID = "install-card-done";
const toMain = handOffFocus(() => focusRegion(document.getElementById("main")));
const toDone = handOffFocus(() => document.getElementById(DONE_ID)?.focus());

// A short card on phones, docked on the bottom bar. In a browser tab it asks to install: Android Chrome gets an
// Install button (its own prompt); iPhone gets one line, Share then Add to Home Screen (iOS has no prompt), with
// the full steps a tap away in Settings > Phone app; browsers inside other apps are asked to open the page in a
// real browser. Once installed (or the install was turned down) it asks to turn on notifications, with the same
// flow as Settings, so the browser's permission question still comes only from that tap. "Not now" hides each
// ask for 30 days; Settings > Phone app always has both.
export function InstallCard({ pushKey }: { pushKey: string | null }) {
  const env = useInstallEnv();
  const path = usePathname();
  const push = usePushControl(pushKey);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Turned on from this card: it stays up to say so (and offer a test) until Done.
  const [turnedOn, setTurnedOn] = useState(false);
  const tracked = useRef(false);
  const card = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  let mode: Mode = null;
  if (env && ready && !hidden) {
    mode = turnedOn
      ? isQuietPath(path)
        ? null
        : "notifications"
      : installCardMode({ ...env, path }, push.ui);
  }
  const shown = mode !== null;

  // Counts install asks only; turning notifications on is counted by push_enabled.
  useEffect(() => {
    if (!mode || mode === "notifications" || !env || tracked.current) return;
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

  // The card covers the bottom of the page. The page gets the card's height as extra room to scroll its last lines
  // out from under it, and the viewport a scroll padding the height of the card plus the bar it sits on, so a link
  // or button reached with Tab (or a switch control) is scrolled up into view above them, never left underneath.
  useLayoutEffect(() => {
    const el = card.current;
    if (!shown || !el) return;
    const body = document.body;
    const root = document.documentElement;
    const fit = () => {
      // The card's own bottom offset is the bar's height plus the safe area, resolved to pixels.
      const below = parseFloat(getComputedStyle(el).bottom) || 0;
      body.style.paddingBottom = `${el.offsetHeight}px`;
      root.style.scrollPaddingBottom = `${el.offsetHeight + below}px`;
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", fit);
      body.style.paddingBottom = "";
      root.style.scrollPaddingBottom = "";
    };
  }, [shown]);

  if (!mode || !env) return null;

  const asking = mode === "notifications" && !turnedOn;

  const dismiss = () => {
    rememberDismissal(
      mode === "notifications" ? PUSH_CARD_DISMISS_KEY : undefined,
    );
    setHidden(true);
  };

  const install = async () => {
    const outcome = await promptInstall();
    // Installed, or refused in the browser's own dialog: either way the card has done its job.
    if (outcome === "accepted") setHidden(true);
    else dismiss();
  };

  const turnOn = async () => {
    if (await push.turnOn()) setTurnedOn(true);
  };

  const hasSteps = mode === "ios" || mode === "android-menu";

  const title =
    mode === "notifications"
      ? turnedOn
        ? "Notifications on"
        : "Turn on notifications"
      : mode === "open-in-browser"
        ? "Open in your browser"
        : "Put HOSA on your home screen";

  return (
    <aside
      ref={card}
      aria-labelledby="install-card-h"
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t-[3px] border-ink bg-ground text-ink motion-safe:transition-[translate,opacity] motion-safe:duration-200 motion-safe:ease-out motion-safe:starting:translate-y-3 motion-safe:starting:opacity-0 lg:hidden"
    >
      <div ref={toMain} className="mx-auto grid max-w-md gap-3 px-4 pt-3 pb-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- the home screen icon itself, 40 px. */}
          <img
            src="/icons/icon-192.png"
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0"
          />
          <h2
            id="install-card-h"
            className="font-display min-w-0 flex-1 text-22 leading-[0.95] font-bold uppercase"
          >
            {title}
          </h2>
        </div>

        {mode === "android-prompt" ? (
          <p className="text-16 text-ink-2">
            Opens full screen in one tap, and can buzz you when a new test or
            announcement drops.
          </p>
        ) : null}
        {mode === "ios" ? <IosShortSteps browser={env.browser} /> : null}
        {mode === "android-menu" ? <AndroidMenuShortSteps /> : null}
        {mode === "open-in-browser" ? (
          <OpenInBrowserSteps
            platform={env.platform}
            then="and add it from there."
          />
        ) : null}
        {asking ? (
          <p className="text-16 text-ink-2">
            Get a buzz on this phone when a new test, announcement or reply
            lands. Change it any time in Settings.
          </p>
        ) : null}
        {mode === "notifications" ? (
          // The flow's own words: a problem while asking, then "On" and how the test went.
          <p
            role="status"
            aria-live="polite"
            className={`text-16 empty:hidden ${push.note?.tone === "error" ? "text-danger" : "text-ink"}`}
          >
            {push.note?.text ?? ""}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {mode === "android-prompt" ? (
            <Button type="button" onClick={install}>
              Install
            </Button>
          ) : null}
          {hasSteps ? (
            <Link
              href="/settings?tab=app"
              className="caps step press inline-flex h-12 items-center justify-center bg-ink px-6 text-17 text-ground hover:bg-ink-2"
            >
              Show me
            </Link>
          ) : null}
          {asking ? (
            <Button
              ref={toDone}
              type="button"
              onClick={() => {
                if (!push.busy) void turnOn();
              }}
              aria-disabled={push.busy || undefined}
              className={pending}
            >
              Turn on
            </Button>
          ) : null}
          {turnedOn ? (
            <>
              <Button
                id={DONE_ID}
                type="button"
                onClick={() => setHidden(true)}
              >
                Done
              </Button>
              <Button
                type="button"
                variant="line"
                onClick={() => {
                  if (!push.busy) void push.sendTest();
                }}
                aria-disabled={push.busy || undefined}
                className={pending}
              >
                Send a test
              </Button>
            </>
          ) : (
            <Button type="button" variant="line" onClick={dismiss}>
              Not now
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
