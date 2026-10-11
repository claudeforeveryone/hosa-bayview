import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { ClassicLogo } from "@/components/classic-logo";
import { PageTitle } from "@/components/page-title";
import { SocialLinks } from "@/components/social-links";

export const metadata: Metadata = { title: "Help" };

type Topic = { id: string; q: string; a: ReactNode };

const TOPICS: Topic[] = [
  {
    id: "join",
    q: "Join an event",
    a: (
      <>
        Get the code from your trainer and enter it on{" "}
        <Link href="/join" className="underline underline-offset-4">
          Join an event
        </Link>
        . The event then shows under Events.
      </>
    ),
  },
  {
    id: "tests",
    q: "Practice vs timed tests",
    a: (
      <>
        Practice has no clock. You see right or wrong as you go (unless the
        trainer hides answers) and can redo it as often as you like. Timed runs
        like the real competition: the clock counts down, you&apos;re graded
        when you submit, and some tests limit your tries. Every attempt counts
        toward your stats, Career and the leaderboard.
      </>
    ),
  },
  {
    id: "ask",
    q: "Ask teacher",
    a: (
      <>
        Stuck on a question? After you answer it, tap Ask teacher and add a
        short note. You get a notification when your trainer replies, and the
        reply shows under the question.
      </>
    ),
  },
  {
    id: "cards",
    q: "Flashcards",
    a: (
      <>
        Open an event&apos;s Cards tab, tap a card to flip it, then mark Know it
        or Still learning. Make your own decks by pasting term and definition
        pairs, and try Match for a quick game.
      </>
    ),
  },
  {
    id: "battles",
    q: "Battles",
    a: (
      <>
        Live quiz rounds against other members, 1v1 up to teams. Start one from
        an event, share the code, and everyone answers the same question at
        once. Faster right answers score more.
      </>
    ),
  },
  {
    id: "notifications",
    q: "Notifications",
    a: (
      <>
        The bell counts what&apos;s new: announcements, events, tests and
        replies to your questions. A soft chime plays when something arrives
        while you&apos;re here; turn it off in{" "}
        <Link
          href="/settings?tab=sound"
          className="underline underline-offset-4"
        >
          Settings, Sound
        </Link>
        .
      </>
    ),
  },
  {
    id: "look",
    q: "Change the look",
    a: (
      <>
        <Link
          href="/settings?tab=appearance"
          className="underline underline-offset-4"
        >
          Settings, Appearance
        </Link>{" "}
        has light or dark mode (or follow your device), colour themes, a
        highlight colour, bigger text and a dyslexia-friendly font. These are
        saved on this device only.
      </>
    ),
  },
];

export default function HelpPage() {
  return (
    <div className="grid grid-cols-1 gap-10">
      <PageTitle meta="How things work and who to ask">Help</PageTitle>

      <section aria-labelledby="how-h" className="grid gap-3">
        <h2
          id="how-h"
          className="caps border-b-[3px] border-ink pb-2 text-[16px]"
        >
          How to
        </h2>
        <div className="border-2 border-ink">
          {TOPICS.map((t) => (
            <details
              key={t.id}
              id={t.id}
              className="group border-t border-rule first:border-t-0"
            >
              <summary className="step flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 hover:bg-band sm:px-5 [&::-webkit-details-marker]:hidden">
                <span className="caps text-[19px] leading-tight">{t.q}</span>
                <ChevronDown
                  size={22}
                  strokeWidth={1.75}
                  aria-hidden
                  className="shrink-0 transition-transform group-open:rotate-180"
                />
              </summary>
              {/* The band spans the whole box and the text starts on the same inset as the question above it. */}
              <div className="border-t border-rule bg-band px-4 py-4 sm:px-5">
                <p className="max-w-[75ch] text-[17px] leading-relaxed">
                  {t.a}
                </p>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="contact-h"
        className="grid gap-5 bg-field p-5 text-on-field sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-8"
      >
        <ClassicLogo className="h-[96px] sm:h-[120px]" />
        <div className="grid gap-2">
          <h2
            id="contact-h"
            className="font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-none font-bold uppercase"
          >
            Still stuck?
          </h2>
          <p className="max-w-[60ch] text-[17px] text-on-field-2">
            For a test question, Ask teacher reaches your trainer fastest. For
            anything else, catch an executive at a chapter meeting.
          </p>
          {/* The chapter's own channels. The Members page has them too, but only executives can open it. */}
          <SocialLinks tone="field" labelled />
        </div>
      </section>
    </div>
  );
}
