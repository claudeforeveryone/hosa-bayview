import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dayKey, torontoToIso } from "@/lib/when";

export type EventRow = {
  id: string;
  classroom_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string;
  details: string;
  room: { name: string } | null;
  // Set on a personal event (0270): only its owner sees it. Null for chapter and class events.
  owner_id: string | null;
};

const BASE =
  "id, classroom_id, title, starts_at, ends_at, all_day, location, details, room:classrooms!events_classroom_id_fkey(name)";
const COLUMNS = `${BASE}, owner_id`;

type Query = (columns: string) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;

// Reads with owner_id, or without it while 0270 isn't on the database yet (42703: no such column), so the
// calendar keeps working either way. Rows then read as shared events.
async function withOwner(run: Query): Promise<{ data: EventRow[]; error: { message: string } | null }> {
  const first = await run(COLUMNS);
  if (first.error?.code !== "42703") return { data: (first.data ?? []) as EventRow[], error: first.error };
  const second = await run(BASE);
  const rows = ((second.data ?? []) as Omit<EventRow, "owner_id">[]).map((r) => ({ ...r, owner_id: null }));
  return { data: rows, error: second.error };
}

// Chapter events plus the classes you can see (RLS). "Coming up" runs from the start of today (Toronto), so
// today's events and anything still running stay listed until the day is over.
export async function getEvents({
  past = false,
  limit = 200,
}: { past?: boolean; limit?: number } = {}): Promise<EventRow[]> {
  const supabase = await createClient();
  const today = torontoToIso(`${dayKey(new Date().toISOString())}T00:00`) ?? new Date().toISOString();
  const { data: rows, error } = await withOwner((columns) => {
    const query = supabase.from("events").select(columns).limit(limit);
    return past
      ? query.lt("starts_at", today).order("starts_at", { ascending: false })
      : query.or(`starts_at.gte.${today},ends_at.gte.${today}`).order("starts_at", { ascending: true });
  });
  if (error) throw new Error(`Calendar lookup failed: ${error.message}`);
  const cutoff = Date.parse(today);
  // Past: started before today and already over.
  return past ? rows.filter((e) => !e.ends_at || Date.parse(e.ends_at) < cutoff) : rows;
}

// Everything that overlaps [from, to): starts before `to` and either starts or is still running at `from`.
// For the month grid; same RLS as above.
export async function getEventsInRange(from: string, to: string, limit = 500): Promise<EventRow[]> {
  const supabase = await createClient();
  const { data, error } = await withOwner((columns) =>
    supabase
      .from("events")
      .select(columns)
      .lt("starts_at", to)
      .or(`starts_at.gte.${from},ends_at.gte.${from}`)
      .order("starts_at", { ascending: true })
      .limit(limit),
  );
  if (error) throw new Error(`Calendar lookup failed: ${error.message}`);
  return data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What's next for one event room: its own events plus chapter-wide ones, from the start of today (Toronto),
// soonest first. For the room's hub. A malformed id gets just the chapter's.
export async function getUpcomingForRoom(classroomId: string, limit = 4): Promise<EventRow[]> {
  const supabase = await createClient();
  const today = torontoToIso(`${dayKey(new Date().toISOString())}T00:00`) ?? new Date().toISOString();
  // The id goes into a filter string, so only a real uuid gets in.
  const rooms = UUID.test(classroomId) ? [`classroom_id.eq.${classroomId}`, "classroom_id.is.null"] : ["classroom_id.is.null"];
  const when = [`starts_at.gte.${today}`, `ends_at.gte.${today}`];
  const either = rooms.flatMap((r) => when.map((w) => `and(${r},${w})`)).join(",");
  const { data, error } = await withOwner((columns) =>
    supabase.from("events").select(columns).or(either).order("starts_at", { ascending: true }).limit(limit),
  );
  if (error) throw new Error(`Calendar lookup failed: ${error.message}`);
  return data;
}
