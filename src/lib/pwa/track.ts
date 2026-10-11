import { createClient } from "@/lib/supabase/client";

// The PWA's three analytics moments (Omega plan section 5). They go to record_event, the owner track's aggregate
// counter (migration 0230): a name and a small code, nothing else. Fire and forget: before 0230 is applied, or on
// any error, the call fails quietly and the page carries on.
export type PwaEvent =
  | { name: "install_prompt_shown"; code: "android" | "ios" | "other" }
  | { name: "app_installed"; code: "android" | "ios" | "other" }
  | { name: "push_enabled"; code?: undefined };

export function trackPwa(event: PwaEvent): void {
  try {
    void createClient()
      .rpc("record_event", { p_name: event.name, p_code: event.code ?? null })
      .then(
        () => {},
        () => {},
      );
  } catch {
    // No client (or no storage): nothing to record.
  }
}
