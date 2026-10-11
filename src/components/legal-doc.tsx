import type { ReactNode } from "react";
import { PageTitle } from "@/components/page-title";
import { CONTACT_EMAIL, LEGAL_EFFECTIVE } from "@/lib/legal";

// The terms and the privacy policy share one shape: the title and date, a boxed short version for people who read
// nothing else, the not-a-lawyer note, then sections under 3px ink rules (the app's box rule).
export function LegalDoc({
  title,
  summary,
  children,
}: {
  title: string;
  summary: ReactNode[];
  children: ReactNode;
}) {
  return (
    <article className="grid gap-10">
      <div className="grid gap-6">
        <PageTitle meta={`Effective ${LEGAL_EFFECTIVE}`}>{title}</PageTitle>
        <section
          aria-labelledby="short-h"
          className="grid gap-3 border-[3px] border-ink bg-band p-5 sm:p-6"
        >
          <h2 id="short-h" className="caps text-[19px] leading-none">
            The short version
          </h2>
          <List>{summary}</List>
        </section>
        <p className="text-[15px] text-ink-2">
          We wrote this ourselves in plain language. It has not been reviewed by
          a lawyer. If anything here conflicts with the law, the law wins.
        </p>
      </div>
      {children}
    </article>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid scroll-mt-6 gap-4 border-t-[3px] border-ink pt-5"
    >
      <h2
        id={id}
        className="font-display text-[clamp(1.6rem,6vw,2.1rem)] leading-none font-bold uppercase text-balance"
      >
        {title}
      </h2>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

// Square markers: nothing on this site is round.
export function List({ children }: { children: ReactNode[] }) {
  return (
    <ul className="grid list-[square] gap-2.5 pl-5 marker:text-ink-2">
      {children.map((item, i) => (
        <li key={i} className="pl-1">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Term({ children }: { children: ReactNode }) {
  return <strong className="font-semibold">{children}</strong>;
}

export function Mail() {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="underline underline-offset-4 [overflow-wrap:anywhere]"
    >
      {CONTACT_EMAIL}
    </a>
  );
}
