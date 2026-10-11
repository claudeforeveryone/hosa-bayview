import Link from "next/link";
import type { ReactNode } from "react";

// The owner console's building blocks, in the site's own vocabulary: solid ink rules, condensed display headings,
// tabular numerals, square corners. Nothing here fetches; sections pass data in.

// One section: a 3px ink rule, a condensed heading, one plain line under it, optional controls on the right.
export function Sheet({
  id,
  title,
  note,
  actions,
  children,
}: {
  id: string;
  title: string;
  note?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid grid-cols-[minmax(0,1fr)] content-start gap-5 border-t-[3px] border-ink pt-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="grid min-w-0 gap-1.5">
          <h2
            id={id}
            className="font-display text-[clamp(1.6rem,4.5vw,2.1rem)] leading-none font-bold uppercase"
          >
            {title}
          </h2>
          {note ? (
            <p className="max-w-[68ch] text-[16px] text-ink-2">{note}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

// The handful of numbers a section leads with, on one ruled band. Two across on phones, up to four on wide screens.
export function Figures({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <dl
      aria-label={label}
      className="grid grid-cols-2 border-b border-rule sm:grid-cols-4"
    >
      {children}
    </dl>
  );
}

export function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | null;
}) {
  return (
    <div className="grid min-w-0 content-start gap-1 border-t border-rule px-1 py-3 sm:px-3 [&:nth-child(-n+2)]:border-t-0 sm:[&:nth-child(-n+4)]:border-t-0">
      <dt className="caps text-[13px] leading-tight text-ink-2">{label}</dt>
      <dd className="num font-display text-[clamp(2rem,6vw,2.75rem)] leading-none font-bold">
        {value}
      </dd>
      {note ? <dd className="text-[14px] text-ink-2">{note}</dd> : null}
    </div>
  );
}

// Label on the left, figure on the right, a hairline between rows. For the detail under the headline figures.
export function Ledger({
  label,
  rows,
}: {
  label: string;
  rows: { label: string; value: ReactNode; note?: ReactNode }[];
}) {
  return (
    <dl aria-label={label} className="border-t border-rule">
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-rule py-2.5"
        >
          <dt className="min-w-0 text-[16px]">
            {r.label}
            {r.note ? (
              <span className="block text-[14px] text-ink-2">{r.note}</span>
            ) : null}
          </dt>
          <dd className="num text-right text-[17px] font-semibold">
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// A row of links that act as a segmented control: ranges, filters, periods. The current one is filled.
export function Choices({
  label,
  items,
}: {
  label: string;
  items: { href: string; text: string; current: boolean; count?: number }[];
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={`caps step inline-flex h-11 items-center gap-2 border px-3.5 text-[15px] ${
                item.current
                  ? "border-ink bg-ink text-ground"
                  : "border-rule-strong text-ink hover:bg-band"
              }`}
            >
              {item.text}
              {item.count !== undefined ? (
                <span className="num font-sans text-[14px] font-semibold tracking-normal">
                  {item.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// One plain line when a section has nothing to show or can't load. Never a fake zero.
export function Notice({
  tone = "plain",
  children,
}: {
  tone?: "plain" | "error";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={`border-y px-1 py-4 text-[16px] ${
        tone === "error"
          ? "border-danger text-danger"
          : "border-rule-strong text-ink-2"
      }`}
    >
      {children}
    </p>
  );
}

// Newer and older pages. The current query is kept; only p changes.
export function Pager({
  base,
  params,
  page,
  hasMore,
}: {
  base: string;
  params: Record<string, string>;
  page: number;
  hasMore: boolean;
}) {
  if (page === 0 && !hasMore) return null;
  const href = (p: number) => {
    const search = new URLSearchParams(params);
    if (p > 0) search.set("p", String(p));
    return `${base}?${search.toString()}`;
  };
  const button =
    "caps step inline-flex h-11 items-center border border-ink px-4 text-[15px] hover:bg-band";
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-3">
      {page > 0 ? (
        <Link href={href(page - 1)} className={button}>
          Newer
        </Link>
      ) : null}
      <span className="num text-[15px] text-ink-2">Page {page + 1}</span>
      {hasMore ? (
        <Link href={href(page + 1)} className={button}>
          Older
        </Link>
      ) : null}
    </nav>
  );
}

export type Column<T> = {
  key: string;
  header: string;
  numeric?: boolean;
  cell: (row: T) => ReactNode;
  // Phones only: leave this pair out of the row's block (always, or for rows where `when` says no).
  hideOnPhone?: boolean;
  when?: (row: T) => boolean;
};

// A table on wide screens; on phones each row becomes a short block (first column as its title, the rest as
// label and value pairs), so nothing scrolls sideways at 390px.
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
}) {
  const [first, ...rest] = columns;
  return (
    <>
      <ul aria-label={caption} className="border-t-[3px] border-ink sm:hidden">
        {rows.map((row) => {
          const pairs = rest.filter(
            (c) => !c.hideOnPhone && (c.when?.(row) ?? true),
          );
          return (
            <li
              key={rowKey(row)}
              className="grid gap-2 border-b border-rule py-3"
            >
              <div className="text-[16px] font-medium">{first.cell(row)}</div>
              {pairs.length ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {pairs.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="caps text-[12px] leading-tight text-ink-2">
                        {c.header}
                      </dt>
                      <dd
                        className={`text-[16px] ${c.numeric ? "num font-semibold" : ""}`}
                      >
                        {c.cell(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`caps border-b-[3px] border-ink py-2 pr-4 text-[13px] font-semibold text-ink-2 last:pr-0 ${
                    c.numeric ? "text-right" : "text-left"
                  }`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-rule align-top">
                {columns.map((c, i) =>
                  i === 0 ? (
                    <th
                      key={c.key}
                      scope="row"
                      className="py-2.5 pr-4 text-left text-[16px] font-medium"
                    >
                      {c.cell(row)}
                    </th>
                  ) : (
                    <td
                      key={c.key}
                      className={`py-2.5 pr-4 text-[16px] last:pr-0 ${
                        c.numeric ? "num text-right whitespace-nowrap" : ""
                      }`}
                    >
                      {c.cell(row)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// What a section shows when its data didn't come back. "missing": the owner functions aren't on this database yet.
export function Unavailable({ reason }: { reason: "missing" | "failed" }) {
  return reason === "missing" ? (
    <Notice>
      This section needs migrations 0230 to 0232 on the database. They are
      written and waiting to be applied.
    </Notice>
  ) : (
    <Notice tone="error">
      This section didn&rsquo;t load. Reload to try again.
    </Notice>
  );
}
