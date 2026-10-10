import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { requireRole, type Role } from "@/lib/auth";
import { gifLimitBytes } from "@/lib/avatar";
import { avatarSources } from "@/lib/avatar-urls";
import { readChapterGate } from "@/lib/chapter-code";
import { storageMeter, usedOfLimit } from "@/lib/format-bytes";
import { formatBytes } from "@/lib/materials";
import { createClient } from "@/lib/supabase/server";
import { AttendanceSummary } from "./attendance-overview";
import { ChapterCodeSection } from "./chapter-code";
import { AdminLog, ContentLists } from "./content";
import { PeopleList } from "./people-list";
import type { PersonRow, WarningRow } from "./person-dialog";

export const metadata: Metadata = { title: "Admin" };

type UsageRow = { bucket: string; files: number; bytes: number };

// Free plan storage: used of 1 GB, then each bucket. Executives only (the RPC raises for anyone else).
async function StorageMeter() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storage_usage");
  if (error) throw new Error(`Storage lookup failed: ${error.message}`);
  // bigint columns can arrive as strings, so coerce.
  const rows = ((data ?? []) as UsageRow[]).map((r) => ({
    bucket: r.bucket,
    files: Number(r.files),
    bytes: Number(r.bytes),
  }));
  const used = rows.reduce((sum, r) => sum + r.bytes, 0);
  const { percent, warn, valueText } = storageMeter(used);

  return (
    <section aria-labelledby="storage-h" className="grid gap-4">
      <h2
        id="storage-h"
        className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase"
      >
        Storage
      </h2>
      <p className="num font-display text-[32px] leading-none font-bold">
        {usedOfLimit(used)}
      </p>
      <div
        role="progressbar"
        aria-label="Storage used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={valueText}
        className="h-2 border border-rule"
      >
        <div
          className={`h-full ${warn ? "bg-danger" : "bg-ink"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {warn ? (
        <p className="caps text-[15px] font-semibold text-danger">
          Storage almost full
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="border-t border-rule">
          {rows.map((r) => (
            <li
              key={r.bucket}
              className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-rule py-2"
            >
              <span>{r.bucket}</span>
              <span className="num text-ink-2">
                {r.files} {r.files === 1 ? "file" : "files"},{" "}
                {formatBytes(r.bytes)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// Hidden until migration 0090 is applied (the RPC is missing, so the gate reads as null).
async function ChapterCode() {
  const on = await readChapterGate(await createClient());
  return on === null ? null : <ChapterCodeSection on={on} />;
}

export default async function AdminPage() {
  const me = await requireRole("executive");
  const supabase = await createClient();
  const [{ data, error }, rooms, tests, demo, exemptRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, email, full_name, role, created_at, avatar_path, grade, banned_until, ban_reason, title",
      )
      .order("created_at"),
    supabase.from("classrooms").select("id", { count: "exact", head: true }),
    supabase.from("tests").select("id", { count: "exact", head: true }),
    supabase.rpc("am_demo"),
    supabase.rpc("gif_exempt_ids"),
  ]);
  if (exemptRes.error)
    throw new Error(`GIF limits lookup failed: ${exemptRes.error.message}`);
  const exempt = new Set((exemptRes.data ?? []) as string[]);
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
    // Same rule as savePicture: the bigger limit needs both the picture's owner and the uploader to be exempt.
    gif_limit: gifLimitBytes(exempt.has(p.id) && exempt.has(me.id)),
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

  // eslint-disable-next-line react-hooks/purity -- server render time, once per request
  const now = Date.now();
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
      {isDemo ? null : <ChapterCode />}
      {isDemo ? null : <StorageMeter />}
      <AttendanceSummary canWarn={!isDemo} />
      {isDemo ? null : <AdminLog now={now} />}
      {isDemo ? null : <ContentLists />}
    </div>
  );
}
