// What the Questions page puts first. Pure, so the rules test apart from the page.

export type HubAttempt = {
  id: string;
  test_id: string;
  mode: string;
  started_at: string;
  deadline: string | null;
  submitted_at: string | null;
};

// Runs you started and haven't handed in, newest first, one per test and mode. A timed run whose clock has
// run out is left off: the server grades it the next time the test is opened, so there's nothing to resume.
// Only tests in `knownTests` (the ones the page can link to) count.
export function unfinished<T extends HubAttempt>(
  attempts: readonly T[],
  knownTests: ReadonlySet<string>,
  now: number,
): T[] {
  const seen = new Set<string>();
  return [...attempts]
    .filter(
      (a) =>
        !a.submitted_at &&
        knownTests.has(a.test_id) &&
        (!a.deadline || Date.parse(a.deadline) > now),
    )
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
    .filter((a) => {
      const key = `${a.test_id}:${a.mode}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// Your events in the order you use them: recently visited first, then A to Z.
export function orderRooms<T extends { id: string; name: string }>(
  rooms: readonly T[],
  recentIds: readonly string[],
): T[] {
  const rank = (r: T) => {
    const i = recentIds.indexOf(r.id);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  return [...rooms].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra < rb ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Minutes left on a timed run, rounded up, or null for practice.
export function minutesLeft(deadline: string | null, now: number): number | null {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((Date.parse(deadline) - now) / 60_000));
}
