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
};

const COLUMNS =
  "id, classroom_id, title, starts_at, ends_at, all_day, location, details, room:classrooms!events_classroom_id_fkey(name)";

// Chapter events plus the classes you can see (RLS). "Coming up" runs from the start of today (Toronto), so
// today's events and anything still running stay listed until the day is over.
export async function getEvents({
  past = false,
  limit = 200,
}: { past?: boolean; limit?: number } = {}): Promise<EventRow[]> {
  const supabase = await createClient();
  const today = torontoToIso(`${dayKey(new Date().toISOString())}T00:00`) ?? new Date().toISOString();
  const query = supabase.from("events").select(COLUMNS).limit(limit);
  const { data, error } = past
    ? await query.lt("starts_at", today).order("starts_at", { ascending: false })
    : await query.or(`starts_at.gte.${today},ends_at.gte.${today}`).order("starts_at", { ascending: true });
  if (error) throw new Error(`Calendar lookup failed: ${error.message}`);
  const rows = (data ?? []) as unknown as EventRow[];
  const cutoff = Date.parse(today);
  // Past: started before today and already over.
  return past ? rows.filter((e) => !e.ends_at || Date.parse(e.ends_at) < cutoff) : rows;
}

// Everything that overlaps [from, to): starts before `to` and either starts or is still running at `from`.
// For the month grid; same RLS as above.
export async function getEventsInRange(from: string, to: string, limit = 500): Promise<EventRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(COLUMNS)
    .lt("starts_at", to)
    .or(`starts_at.gte.${from},ends_at.gte.${from}`)
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Calendar lookup failed: ${error.message}`);
  return (data ?? []) as unknown as EventRow[];
}
