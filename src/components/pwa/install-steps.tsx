import { Ellipsis, EllipsisVertical, SquarePlus } from "lucide-react";
import type { ReactNode } from "react";
import type { Browser } from "@/lib/pwa/install-logic";
import { ShareGlyph } from "./share-glyph";

// The steps to add HOSA to a home screen, with the glyphs the member will actually tap. Shared by the install
// card and Settings > Phone app.

function Step({ glyph, children }: { glyph: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="inline-flex size-10 shrink-0 items-center justify-center border-2 border-ink">
        {glyph}
      </span>
      <span className="min-w-0 pt-1.5 text-[16px] leading-snug">
        {children}
      </span>
    </li>
  );
}

const hint = "block text-[15px] text-ink-2";

// The app's own icon, so step 3 shows exactly what lands on the home screen.
function AppIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 22 px static icon; next/image adds nothing here.
    <img
      src="/icons/icon-192.png"
      alt=""
      width={22}
      height={22}
      className="size-[22px]"
    />
  );
}

export function IosSteps({ browser }: { browser: Browser }) {
  return (
    <ol className="grid gap-3">
      <Step glyph={<ShareGlyph size={22} />}>
        Tap <strong className="font-semibold">Share</strong>
        {browser === "safari" ? (
          <span className={hint}>
            At the bottom of Safari. On iOS 26, tap{" "}
            <Ellipsis
              size={16}
              strokeWidth={2}
              aria-label="More"
              className="inline align-[-3px]"
            />{" "}
            first.
          </span>
        ) : (
          <span className={hint}>Next to the address bar.</span>
        )}
      </Step>
      <Step glyph={<SquarePlus size={22} strokeWidth={1.75} aria-hidden />}>
        Tap <strong className="font-semibold">Add to Home Screen</strong>
        <span className={hint}>
          Scroll down, or tap More, if you don&apos;t see it.
        </span>
      </Step>
      <Step glyph={<AppIcon />}>
        Open <strong className="font-semibold">HOSA</strong> from your home
        screen
        <span className={hint}>
          Then turn on notifications in Settings, Phone app.
        </span>
      </Step>
    </ol>
  );
}

export function AndroidMenuSteps() {
  return (
    <ol className="grid gap-3">
      <Step
        glyph={<EllipsisVertical size={22} strokeWidth={1.75} aria-hidden />}
      >
        Open your browser&apos;s <strong className="font-semibold">menu</strong>
        <span className={hint}>
          The three dots, or three lines at the bottom.
        </span>
      </Step>
      <Step glyph={<SquarePlus size={22} strokeWidth={1.75} aria-hidden />}>
        Tap <strong className="font-semibold">Install</strong> or{" "}
        <strong className="font-semibold">Add to Home screen</strong>
      </Step>
      <Step glyph={<AppIcon />}>
        Open <strong className="font-semibold">HOSA</strong> from your home
        screen
      </Step>
    </ol>
  );
}

// The install card's one-line versions. The numbered steps above live in Settings > Phone app ("Show me").
const inlineGlyph = "mx-0.5 inline-block align-[-4px]";

export function IosShortSteps({ browser }: { browser: Browser }) {
  return (
    <div className="grid gap-1">
      <p className="text-[17px] leading-snug">
        Tap <ShareGlyph size={20} className={inlineGlyph} />{" "}
        <strong className="font-semibold">Share</strong>, then{" "}
        <strong className="font-semibold">Add to Home Screen</strong>.
      </p>
      {browser === "safari" ? (
        <p className="text-[15px] leading-snug text-ink-2">
          On iOS 26, tap{" "}
          <Ellipsis
            size={16}
            strokeWidth={2}
            aria-label="More"
            className={inlineGlyph}
          />{" "}
          first.
        </p>
      ) : null}
    </div>
  );
}

export function AndroidMenuShortSteps() {
  return (
    <p className="text-[17px] leading-snug">
      Open the browser menu{" "}
      <EllipsisVertical
        size={20}
        strokeWidth={1.75}
        aria-label="(three dots)"
        className={inlineGlyph}
      />
      , then <strong className="font-semibold">Install</strong> or{" "}
      <strong className="font-semibold">Add to Home screen</strong>.
    </p>
  );
}
