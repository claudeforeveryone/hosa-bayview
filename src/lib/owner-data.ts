import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE, type FeedbackFilter, type Range } from "./owner-metrics";
import type {
  AuditRow,
  ContentData,
  EngagementData,
  FeedbackQueue,
  GrowthData,
  OwnerOverview,
  SystemData,
} from "./owner-types";

// Server reads for the owner console. Every owner_* function (0232) starts with private.require_stats_viewer(), so
// the database refuses anyone else with 42501 whatever this page does. The page also checks can_see_dev_stats()
// first and answers not found, so a non-owner never learns the console exists.
// "missing" means the function isn't on this database yet (0230-0232 not applied): the owner gets a plain note.

export type Loaded<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "denied" | "missing" | "failed" };

// PostgREST says PGRST202 for a function it doesn't know; Postgres says 42883.
const isMissing = (code: string | undefined) =>
  code === "PGRST202" || code === "42883";

async function call<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<Loaded<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (error.code === "42501") return { ok: false, reason: "denied" };
    if (isMissing(error.code)) return { ok: false, reason: "missing" };
    console.error(`Owner console ${name} failed: ${error.message}`);
    return { ok: false, reason: "failed" };
  }
  return { ok: true, data: data as T };
}

export const loadOverview = () => call<OwnerOverview>("owner_overview");

export const loadGrowth = (range: Range) =>
  call<GrowthData>("owner_growth", { p_range: range });

export const loadEngagement = (range: Range) =>
  call<EngagementData>("owner_engagement", { p_range: range });

export const loadContent = () => call<ContentData>("owner_content");

export const loadFeedback = (status: FeedbackFilter, page: number) =>
  call<FeedbackQueue>("owner_feedback", {
    p_status: status,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  });

export const loadAudit = (q: string, page: number) =>
  call<AuditRow[]>("owner_audit", {
    p_q: q,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  });

// System health: the database answers (and how fast, timed here), what is on it, and the newest migrations.
export async function loadSystem(): Promise<
  Loaded<SystemData> & { latencyMs: number | null }
> {
  const started = performance.now();
  const result = await call<SystemData>("owner_system");
  const latencyMs = result.ok ? Math.round(performance.now() - started) : null;
  return { ...result, latencyMs };
}
