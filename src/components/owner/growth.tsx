import {
  bucketLabel,
  countText,
  RANGE_LABEL,
  RANGES,
  type Range,
} from "@/lib/owner-metrics";
import type { GrowthBucket, GrowthData } from "@/lib/owner-types";
import {
  Choices,
  DataTable,
  Figure,
  Figures,
  Notice,
  Sheet,
} from "./primitives";

// New and active members over a range, by day (7 and 30 days) or by Monday-to-Sunday week (90 days, all time).
export function GrowthSection({
  base,
  range,
  data,
  extra,
}: {
  base: string;
  range: Range;
  data: GrowthData;
  extra?: Record<string, string>;
}) {
  const unit = data.step === "day" ? "day" : "week";
  const href = (r: Range) => {
    const search = new URLSearchParams({ ...extra, tab: "growth" });
    if (r !== "30d") search.set("range", r);
    return `${base}?${search.toString()}`;
  };
  return (
    <Sheet
      id="growth-h"
      title="Growth"
      note={`New members and active members, by ${unit}, from ${bucketLabel(data.from, data.from)} to ${bucketLabel(data.to, data.to)}.`}
      actions={
        <Choices
          label="Range"
          items={RANGES.map((r) => ({
            href: href(r),
            text: RANGE_LABEL[r],
            current: r === range,
          }))}
        />
      }
    >
      <Figures label="Range totals">
        <Figure label="New members" value={countText(data.new_total)} />
        <Figure
          label="Active members"
          value={countText(data.active_total)}
          note="Each counted once"
        />
      </Figures>
      {data.buckets.length === 0 ? (
        <Notice>Nothing in this range yet.</Notice>
      ) : (
        <>
          <ActiveChart buckets={data.buckets} unit={unit} />
          <DataTable
            caption={`New and active members per ${unit}, newest first.`}
            rowKey={(b) => b.start}
            rows={[...data.buckets].reverse()}
            columns={[
              {
                key: "when",
                header: unit === "day" ? "Day" : "Week",
                cell: (b) => bucketLabel(b.start, b.end),
              },
              {
                key: "new",
                header: "New",
                numeric: true,
                cell: (b) => countText(b.new),
              },
              {
                key: "active",
                header: "Active",
                numeric: true,
                cell: (b) => countText(b.active),
              },
            ]}
          />
        </>
      )}
    </Sheet>
  );
}

// Active members per bucket as columns from one baseline. A hidden count (1 to 4) is a pale column up to 4 on the
// same scale: "somewhere under 5", never a made-up height. Hover a column for its figure; the table below holds
// every value for keyboard and screen-reader use, so the chart itself is hidden from assistive tech.
function ActiveChart({
  buckets,
  unit,
}: {
  buckets: GrowthBucket[];
  unit: "day" | "week";
}) {
  const top = Math.max(5, ...buckets.map((b) => b.active ?? 0));
  const hasHidden = buckets.some((b) => b.active === null);
  const edge = Math.max(1, Math.floor(buckets.length / 4));
  return (
    <figure className="grid gap-2">
      <figcaption className="caps text-[14px] text-ink-2">
        Active members per {unit}
      </figcaption>
      <div aria-hidden className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="num flex flex-col justify-between pb-0 text-right text-[12px] leading-none text-ink-2">
          <span>{top}</span>
          <span>0</span>
        </div>
        <div className="flex h-40 items-end gap-[2px] border-b border-rule-strong">
          {buckets.map((b, i) => {
            const hidden = b.active === null;
            const value = hidden ? 4 : (b.active ?? 0);
            const tip = `${bucketLabel(b.start, b.end)}: ${hidden ? "under 5" : value} active`;
            const place =
              i < edge
                ? "left-0"
                : i >= buckets.length - edge
                  ? "right-0"
                  : "left-1/2 -translate-x-1/2";
            return (
              <div
                key={b.start}
                className="group relative flex h-full min-w-0 flex-1 items-end justify-center"
              >
                <span
                  className={`w-full max-w-6 ${hidden ? "bg-ink/20" : "bg-ink"} group-hover:bg-ink-2`}
                  style={{ height: `${(value / top) * 100}%` }}
                />
                <span
                  className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap bg-field px-2 py-1 text-[13px] text-on-field group-hover:block ${place}`}
                >
                  {tip}
                </span>
              </div>
            );
          })}
        </div>
        <span />
        <div className="flex justify-between text-[12px] text-ink-2">
          <span>{bucketLabel(buckets[0].start, buckets[0].start)}</span>
          <span>
            {bucketLabel(
              buckets[buckets.length - 1].start,
              buckets[buckets.length - 1].start,
            )}
          </span>
        </div>
      </div>
      {hasHidden ? (
        <p className="flex items-center gap-2 text-[14px] text-ink-2">
          <span aria-hidden className="inline-block size-3 bg-ink/20" />
          Pale columns are under 5 (the exact count is hidden).
        </p>
      ) : null}
    </figure>
  );
}
