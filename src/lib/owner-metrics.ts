// Pure helpers for the owner console (/developer): the small-count rule as the page shows it, shares and
// week-on-week change, address-bar parsing, and the feedback rules the Settings form shares with the database.
// No database or server imports, so they test directly. The numbers come from the owner_* functions (0232).

// Mirrors private.small_cell (0232): an aggregate about people of 1 to 4 arrives as null.
export const MIN_CELL = 5;

const number = new Intl.NumberFormat("en-CA");

// A hidden count reads "Under 5", never a guess. Zero is a real zero. The space is a no-break space, so a narrow
// table cell never shows "Under" over "5", which reads like two values.
export function countText(n: number | null | undefined): string {
  if (n === null || n === undefined) return "Under\u00a05";
  return number.format(n);
}

// "1 question", "6 questions", "Under 5 questions": the count and the word that agrees with it.
export function countOf(
  n: number | null | undefined,
  one: string,
  many: string,
): string {
  return `${countText(n)} ${n === 1 ? one : many}`;
}

// A rounded share, or null (show nothing) when either side is hidden or there is nothing to divide by.
export function percentText(
  part: number | null,
  whole: number | null,
): string | null {
  if (part === null || whole === null || whole === 0) return null;
  return `${Math.round((part / whole) * 100)}%`;
}

// "3 more than the week before". Null when either side is hidden: printing the gap would give the hidden one away.
export function deltaText(
  now: number | null,
  before: number | null,
  than: string,
): string | null {
  if (now === null || before === null) return null;
  const gap = now - before;
  if (gap === 0) return `Same as ${than}`;
  return `${number.format(Math.abs(gap))} ${gap > 0 ? "more" : "fewer"} than ${than}`;
}

// A small chapter: half or more of a section's figures came back hidden, so the page says why it reads Under 5.
export function mostlyHidden(values: (number | null)[]): boolean {
  if (!values.length) return false;
  return values.filter((v) => v === null).length * 2 >= values.length;
}

export const RANGES = ["7d", "30d", "90d", "all"] as const;
export type Range = (typeof RANGES)[number];
export const RANGE_LABEL: Record<Range, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "All time",
};
export function parseRange(value: unknown): Range {
  return typeof value === "string" &&
    (RANGES as readonly string[]).includes(value)
    ? (value as Range)
    : "30d";
}

export const TABS = [
  "overview",
  "growth",
  "engagement",
  "content",
  "feedback",
  "members",
  "audit",
  "system",
] as const;
export type OwnerTab = (typeof TABS)[number];
export const TAB_LABEL: Record<OwnerTab, string> = {
  overview: "Overview",
  growth: "Growth",
  engagement: "Engagement",
  content: "Content",
  feedback: "Feedback",
  members: "Members",
  audit: "Audit",
  system: "System",
};
export function parseTab(value: unknown): OwnerTab {
  return typeof value === "string" &&
    (TABS as readonly string[]).includes(value)
    ? (value as OwnerTab)
    : "overview";
}

// Rows per page in the feedback queue and the audit log.
export const PAGE_SIZE = 50;

export function pageNumber(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,4}$/.test(value)) return 0;
  const n = Number(value);
  return n <= 1000 ? n : 0;
}

// Only a literal true from can_see_dev_stats() opens the console. Anything else, an error included, is a no.
export function isStatsViewer(value: unknown): boolean {
  return value === true;
}

// "Oct 5", or "Sep 28 to Oct 4" for a week. Dates arrive as YYYY-MM-DD Toronto days, so they format at UTC noon.
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});
export function bucketLabel(start: string, end: string): string {
  const from = dayFormat.format(new Date(`${start}T12:00:00Z`));
  if (start === end) return from;
  return `${from} to ${dayFormat.format(new Date(`${end}T12:00:00Z`))}`;
}

// A recorded event (analytics_events) the site has never stored reads "Not recorded yet", never a zero.
export type FeatureState = "untracked" | "hidden" | "shown";
export function featureState(row: {
  source: "table" | "tracked";
  tracked_since: string | null;
  count: number | null;
}): FeatureState {
  if (row.source === "tracked" && row.tracked_since === null)
    return "untracked";
  if (row.count === null) return "hidden";
  return "shown";
}

// Feedback (0231) -------------------------------------------------------------------------------------------------

export const FEEDBACK_CATEGORIES = ["bug", "idea", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: "Bug",
  idea: "Idea",
  other: "Something else",
};

export const FEEDBACK_STATUSES = [
  "new",
  "planned",
  "done",
  "wont_fix",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  planned: "Planned",
  done: "Done",
  wont_fix: "Won't fix",
};

export const FEEDBACK_PRIORITIES = ["low", "normal", "high"] as const;
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number];
export const PRIORITY_LABEL: Record<FeedbackPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

// "open" is new plus planned: what still needs something from the owner.
export const FEEDBACK_FILTERS = ["open", ...FEEDBACK_STATUSES, "all"] as const;
export type FeedbackFilter = (typeof FEEDBACK_FILTERS)[number];
export const FILTER_LABEL: Record<FeedbackFilter, string> = {
  open: "Open",
  ...STATUS_LABEL,
  all: "All",
};
export function parseFeedbackFilter(value: unknown): FeedbackFilter {
  return typeof value === "string" &&
    (FEEDBACK_FILTERS as readonly string[]).includes(value)
    ? (value as FeedbackFilter)
    : "open";
}

export const FEEDBACK_MAX = 1000;

// What Settings > Send feedback tells members. Every account in private.stats_viewers reads the queue (more than
// one on live), and each item comes with the sender's name, so the line says both. Shared with the dev gallery.
export const FEEDBACK_DESCRIPTION =
  "A bug, an idea, or something that could be clearer. The people who run this site read it, with your name.";

// The checks send_feedback makes, so the form can say what's wrong before it sends. Null when the input is fine.
export function checkFeedback(category: string, body: string): string | null {
  if (!(FEEDBACK_CATEGORIES as readonly string[]).includes(category))
    return "Pick bug, idea or something else.";
  const clean = body.trim();
  if (!clean) return "Write a few words first.";
  if (clean.length > FEEDBACK_MAX)
    return `Keep it under ${number.format(FEEDBACK_MAX)} characters.`;
  return null;
}

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Times are stored in UTC and shown in Toronto time, like the rest of the site.
const stampFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  dateStyle: "medium",
  timeStyle: "short",
});
export function stampText(iso: string): string {
  return stampFormat.format(new Date(iso));
}

// Just the Toronto calendar day, for "since" and "oldest" notes where the time adds nothing.
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  dateStyle: "medium",
});
export function dateText(iso: string): string {
  return dateFormat.format(new Date(iso));
}
