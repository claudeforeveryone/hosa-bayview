// Which classroom tabs a room shows. Pure, so the rule is testable apart from the nav component.
export type Category = "mc" | "practical" | "showcase";
// A tab with `sub` is a dropdown: its own slug is never a page, only a name for the group.
export type Tab = { slug: string; label: string; sub?: Tab[] };

export function parseCategory(value: unknown): Category | null {
  return value === "mc" || value === "practical" || value === "showcase" ? value : null;
}

// What the Questions dropdown holds. Showcase rooms have no tests. Skills (your badges in the event, plus the
// rating sheets in practical rooms) is in every room.
export function questionTabsFor(category: Category | null): Tab[] {
  const sub: Tab[] = [];
  if (category !== "showcase") sub.push({ slug: "tests", label: "Tests" });
  sub.push({ slug: "flashcards", label: "Cards" }, { slug: "skills", label: "Skills" });
  return sub;
}

// Hub first, then Questions (Tests, Cards and Skills in one dropdown, so the strip stays short), then the rest.
// Grades (the whole-class grid) and Settings are for managers.
export function tabsFor(category: Category | null, isManager: boolean): Tab[] {
  const tabs: Tab[] = [
    { slug: "", label: "Overview" },
    { slug: "questions", label: "Questions", sub: questionTabsFor(category) },
    { slug: "resources", label: "Resources" },
    { slug: "members", label: "People" },
    { slug: "attendance", label: "Attendance" },
  ];
  if (isManager) tabs.push({ slug: "grades", label: "Grades" }, { slug: "settings", label: "Settings" });
  return tabs;
}

export const CATEGORY_HEADINGS: Record<Category, string> = { mc: "MC", practical: "Practical", showcase: "Showcase" };

// Rooms under their category heading, A to Z. Uncategorised rooms come first with no heading at all
// (heading null), so the page reads as one main list instead of ending in an "Other" bucket.
export function groupByCategory<T extends { name: string; category: Category | null }>(
  rooms: T[],
): { heading: string | null; rooms: T[] }[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const groups: { heading: string | null; rooms: T[] }[] = [
    { heading: null, rooms: rooms.filter((r) => r.category === null).sort(byName) },
  ];
  for (const c of ["mc", "practical", "showcase"] as const) {
    groups.push({ heading: CATEGORY_HEADINGS[c], rooms: rooms.filter((r) => r.category === c).sort(byName) });
  }
  return groups.filter((g) => g.rooms.length > 0);
}

// Where tapping Events lands. `mineIds` are the class rooms you own or belong to; `seesAll` is an executive,
// who can list every room. Not an executive and exactly one room: straight into it. Otherwise your rooms
// first (most recently visited first, then A to Z), then everything else. An executive's recently visited
// rooms count as theirs, so the rooms they work in float up.
export type EventsLanding<T> = { go: T } | { mine: T[]; rest: T[] };

export function eventsLanding<T extends { id: string; name: string }>(
  rooms: T[],
  {
    mineIds,
    recentIds = [],
    seesAll,
  }: { mineIds: ReadonlySet<string>; recentIds?: readonly string[]; seesAll: boolean },
): EventsLanding<T> {
  // Without the executive view, every room you can list is yours.
  const isMine = (r: T) => !seesAll || mineIds.has(r.id) || recentIds.includes(r.id);
  const rank = (r: T) => {
    const i = recentIds.indexOf(r.id);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  const order = (a: T, b: T) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    return a.name.localeCompare(b.name);
  };
  const mine = rooms.filter(isMine).sort(order);
  const rest = rooms.filter((r) => !isMine(r));
  if (!seesAll && mine.length === 1) return { go: mine[0] };
  return { mine, rest };
}

// The recently visited rooms cookie: ids, newest first, comma separated. Anything that isn't a uuid is dropped.
export const RECENT_ROOMS_COOKIE = "recent_rooms";
const RECENT_MAX = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRecentRooms(value: string | undefined | null): string[] {
  if (!value) return [];
  let raw = value;
  try {
    raw = decodeURIComponent(value);
  } catch {
    // Leave it as typed; the uuid check below drops anything odd.
  }
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (UUID.test(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(0, RECENT_MAX);
}

// Puts `id` at the front and keeps at most eight.
export function pushRecentRoom(value: string | undefined | null, id: string): string {
  const key = id.toLowerCase();
  const kept = parseRecentRooms(value);
  if (!UUID.test(key)) return kept.join(",");
  return [key, ...kept.filter((x) => x !== key)].slice(0, RECENT_MAX).join(",");
}

// On phones the event tabs scroll sideways under solid edge chevrons. Where to scroll the strip so a tab (its
// left and right edge in strip pixels) sits `edge` px clear of both sides, moving as little as possible and
// keeping the start of a too-wide tab in view. Null when it is already clear.
export function tabClearScroll({
  scrollLeft,
  width,
  left,
  right,
  edge,
}: {
  scrollLeft: number;
  width: number;
  left: number;
  right: number;
  edge: number;
}): number | null {
  let target = scrollLeft;
  if (left < scrollLeft + edge) target = left - edge;
  else if (right > scrollLeft + width - edge)
    target = Math.min(right - width + edge, left - edge);
  target = Math.max(0, target);
  return target === scrollLeft ? null : target;
}

// Where a tab that just took focus scrolls the strip to: clear of the chevrons, but only for keyboard focus.
// Chrome and Firefox also focus a link on mousedown and on a touch tap; moving the strip then would slide the
// next tab under the finger before mouseup, and the tap would follow no link. Null means leave it alone (also
// in a browser that doesn't know :focus-visible).
export function tabFocusScroll(
  tab: { matches(selector: string): boolean; offsetLeft: number; offsetWidth: number },
  strip: { scrollLeft: number; clientWidth: number },
  edge: number,
): number | null {
  let keyboard = false;
  try {
    keyboard = tab.matches(":focus-visible");
  } catch {
    // An older browser throws on the selector: no scroll, so taps always work.
  }
  if (!keyboard) return null;
  return tabClearScroll({
    scrollLeft: strip.scrollLeft,
    width: strip.clientWidth,
    left: tab.offsetLeft,
    right: tab.offsetLeft + tab.offsetWidth,
    edge,
  });
}
