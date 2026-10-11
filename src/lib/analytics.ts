// The usage-event taxonomy shared by the three Omega sites, as this site counts it (migration 0230).
// Most events are already recorded by a table the site keeps for its own features, so they are read from there
// and never stored twice. Only the events in TRACKED_EVENTS go into analytics_events, each with one short code.
// Pure: no database or browser imports, so the owner console and the tests share it.

export const TRACKED_EVENTS = {
  vocab_session_completed: ["deck", "career"],
  resource_opened: ["file", "link"],
  // The phone-app layer sends "other" for anything that isn't Android or iOS.
  install_prompt_shown: ["android", "ios", "other"],
  app_installed: ["android", "ios", "other"],
  push_enabled: ["android", "ios", "other"],
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

// Every event in the shared taxonomy, in the plan's order. The owner console's Engagement table counts each one in a
// row or names it in the note under the table (src/lib/owner-engagement.ts), and its test holds it to that.
export const TAXONOMY_EVENTS = [
  "account_created",
  "onboarding_completed",
  "event_selected",
  "practice_started",
  "practice_completed",
  "exam_completed",
  "vocab_session_completed",
  "resource_opened",
  "duel_started",
  "duel_completed",
  "feedback_submitted",
  "install_prompt_shown",
  "app_installed",
  "push_enabled",
] as const;
export type TaxonomyEvent = (typeof TAXONOMY_EVENTS)[number];
