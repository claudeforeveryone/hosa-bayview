import Link from "next/link";
import { formatCount } from "@/lib/activity";
import type { CareerFilter } from "@/lib/career";
import { PRACTICE_SETS } from "@/lib/career-practice";

// Quiz and flashcard doors for each set of answers. Counts are the questions each set can use right now.
export function CareerPracticePanel({
  counts,
}: {
  counts: Record<CareerFilter, number>;
}) {
  return (
    <section aria-labelledby="practise-h" className="grid gap-4">
      <h2
        id="practise-h"
        className="border-t-[3px] border-ink px-1 pt-3 font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase sm:px-3"
      >
        Quiz yourself
      </h2>
      <ul className="border-t border-rule">
        {PRACTICE_SETS.map(({ set, label }) => {
          const n = counts[set];
          const on = n > 0;
          return (
            <li
              key={set}
              className="grid gap-3 border-b border-rule px-1 py-4 sm:px-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="caps text-18 font-semibold">{label}</p>
                <p className="num text-16 text-ink-2">
                  {formatCount(n)} {n === 1 ? "question" : "questions"}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <PracticeAction
                  on={on}
                  href={`/career/quiz?set=${set}&size=quick`}
                >
                  Quick quiz
                </PracticeAction>
                <PracticeAction
                  on={on}
                  href={`/career/quiz?set=${set}&size=complete`}
                >
                  Full quiz
                </PracticeAction>
                <PracticeAction on={on} href={`/career/flashcards?set=${set}`}>
                  Flashcards
                </PracticeAction>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-15 text-ink-2">
        A quick quiz is 10 random questions from the set; a full quiz is all of
        them. Questions whose answers your trainer hides aren&apos;t included.
      </p>
      <Link
        href="/career?tab=questions"
        className="caps step press inline-flex min-h-12 items-center justify-center border-2 border-ink px-5 text-16 hover:bg-band sm:justify-self-start"
      >
        Quiz one test or topic
      </Link>
    </section>
  );
}

function PracticeAction({
  on,
  href,
  children,
}: {
  on: boolean;
  href: string;
  children: string;
}) {
  if (!on) {
    return (
      <span
        aria-disabled="true"
        className="caps grid min-h-12 place-items-center border-2 border-rule-strong px-1 text-center text-14 text-ink-2 sm:text-16"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="caps step grid min-h-12 place-items-center border-2 border-ink px-1 text-center text-14 hover:bg-band sm:text-16"
    >
      {children}
    </Link>
  );
}
