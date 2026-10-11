import {
  isTracked,
  type TrackedCode,
  type TrackedEvent,
} from "@/lib/analytics";
import { createClient } from "@/lib/supabase/client";

// One usage event from the browser (record_event, migration 0230). Only a name and a short code from the taxonomy
// are sent: never what was studied, typed or opened. The database adds the account and the time, refuses anything
// off the list and caps each account per hour. Nothing here can break the page: a missing function (before 0230),
// a signed-out visitor, the rate limit or a network error all resolve to false.
export async function track<E extends TrackedEvent>(
  name: E,
  code: TrackedCode<E>,
): Promise<boolean> {
  if (!isTracked(name, code)) return false;
  try {
    const { data, error } = await createClient().rpc("record_event", {
      p_name: name,
      p_code: code,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
