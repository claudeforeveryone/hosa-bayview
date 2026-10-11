"use client";

import { useEffect, useState } from "react";

const EMAIL = "hosabayview@gmail.com";

// "ground" on the page background, "field" on a navy band (Help's contact box).
type Tone = "ground" | "field";

const TONE: Record<Tone, { link: string; note: string }> = {
  ground: {
    link: "text-ink-2 hover:text-ink focus-visible:text-ink",
    note: "bg-ink text-ground",
  },
  field: {
    link: "text-on-field-2 hover:text-on-field focus-visible:text-on-field",
    note: "bg-on-field text-field",
  },
};

// The chapter's Instagram, Discord and email. Email copies the address instead of opening a mail app.
// `labelled` shows each name (and the address itself) beside its icon, for places a phone can't hover for a title.
export function SocialLinks({
  tone = "ground",
  labelled = false,
}: {
  tone?: Tone;
  labelled?: boolean;
}) {
  const link = `step group inline-flex h-11 items-center ${
    labelled ? "gap-2 px-2 text-16" : "size-11 justify-center"
  } ${TONE[tone].link}`;
  const label = (text: string) =>
    labelled ? (
      <span className="underline underline-offset-4 group-hover:decoration-2">
        {text}
      </span>
    ) : null;
  // "Copied" once it's on the clipboard; the address itself if the browser won't allow copying.
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(
      () => setNote(null),
      note === "Copied" ? 1800 : 6000,
    );
    return () => window.clearTimeout(t);
  }, [note]);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setNote("Copied");
      return;
    } catch {
      // Older browsers and some in-app browsers block the async clipboard.
    }
    const area = document.createElement("textarea");
    area.value = EMAIL;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    setNote(ok ? "Copied" : EMAIL);
  }

  // Labelled, the button's own text says "Copied" (a note under the row would hang off a band's edge). The floating
  // note is then only for the address when copying is blocked.
  const copied = labelled && note === "Copied";
  const floating = copied ? null : note;

  return (
    <div
      className={`relative flex flex-wrap items-center ${labelled ? "-ml-2 gap-x-2" : "gap-1"}`}
    >
      <a
        href="https://www.instagram.com/hosabayview/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={labelled ? undefined : "Instagram"}
        title={labelled ? undefined : "Instagram"}
        className={link}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-[22px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          aria-hidden
        >
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle
            cx="17.4"
            cy="6.6"
            r="1.1"
            fill="currentColor"
            stroke="none"
          />
        </svg>
        {label("Instagram")}
      </a>
      <a
        href="https://discord.gg/WRVY4r3tC"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={labelled ? undefined : "Discord"}
        title={labelled ? undefined : "Discord"}
        className={link}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-[23px]"
          fill="currentColor"
          aria-hidden
        >
          <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
        </svg>
        {label("Discord")}
      </a>
      <button
        type="button"
        onClick={copyEmail}
        aria-label={`Copy email ${EMAIL}`}
        title={labelled ? undefined : EMAIL}
        className={link}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-[22px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          aria-hidden
        >
          <rect x="3" y="5" width="18" height="14" />
          <path d="m3.5 5.5 8.5 7 8.5-7" />
        </svg>
        {label(copied ? "Copied" : EMAIL)}
      </button>
      {/* Outside the button so the address can be selected by hand when copying is blocked. */}
      <span
        className={`absolute top-full z-10 mt-1 px-2 py-1 text-14 whitespace-nowrap transition-opacity duration-150 ${
          labelled ? "left-2" : "right-0"
        } ${TONE[tone].note} ${
          floating ? "opacity-100" : "pointer-events-none opacity-0"
        } ${floating === "Copied" ? "caps" : "select-all"}`}
      >
        {floating}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {note === "Copied" ? "Email copied" : (note ?? "")}
      </span>
    </div>
  );
}
