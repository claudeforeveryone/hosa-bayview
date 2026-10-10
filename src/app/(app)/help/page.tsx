import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { ClassicLogo } from "@/components/classic-logo";
import { PageTitle } from "@/components/page-title";

export const metadata: Metadata = { title: "Help" };

type Topic = { id: string; q: string; a: ReactNode };

const TOPICS: Topic[] = [
  {
    id: "join",
    q: "Join an event",
    a: (
      <>
        Your trainer gives you a join code. Enter it on{" "}
        <Link href="/join" className="underline underline-offset-4">
          Join with a code
        </Link>{" "}
        (or Settings, Events tab, once you&apos;re in one already). The event
        then shows under Events and in the menu.
      </>
    ),
  },
  {
    id: "tests",
    q: "Practice vs timed tests",
    a: (
      <>
        Practice has no clock: you see if each answer is right as you go, and
        you can redo it as often as you like. Timed runs like the real
        competition: the clock counts down, answers are graded when you submit,
        and some tests limit how many tries you get. Every attempt counts toward
        your stats, Career and the leaderboards.
      </>
    ),
  },
  {
    id: "ask",
    q: "Ask teacher",
    a: (
      <>
        Stuck on a question? After answering, tap Ask teacher under it and add
        a short note. Your event&apos;s trainer sees it and replies; you get a
        notification when they do, and the reply shows under the question.
      </>
    ),
  },
  {
    id: "cards",
    q: "Flashcards",
    a: (
      <>
        Open an event&apos;s Cards tab. Tap a card to flip it, then mark Know it
        or Still learning; the ones you still need come back. You can make your
        own decks and paste many cards at once as term and definition pairs.
        Try Match for a quick game.
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
        The bell shows how many things are new: announcements, events, new
        tests and replies to your questions. Tap it to read them. A soft chime
        plays when something new arrives while you&apos;re here; switch it off
        in{" "}
        <Link href="/settings?tab=sound" className="underline underline-offset-4">
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
        <Link href="/settings?tab=look" className="underline underline-offset-4">
          Settings, Look
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
              <p className="max-w-[65ch] border-t border-rule bg-band px-4 py-4 text-[17px] leading-relaxed sm:px-5">
                {t.a}
              </p>
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
            Ask the chapter executives: catch one at a chapter meeting.
            For a question about a test or an event,
            your event&apos;s trainer is the fastest answer (use Ask teacher).
          </p>
        </div>
      </section>
    </div>
  );
}
