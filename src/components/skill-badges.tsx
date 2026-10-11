import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Clock,
  Compass,
  Crosshair,
  Flame,
  Layers,
  ListChecks,
  LogIn,
  RotateCcw,
  Star,
  Swords,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import {
  SKILL_GROUPS,
  TIER_NAMES,
  levelFor,
  nextUp,
  topSkills,
  totalTiers,
  type SkillProgress,
} from "@/lib/skills";

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  "badge-check": BadgeCheck,
  "calendar-check": CalendarCheck,
  clock: Clock,
  compass: Compass,
  crosshair: Crosshair,
  flame: Flame,
  layers: Layers,
  "list-checks": ListChecks,
  "log-in": LogIn,
  "rotate-ccw": RotateCcw,
  star: Star,
  swords: Swords,
  "trending-up": TrendingUp,
  trophy: Trophy,
};

// The badge itself: a square that fills with the highlight colour once the first tier is earned, and thickens
// its rule with each tier after that.
function Emblem({ s, size = "lg" }: { s: SkillProgress; size?: "lg" | "sm" }) {
  const Icon = ICONS[s.def.icon] ?? Star;
  const box = size === "lg" ? "size-16 sm:size-[72px]" : "size-12";
  const ring = ["border-2", "border-[3px]", "border-[4px]", "border-[5px]", "border-[6px]"][s.tier];
  return (
    <span
      aria-hidden
      className={`relative grid shrink-0 place-items-center ${box} ${ring} ${
        s.tier ? "border-ink bg-you text-on-you" : "border-rule-strong text-ink-2"
      }`}
    >
      <Icon size={size === "lg" ? 30 : 22} strokeWidth={s.tier ? 2.25 : 1.75} />
      {s.tier ? (
        <span className="num caps absolute -right-[3px] -bottom-[3px] bg-ink px-1 text-12 leading-[1.35] text-ground">
          {TIER_NAMES[s.tier - 1]}
        </span>
      ) : null}
    </span>
  );
}

// Four squares, one per tier.
function Pips({ tier }: { tier: number }) {
  return (
    <span aria-hidden className="flex gap-1">
      {TIER_NAMES.map((t, i) => (
        <span key={t} className={`size-2.5 ${i < tier ? "bg-ink" : "border border-rule-strong"}`} />
      ))}
    </span>
  );
}

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="block h-2 w-full border border-ink"
    >
      <span className="block h-full bg-ink" style={{ width: `${value * 100}%` }} />
    </span>
  );
}

function Badge({ s }: { s: SkillProgress }) {
  const { def, tier, next, value } = s;
  const maxed = next === null;
  const status = tier ? `${def.name} ${TIER_NAMES[tier - 1]}` : `${def.name}, not earned yet`;
  return (
    <li
      className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 border-2 p-3 sm:p-4 ${
        tier ? "border-ink" : "border-rule-strong"
      }`}
    >
      <Emblem s={s} />
      <div className="grid min-w-0 gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <h4 className="caps text-18 leading-tight [overflow-wrap:anywhere]">
            <span className="sr-only">{status}. </span>
            <span aria-hidden>{def.name}</span>
          </h4>
          <Pips tier={tier} />
        </div>
        <p className="text-15 text-ink-2">
          {maxed ? `Maxed out: ${def.goal(def.tiers[3]).toLowerCase()}` : def.goal(next)}
        </p>
        {maxed ? null : (
          <>
            <Bar value={s.progress} label={`${def.name} progress to tier ${TIER_NAMES[tier]}`} />
            <p className="num text-14 text-ink-2">
              {def.lowerIsBetter ? `Now ${def.unit(value)}` : `${def.unit(value)} so far`}
            </p>
          </>
        )}
      </div>
    </li>
  );
}

// The level banner: your title, tiers earned and the next title, then what to chase next.
function LevelBanner({ list, scope }: { list: SkillProgress[]; scope: string }) {
  const tiers = totalTiers(list);
  const max = list.length * 4;
  const level = levelFor(tiers);
  const nudge = nextUp(list);
  const toNext = level.next ? level.next.at - tiers : 0;
  return (
    <div className="grid gap-4 bg-field p-5 text-on-field sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="grid gap-1">
          <p className="caps text-14 text-on-field-2">{scope}</p>
          <p className="font-display text-[clamp(2.25rem,9vw,3.5rem)] leading-none font-bold uppercase">
            {level.title}
          </p>
        </div>
        <p className="num font-display text-26 leading-none font-semibold">
          {tiers}
          <span className="text-on-field-2"> / {max} tiers</span>
        </p>
      </div>
      <div className="grid gap-1.5">
        <span className="block h-3 w-full border-2 border-on-field">
          <span className="block h-full bg-on-field" style={{ width: `${max ? (tiers / max) * 100 : 0}%` }} />
        </span>
        <p className="text-15 text-on-field-2">
          {level.next
            ? `${toNext} more ${toNext === 1 ? "tier" : "tiers"} to ${level.next.title}.`
            : "Top title. Every tier from here is bragging rights."}
        </p>
      </div>
      {nudge && nudge.next !== null ? (
        <p className="border-t border-on-field-2/40 pt-3 text-16">
          <span className="caps text-on-field-2">Next up: </span>
          {nudge.def.goal(nudge.next)} for {nudge.def.name} {TIER_NAMES[nudge.tier]}.
        </p>
      ) : null}
    </div>
  );
}

// Every skill, grouped, under the level banner. `scope` names whose skills these are ("All of HOSA Bayview",
// an event's name).
export function SkillBoard({ list, scope }: { list: SkillProgress[]; scope: string }) {
  return (
    <div className="grid gap-10">
      <LevelBanner list={list} scope={scope} />
      {SKILL_GROUPS.map((g) => {
        const items = list.filter((s) => s.def.group === g.id);
        if (!items.length) return null;
        const earned = items.filter((s) => s.tier > 0).length;
        return (
          <section key={g.id} aria-labelledby={`skills-${g.id}`} className="grid gap-4">
            <div className="flex items-baseline justify-between gap-4 border-b-[3px] border-ink pb-2">
              <h3
                id={`skills-${g.id}`}
                className="font-display text-[clamp(1.6rem,6vw,2.2rem)] leading-none font-bold uppercase"
              >
                {g.label}
              </h3>
              <p className="num text-15 text-ink-2">
                {earned} of {items.length} earned
              </p>
            </div>
            <p className="-mt-2 text-16 text-ink-2">{g.blurb}</p>
            <ul className="grid gap-3 md:grid-cols-2">
              {items.map((s) => (
                <Badge key={s.def.id} s={s} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// A short version for the profile: your title, your best badges and a way in.
export function SkillStrip({ list, href = "/skills" }: { list: SkillProgress[]; href?: string }) {
  const best = topSkills(list, 4);
  const level = levelFor(totalTiers(list));
  return (
    <div className="grid gap-4 border-2 border-ink p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-[clamp(1.75rem,6vw,2.25rem)] leading-none font-bold uppercase">
          {level.title}
        </p>
        <p className="num text-15 text-ink-2">
          {totalTiers(list)} / {list.length * 4} tiers
        </p>
      </div>
      {best.length ? (
        <ul className="flex flex-wrap gap-3">
          {best.map((s) => (
            <li key={s.def.id} className="flex items-center gap-2">
              <Emblem s={s} size="sm" />
              <span className="caps text-15">{s.def.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-16 text-ink-2">No badges yet. Answer 10 questions for your first.</p>
      )}
      <Link
        href={href}
        className="caps step inline-flex h-11 items-center gap-2 justify-self-start text-16 underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
      >
        All skills
        <ArrowRight size={18} strokeWidth={2} aria-hidden />
      </Link>
    </div>
  );
}
