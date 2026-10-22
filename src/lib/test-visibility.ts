import { formatWhen } from "@/lib/when";

// Hidden | Scheduled | Posted for one test (0298). Pure, so the switch's rules are testable without a browser.
export type Visibility = "hidden" | "scheduled" | "posted";

export function visibilityOf(
  published: boolean,
  publishAt: string | null,
): Visibility {
  return published ? "posted" : publishAt ? "scheduled" : "hidden";
}

// What a tap on the switch saves straight away. Scheduled waits for a time and Save, and picking the state that's
// already saved saves nothing. Hide from Scheduled is a real save: it drops the schedule.
export function tapSaves(
  saved: Visibility,
  next: Visibility,
): "post" | "hide" | null {
  if (next === "scheduled" || next === saved) return null;
  return next === "posted" ? "post" : "hide";
}

// Where an arrow key moves focus among the switch's segments (wrapping), or null for any other key. Arrows only move
// focus there; Space or a tap picks, since picking Posted notifies the whole room.
const STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};
export function arrowTarget(
  key: string,
  at: number,
  count: number,
): number | null {
  const step = STEP[key];
  if (!step || at < 0 || count < 1) return null;
  return (at + step + count) % count;
}

// The managers' word on a list for a test members can't see: when it posts, or Hidden. Null once posted.
export function hiddenLabel(
  published: boolean,
  publishAt: string | null | undefined,
): string | null {
  if (published) return null;
  return publishAt ? `Posts ${formatWhen(publishAt)}` : "Hidden";
}
