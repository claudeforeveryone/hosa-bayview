import Link from "next/link";
import type { ReactNode } from "react";

// The owner console's building blocks, in the site's own vocabulary: solid ink rules, condensed display headings,
// tabular numerals, square corners. Nothing here fetches; sections pass data in.

// One section: a 3px ink rule, a condensed heading, one plain line under it, optional controls on the right.
// The section is a size container: its figures and tables lay out by the width the section really has, not by the
// window. Beside the app sidebar and the console rail a wide window can still leave a narrow column.
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
      className="@container grid grid-cols-[minmax(0,1fr)] content-start gap-5 border-t-[3px] border-ink pt-4"
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
            <p className="max-w-[68ch] text-16 text-ink-2">{note}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

// The handful of numbers a section leads with, on one ruled band. Two across, four once the section is 40rem wide.
// The numerals scale with the section (6cqi, 32 to 44px), so a seven-character value such as a build id still
// clears its cell's padding at 40rem and neighbouring figures never run together.
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
      className="grid grid-cols-2 border-b border-rule @min-[40rem]:grid-cols-4"
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
  note?: ReactNode;
}) {
  return (
    <div className="grid min-w-0 content-start gap-1 border-t border-rule px-1 py-3 @min-[30rem]:px-3 [&:nth-child(-n+2)]:border-t-0 @min-[40rem]:[&:nth-child(-n+4)]:border-t-0">
      <dt className="caps text-13 leading-tight text-ink-2">{label}</dt>
      <dd className="num font-display text-[clamp(2rem,6cqi,2.75rem)] leading-none font-bold">
        {value}
      </dd>
      {note ? <dd className="text-14 text-ink-2">{note}</dd> : null}
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
          <dt className="min-w-0 text-16">
            {r.label}
            {r.note ? (
              <span className="block text-14 text-ink-2">{r.note}</span>
            ) : null}
          </dt>
          <dd className="num text-right text-17 font-semibold">
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
              className={`caps step inline-flex h-11 items-center gap-2 border px-3.5 text-15 ${
                item.current
                  ? "border-ink bg-ink text-ground"
                  : "border-rule-strong text-ink hover:bg-band"
              }`}
            >
              {item.text}
              {item.count !== undefined ? (
                <span className="num font-sans text-14 font-semibold tracking-normal">
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
      className={`border-y px-1 py-4 text-16 ${
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
    "caps step inline-flex h-11 items-center border border-ink px-4 text-15 hover:bg-band";
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-3">
      {page > 0 ? (
        <Link href={href(page - 1)} className={button}>
          Newer
        </Link>
      ) : null}
      <span className="num text-15 text-ink-2">Page {page + 1}</span>
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
  // Phones only: leave this pair out of the row's block (always, or for rows where `when` says no). In a table that
  // doesn't stack, the whole column is left out below the phone breakpoint.
  hideOnPhone?: boolean;
  when?: (row: T) => boolean;
};

// A table once its section is 36rem wide; narrower (a phone, or a laptop column squeezed by the sidebar and rail)
// each row becomes a short block (first column as its title, the rest as label and value pairs), so nothing scrolls
// sideways. A narrow table (two or three short columns) passes stackOnPhone={false} and stays a real table at every
// width: one line per row instead of a block per row, with its phone-only columns left out below 36rem.
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  stackOnPhone = true,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  stackOnPhone?: boolean;
}) {
  const [first, ...rest] = columns;
  // Columns a narrow section leaves out, when the table shows there too. The last one it does show ends flush.
  const lastOnPhone = columns.findLastIndex((c) => !c.hideOnPhone);
  const phoneHidden = (c: Column<T>, i: number) =>
    stackOnPhone
      ? ""
      : c.hideOnPhone
        ? "hidden @min-[36rem]:table-cell"
        : i === lastOnPhone
          ? "@max-[36rem]:pr-0"
          : "";
  return (
    <>
      {stackOnPhone ? (
        <ul
          aria-label={caption}
          className="border-t-[3px] border-ink @min-[36rem]:hidden"
        >
          {rows.map((row) => {
            const pairs = rest.filter(
              (c) => !c.hideOnPhone && (c.when?.(row) ?? true),
            );
            return (
              <li
                key={rowKey(row)}
                className="grid gap-2 border-b border-rule py-3"
              >
                <div className="text-16 font-medium">{first.cell(row)}</div>
                {pairs.length ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {pairs.map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="caps text-12 leading-tight text-ink-2">
                          {c.header}
                        </dt>
                        <dd
                          className={`text-16 ${c.numeric ? "num font-semibold" : ""}`}
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
      ) : null}
      <div
        className={
          stackOnPhone
            ? "hidden overflow-x-auto @min-[36rem]:block"
            : "overflow-x-auto"
        }
      >
        <table className="w-full border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`caps border-b-[3px] border-ink py-2 pr-4 text-13 font-semibold text-ink-2 last:pr-0 ${
                    c.numeric ? "text-right" : "text-left"
                  } ${phoneHidden(c, i)}`}
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
                      className="py-2.5 pr-4 text-left text-16 font-medium"
                    >
                      {c.cell(row)}
                    </th>
                  ) : (
                    <td
                      key={c.key}
                      className={`py-2.5 pr-4 text-16 last:pr-0 ${
                        c.numeric
                          ? // A table that stays narrow lets a worded value ("Not recorded yet") wrap there.
                            `num text-right ${stackOnPhone ? "whitespace-nowrap" : "@min-[36rem]:whitespace-nowrap"}`
                          : ""
                      } ${phoneHidden(c, i)}`}
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

// What a section shows when its data didn't come back. "missing": its function isn't on this database yet.
// `migration` names an older one the section needs (Members reads 0105); without it the section is one of the
// console's own, 0230 to 0232.
export function Unavailable({
  reason,
  migration,
}: {
  reason: "missing" | "failed";
  migration?: string;
}) {
  if (reason === "failed")
    return (
      <Notice tone="error">
        This section didn&rsquo;t load. Reload to try again.
      </Notice>
    );
  return migration ? (
    <Notice>This section needs migration {migration} on the database.</Notice>
  ) : (
    <Notice>
      This section needs migrations 0230 to 0232 on the database. They are
      written and waiting to be applied.
    </Notice>
  );
}
