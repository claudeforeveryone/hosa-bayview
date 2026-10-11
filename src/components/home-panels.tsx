import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Layers,
  Pin,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { AnnouncementRow } from "@/lib/announcements";
import type { MemberStats } from "@/lib/activity-data";
import { formatCount } from "@/lib/activity";
import { CountUp } from "@/components/count-up";
import { timeAgo } from "@/lib/when";

// A boxed section on Home: a thick ink frame with a solid ink title bar, so each part of the page reads as
// its own block. `link` puts a "see all" style link at the right of the bar.
export function HomeBox({
  id,
  title,
  link,
  children,
  className = "",
}: {
  id: string;
  title: string;
  link?: { href: string; text: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`grid min-w-0 content-start border-[3px] border-ink bg-ground ${className}`}
    >
      <div className="flex min-h-12 items-center justify-between gap-4 bg-ink px-3 py-2 text-ground sm:px-4">
        <h2
          id={id}
          className="font-display text-[clamp(1.35rem,5vw,1.75rem)] leading-none font-bold uppercase"
        >
          {title}
        </h2>
        {link ? (
          <Link
            href={link.href}
            className="caps step inline-flex h-11 shrink-0 items-center gap-1.5 text-15 underline-offset-4 hover:underline"
          >
            {link.text}
            <ArrowRight size={18} strokeWidth={2} aria-hidden />
          </Link>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

type Tile = { href: string; label: string; hint: string; icon: LucideIcon };

const TILES: Tile[] = [
  {
    href: "/tests",
    label: "Continue practising",
    hint: "Tests and practice",
    icon: BookOpenCheck,
  },
  {
    href: "/flashcards",
    label: "Flashcards",
    hint: "Study and match",
    icon: Layers,
  },
  {
    href: "/calendar",
    label: "Calendar",
    hint: "What's on",
    icon: CalendarDays,
  },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    hint: "Where you stand",
    icon: Trophy,
  },
];

// Four big tap targets. The first is the navy field and runs the full width of a phone row, so the most common
// next step is the loudest thing on Home; the last is wide too, so the phone grid closes without a gap. Desktop
// is a plain row of four.
export function QuickActions() {
  return (
    <nav
      aria-label="Quick actions"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {TILES.map((t, i) => {
        const Icon = t.icon;
        const lead = i === 0;
        const wide = lead || i === TILES.length - 1;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`press step group grid min-h-32 content-between gap-4 border-[3px] p-3 sm:p-4 ${
              wide ? "col-span-2 lg:col-span-1" : ""
            } ${
              lead
                ? "border-field bg-field text-on-field hover:bg-field-2 hover:border-field-2"
                : "border-ink bg-ground hover:bg-band"
            }`}
          >
            <span className="flex items-start justify-between gap-2">
              <Icon size={30} strokeWidth={1.75} aria-hidden />
              <ArrowRight
                size={20}
                strokeWidth={2}
                aria-hidden
                className="motion-safe:transition-transform motion-safe:duration-150 group-hover:translate-x-0.5"
              />
            </span>
            <span className="grid gap-1">
              <span className="font-display text-[clamp(1.2rem,4.6vw,1.6rem)] leading-[1.05] font-bold uppercase">
                {t.label}
              </span>
              <span
                className={`text-14 ${lead ? "text-on-field-2" : "text-ink-2"}`}
              >
                {t.hint}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

// Your numbers, big and tabular. Hidden when the stats lookup failed: Home still works without them.
export function StatTiles({ stats }: { stats: MemberStats | null }) {
  if (!stats) return null;
  // `to` is the number the count-up lands on; `kind` says how it reads (accuracy is a fraction, shown as a percent).
  const tiles: {
    label: string;
    to: number | null;
    kind?: "count" | "percent";
    note?: string;
  }[] = [
    {
      label: "Elo",
      to: stats.elo,
      note:
        stats.rank > 0
          ? `#${formatCount(stats.rank)} in the chapter`
          : undefined,
    },
    {
      label: "Streak",
      to: stats.streak,
      note: stats.streak === 1 ? "day" : "days",
    },
    {
      label: "Questions",
      to: stats.answered,
      note: `${formatCount(stats.correct)} right`,
    },
    {
      label: "Accuracy",
      to: stats.accuracy,
      kind: "percent",
      note: `${formatCount(stats.reviews)} cards studied`,
    },
  ];
  // A navy band: the numbers are the loudest thing under the banner, in ice on the field.
  return (
    <section
      aria-label="Your stats"
      className="grid grid-cols-2 border-[3px] border-ink bg-field text-on-field lg:grid-cols-4"
    >
      {tiles.map((t, i) => (
        <div
          key={t.label}
          className={`grid min-w-0 content-start gap-1 px-3 py-4 sm:px-4 ${
            // Solid rules between tiles: a cross on a phone (2 by 2), dividers in a row on desktop.
            i % 2 === 1 ? "border-l-2 border-on-field-2/40" : ""
          } ${i >= 2 ? "border-t-2 border-on-field-2/40 lg:border-t-0" : ""} ${i === 2 ? "lg:border-l-2" : ""}`}
        >
          <span className="caps text-14 text-on-field-2">{t.label}</span>
          <span className="num truncate font-display text-[clamp(2.25rem,10vw,3.5rem)] leading-none font-bold">
            <CountUp to={t.to} kind={t.kind} />
          </span>
          {t.note ? (
            <span className="num truncate text-14 text-on-field-2">
              {t.note}
            </span>
          ) : null}
        </div>
      ))}
    </section>
  );
}

// The latest chapter announcements: pinned first, a two-line taste of each.
export function AnnouncementList({ items }: { items: AnnouncementRow[] }) {
  if (!items.length) {
    return (
      <p className="px-3 py-5 text-16 text-ink-2 sm:px-4">
        No announcements yet.
      </p>
    );
  }
  return (
    <ul>
      {items.map((a, i) => (
        <li key={a.id} className={i ? "border-t border-rule" : ""}>
          <Link
            href="/announcements"
            className="step grid gap-1 px-3 py-3 hover:bg-band sm:px-4"
          >
            <span className="flex min-w-0 items-center gap-2">
              {a.pinned ? (
                <span className="caps inline-flex shrink-0 items-center gap-1 bg-you px-1.5 py-0.5 text-12 leading-none text-on-you">
                  <Pin size={12} strokeWidth={2.25} aria-hidden />
                  Pinned
                </span>
              ) : null}
              <span className="truncate font-display text-19 leading-tight font-semibold uppercase">
                {a.title}
              </span>
            </span>
            {a.body ? (
              <span className="line-clamp-2 text-15 text-ink-2">
                {a.body}
              </span>
            ) : null}
            <span className="caps text-13 text-ink-2">
              {[a.author?.full_name, timeAgo(a.created_at)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
