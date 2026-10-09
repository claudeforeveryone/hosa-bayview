import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { requireRole, type Profile, type Role } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AttendanceOverview } from "./attendance-overview";
import { RoleSwitch } from "./role-switch";

export const metadata: Metadata = { title: "Admin" };

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", year: "numeric" });

export default async function AdminPage() {
  const me = await requireRole("executive");
  const supabase = await createClient();
  const [{ data, error }, rooms, tests] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role, created_at").order("created_at"),
    supabase.from("classrooms").select("id", { count: "exact", head: true }),
    supabase.from("tests").select("id", { count: "exact", head: true }),
  ]);
  if (error) throw new Error(`Members lookup failed: ${error.message}`);
  if (rooms.error || tests.error) throw new Error(`Counts failed: ${(rooms.error ?? tests.error)?.message}`);
  const people = (data ?? []) as Profile[];
  const count = (r: Role) => people.filter((p) => p.role === r).length;

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
          <div key={label} className="grid gap-1 border-r border-b border-rule px-4 py-4">
            <dt className="caps text-[14px] text-ink-2">{label}</dt>
            <dd className="num font-display text-[40px] leading-none font-bold">{n}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="people-h" className="grid gap-4">
        <h2 id="people-h" className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase">
          People
        </h2>
        <ul className="border-t border-rule">
          {people.map((p) => (
            <li
              key={p.id}
              className="grid grid-cols-1 items-center gap-3 border-b border-rule px-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-[17px] font-medium">
                  {p.full_name}
                  {p.id === me.id ? <span className="caps ml-2 bg-you px-1.5 py-0.5 text-[12px] text-on-you">You</span> : null}
                </span>
                <span className="block truncate text-[15px] text-ink-2">
                  {p.email} · <span className="num">{date(p.created_at)}</span>
                </span>
              </span>
              <RoleSwitch userId={p.id} name={p.full_name} role={p.role} isMe={p.id === me.id} />
            </li>
          ))}
        </ul>
      </section>
      <AttendanceOverview people={people} />
    </div>
  );
}
