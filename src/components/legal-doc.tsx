import {
  Children,
  isValidElement,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { PageTitle } from "@/components/page-title";
import {
  CONTACT_EMAIL,
  HOSA_ORG,
  INDEPENDENCE_NOTE,
  LEGAL_EFFECTIVE,
} from "@/lib/legal";

type SectionProps = PropsWithChildren<{ id: string; title: string }>;

// The terms and the privacy policy share one shape: the title and date, a boxed short version for people who read
// nothing else, the not-a-lawyer note, a contents list, then sections under 3px ink rules (the app's box rule).
export function LegalDoc({
  title,
  summary,
  children,
}: PropsWithChildren<{
  title: string;
  summary: ReactNode[];
}>) {
  // The contents come from the sections themselves, so a new section is listed without touching anything else.
  const sections = Children.toArray(children).flatMap((child) =>
    isValidElement<SectionProps>(child) && child.type === LegalSection
      ? [{ id: child.props.id, title: child.props.title }]
      : [],
  );
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
        {sections.length > 0 ? <Contents sections={sections} /> : null}
      </div>
      {children}
    </article>
  );
}

// "On this page": the section titles as a ruled index, read down each column. Rows are 44px tall on touch screens.
function Contents({ sections }: { sections: { id: string; title: string }[] }) {
  return (
    <nav aria-labelledby="contents-h" className="grid gap-2">
      <h2 id="contents-h" className="caps text-[17px] text-ink-2">
        On this page
      </h2>
      <ol className="columns-2 gap-x-6 border-t border-rule sm:columns-3">
        {sections.map((s) => (
          <li key={s.id} className="break-inside-avoid border-b border-rule">
            <a
              href={`#${s.id}`}
              className="flex min-h-11 items-center py-1.5 text-[15px] leading-tight underline-offset-4 hover:underline pointer-fine:min-h-9"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function LegalSection({ id, title, children }: SectionProps) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 border-t-[3px] border-ink pt-5"
    >
      {/* The contents link lands on the heading; the margin keeps the section's rule in view above it. */}
      <h2
        id={id}
        className="scroll-mt-8 font-display text-[clamp(1.6rem,6vw,2.1rem)] leading-none font-bold uppercase text-balance"
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

// A short list inside a list item, for an item that names several things: the same square markers, tighter.
export function SubList({ children }: { children: ReactNode[] }) {
  return (
    <ul className="my-2 grid list-[square] gap-1.5 pl-5 marker:text-ink-2">
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

// The independence line with the organisation's name kept whole: a line may break after "HOSA-" otherwise.
export function IndependenceNote() {
  const [before, after] = INDEPENDENCE_NOTE.split(HOSA_ORG);
  const space = HOSA_ORG.indexOf(" ");
  return (
    <>
      {before}
      <span className="whitespace-nowrap">{HOSA_ORG.slice(0, space)}</span>
      {HOSA_ORG.slice(space)}
      {after}
    </>
  );
}
