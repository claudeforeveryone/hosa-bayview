import { formatCount, formatHours, formatPercent, formatStreak } from "@/lib/activity";
import type { MemberStats } from "@/lib/activity-data";

// Plain stat rows, no charts: each label on the left, the number on the right.
export function MemberStatRows({ stats }: { stats: MemberStats }) {
  const rows: [string, string][] = [
    ["Rank", `#${formatCount(stats.rank)}`],
    ["Elo", formatCount(stats.elo)],
    ["Streak", formatStreak(stats.streak)],
    ["Hours", `${formatHours(stats.minutes)} h`],
    ["Flashcards reviewed", formatCount(stats.reviews)],
    ["Questions done", formatCount(stats.answered)],
    ["Accuracy", formatPercent(stats.accuracy)],
  ];
  return (
    <dl className="border-y border-rule">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-6 border-b border-rule py-3 last:border-b-0">
          <dt className="caps text-[17px] text-ink-2">{label}</dt>
          <dd className="num font-display text-[clamp(1.6rem,6vw,2.2rem)] leading-none font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
