import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { requireRole, type Role } from "@/lib/auth";
import { avatarSources } from "@/lib/avatar-urls";
import { createClient } from "@/lib/supabase/server";
import { AttendanceOverview } from "./attendance-overview";
import { PeopleList } from "./people-list";
import type { PersonRow, WarningRow } from "./person-dialog";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const me = await requireRole("executive");
  const supabase = await createClient();
  const [{ data, error }, rooms, tests, demo] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, email, full_name, role, created_at, avatar_path, grade, banned_until, ban_reason",
      )
      .order("created_at"),
    supabase.from("classrooms").select("id", { count: "exact", head: true }),
    supabase.from("tests").select("id", { count: "exact", head: true }),
    supabase.rpc("am_demo"),
  ]);
  // Demo admins can look around, but don't see emails or get the moderation controls. Fails closed.
  const isDemo = demo.data !== false;
  if (error) throw new Error(`Members lookup failed: ${error.message}`);
  if (rooms.error || tests.error)
    throw new Error(`Counts failed: ${(rooms.error ?? tests.error)?.message}`);
  // Demo admins never get emails: they're stripped here, on the server, before anything reaches a client component.
  const sources = await avatarSources(
    ((data ?? []) as PersonRow[]).map((p) => p.avatar_path),
  );
  const people: PersonRow[] = ((data ?? []) as PersonRow[]).map((p) => ({
    ...p,
    email: isDemo ? "" : p.email,
    avatar_src: p.avatar_path ? (sources.get(p.avatar_path) ?? null) : null,
  }));
  const count = (r: Role) => people.filter((p) => p.role === r).length;

  // Warning history for the panel. Only real executives can read it (RLS), and demo admins don't open the panel.
  const warnings: Record<string, WarningRow[]> = {};
  if (!isDemo) {
    const { data: history, error: historyError } = await supabase
      .from("user_warnings")
      .select("id, user_id, message, created_at, seen_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (historyError)
      throw new Error(`Warnings lookup failed: ${historyError.message}`);
    for (const w of (history ?? []) as (WarningRow & { user_id: string })[]) {
      (warnings[w.user_id] ??= []).push({
        id: w.id,
        message: w.message,
        created_at: w.created_at,
        seen_at: w.seen_at,
      });
    }
  }

  const stats = [
    ["Members", people.length],
    ["Trainers", count("trainer")],
    ["Executives", count("executive")],
    ["Classrooms", rooms.count ?? 0],
    ["Tests", tests.count ?? 0],
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-10">
      <PageTitle>Admin</PageTitle>
      <dl className="grid grid-cols-2 border-t border-l border-rule sm:grid-cols-5">
        {stats.map(([label, n]) => (
          <div
            key={label}
            className="grid gap-1 border-r border-b border-rule px-4 py-4"
          >
            <dt className="caps text-[14px] text-ink-2">{label}</dt>
            <dd className="num font-display text-[40px] leading-none font-bold">
              {n}
            </dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="people-h" className="grid gap-4">
        <h2
          id="people-h"
          tabIndex={-1}
          className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase focus:outline-none"
        >
          People
        </h2>
        <PeopleList
          people={people}
          warnings={warnings}
          meId={me.id}
          isDemo={isDemo}
        />
      </section>
      <AttendanceOverview people={people} />
    </div>
  );
}
