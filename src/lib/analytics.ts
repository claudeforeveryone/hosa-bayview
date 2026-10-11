// The usage-event taxonomy shared by the three Omega sites, as this site counts it (migration 0230).
// Most events are already recorded by a table the site keeps for its own features, so they are read from there
// and never stored twice. Only the events in TRACKED_EVENTS go into analytics_events, each with one short code.
// Pure: no database or browser imports, so the owner console and the tests share it.

export const TRACKED_EVENTS = {
  vocab_session_completed: ["deck", "career"],
  resource_opened: ["file", "link"],
  install_prompt_shown: ["android", "ios", "desktop"],
  app_installed: ["android", "ios", "desktop"],
  push_enabled: ["android", "ios", "desktop"],
} as const;

export type TrackedEvent = keyof typeof TRACKED_EVENTS;
export type TrackedCode<E extends TrackedEvent> =
  (typeof TRACKED_EVENTS)[E][number];

// The same rule the database applies (private.analytics_code_ok): a stored name, and a code from its list.
export function isTracked(name: string, code: string | null): boolean {
  if (!Object.hasOwn(TRACKED_EVENTS, name) || code === null) return false;
  return (TRACKED_EVENTS[name as TrackedEvent] as readonly string[]).includes(
    code,
  );
}

export type TaxonomyEntry = {
  event: string;
  // Where the owner console's count comes from.
  source: string;
};

export const TAXONOMY: TaxonomyEntry[] = [
  { event: "account_created", source: "New profiles" },
  {
    event: "onboarding_completed",
    source:
      "Not counted: there is no onboarding step, every page is open from day one",
  },
  { event: "event_selected", source: "Joining an event room" },
  {
    event: "practice_started",
    source: "Practice runs started, career quizzes included",
  },
  { event: "practice_completed", source: "Practice runs submitted" },
  { event: "exam_completed", source: "Timed tests submitted" },
  {
    event: "vocab_session_completed",
    source: "Match games finished, plus flip rounds finished (recorded)",
  },
  { event: "resource_opened", source: "Files and links opened (recorded)" },
  {
    event: "duel_started",
    source: "Battles created, once battles are on the database",
  },
  { event: "duel_completed", source: "Battles finished" },
  {
    event: "feedback_submitted",
    source: "Feedback sent, plus questions reported",
  },
  { event: "install_prompt_shown", source: "Install prompt shown (recorded)" },
  { event: "app_installed", source: "App installed (recorded)" },
  { event: "push_enabled", source: "Notifications turned on (recorded)" },
];
