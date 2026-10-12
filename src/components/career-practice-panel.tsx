import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { formatCount } from "@/lib/activity";
import type { CareerFilter } from "@/lib/career";
import { PRACTICE_SETS } from "@/lib/career-practice";

// What each set holds, and what to do when it's empty.
const BLURB: Record<CareerFilter, { line: string; empty: ReactNode }> = {
  favorites: {
    line: "Questions you starred",
    empty: (
      <>
        Star a question under{" "}
        <Link
          href="/career?tab=questions"
          className="text-ink underline underline-offset-4"
        >
          Questions
        </Link>{" "}
        and it lands here.
      </>
    ),
  },
  all: {
    line: "Everything you've answered",
    empty: "Answer a question in any event and it shows up here.",
  },
  right: {
    line: "Ones you nailed",
    empty: "Get a question right and it shows up here.",
  },
  wrong: {
    line: "Ones to fix",
    empty: "Nothing to fix right now. Nice work.",
  },
};

// The set worth practising most gets the navy tile.
const LEAD: CareerFilter = "wrong";

// Quiz and flashcard doors for each set of answers. Counts are the questions each set can use right now.
export function CareerPracticePanel({
  counts,
}: {
  counts: Record<CareerFilter, number>;
}) {
  return (
    <section
      aria-labelledby="practise-h"
      className="grid min-w-0 border-[3px] border-ink bg-ground"
    >
      <div className="grid gap-1 bg-ink px-3 py-3 text-ground sm:px-4">
        <h2
          id="practise-h"
          className="font-display text-[clamp(1.6rem,6vw,2.1rem)] leading-none font-bold uppercase"
        >
          Quiz yourself
        </h2>
        <p className="text-15">
          Built from questions you&apos;ve already answered.
        </p>
      </div>

      <ul className="grid sm:grid-cols-2">
        {PRACTICE_SETS.map(({ set, label }, i) => (
          <li
            key={set}
            className={`grid min-w-0 ${i > 0 ? "border-t-2 border-ink" : ""} ${
              i === 1 ? "sm:border-t-0" : ""
            } ${i % 2 === 1 ? "sm:border-l-2" : ""}`}
          >
            <PracticeSet
              set={set}
              label={label}
              n={counts[set]}
              lead={set === LEAD}
            />
          </li>
        ))}
      </ul>

      <div className="grid gap-3 border-t-2 border-ink bg-band px-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:px-4">
        <p className="max-w-[60ch] text-15 text-ink-2">
          A quick quiz is 10 random questions from the set; a full quiz is all
          of them. Questions whose answers your trainer hides aren&apos;t
          included.
        </p>
        <Link
          href="/career?tab=questions"
          className="caps step press inline-flex min-h-12 items-center justify-center gap-2 border-2 border-ink bg-ground px-5 text-16 hover:bg-ink hover:text-ground"
        >
          Quiz one test or topic
          <ArrowRight size={18} strokeWidth={2} aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function PracticeSet({
  set,
  label,
  n,
  lead,
}: {
  set: CareerFilter;
  label: string;
  n: number;
  lead: boolean;
}) {
  const id = `practise-${set}`;
  const blurb = BLURB[set];
  const on = n > 0;
  // Navy only while there is something to practise; an empty set always reads as off.
  const navy = lead && on;

  return (
    <article
      aria-labelledby={id}
      className={`grid content-between gap-4 p-3 sm:p-4 ${
        navy ? "bg-field text-on-field" : on ? "" : "bg-band"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h3 id={id} className="caps text-18 leading-tight">
            {label}
          </h3>
          <p className={`text-15 ${navy ? "text-on-field-2" : "text-ink-2"}`}>
            {blurb.line}
            {navy ? ". Start here." : null}
          </p>
        </div>
        <p
          className={`grid shrink-0 justify-items-end gap-0.5 ${
            on ? "" : "text-ink-2"
          }`}
        >
          <span className="num font-display text-40 leading-none font-bold">
            {formatCount(n)}
          </span>
          <span
            className={`caps text-12 ${navy ? "text-on-field-2" : "text-ink-2"}`}
          >
            {n === 1 ? "question" : "questions"}
          </span>
        </p>
      </div>

      {on ? (
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/career/quiz?set=${set}&size=quick`}
            className={`caps step press col-span-2 inline-flex min-h-12 items-center justify-between gap-2 border-2 px-4 text-16 ${
              navy
                ? "border-on-field bg-on-field text-field hover:border-on-field-2 hover:bg-on-field-2"
                : "border-ink bg-ink text-ground hover:border-ink-2 hover:bg-ink-2"
            }`}
          >
            <span>
              Quick quiz<span className="sr-only">: {label}</span>
            </span>
            <ArrowRight size={20} strokeWidth={2} aria-hidden />
          </Link>
          <SecondaryAction
            navy={navy}
            href={`/career/quiz?set=${set}&size=complete`}
            label={label}
          >
            Full quiz
          </SecondaryAction>
          <SecondaryAction
            navy={navy}
            href={`/career/flashcards?set=${set}`}
            label={label}
          >
            Flashcards
          </SecondaryAction>
        </div>
      ) : (
        <p className="border-t-2 border-rule-strong pt-3 text-15 text-ink-2">
          {blurb.empty}
        </p>
      )}
    </article>
  );
}

function SecondaryAction({
  navy,
  href,
  label,
  children,
}: {
  navy: boolean;
  href: string;
  label: string;
  children: string;
}) {
  return (
    <Link
      href={href}
      className={`caps step press grid min-h-12 place-items-center border-2 px-1 text-center text-15 sm:text-16 ${
        navy ? "border-on-field-2 hover:bg-field-2" : "border-ink hover:bg-band"
      }`}
    >
      <span>
        {children}
        <span className="sr-only">: {label}</span>
      </span>
    </Link>
  );
}
