import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { NewBlank } from "@/components/new-blank";
import { PageTitle } from "@/components/page-title";
import { canTeach, requireProfile } from "@/lib/auth";
import { getMyClassrooms } from "@/lib/classrooms";
import { formNumber } from "@/lib/join-code";
import { UNTITLED_TEST } from "@/lib/untitled";
import { createClient } from "@/lib/supabase/server";
import { createBlankTest } from "@/app/(app)/c/[id]/tests/actions";

export const metadata: Metadata = { title: "Tests" };

type Row = {
  id: string;
  num: number;
  title: string;
  time_limit_minutes: number | null;
  is_published: boolean;
  classroom_id: string;
  classrooms: { name: string } | null;
};

// Every test you can see across your classrooms. RLS decides which.
export default async function TestsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tests")
    .select("id, num, title, time_limit_minutes, is_published, classroom_id, classrooms(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Tests lookup failed: ${error.message}`);
  const tests = (data ?? []) as unknown as Row[];

  // Teachers can only add tests to classrooms they manage.
  const teacher = canTeach(profile);
  const managed = teacher
    ? (await getMyClassrooms()).filter((r) => r.can_manage).map((r) => ({ id: r.id, name: r.name }))
    : [];

  const header = !teacher ? null : managed.length ? (
    tests.length ? (
      <NewBlank action={createBlankTest} variant="button" label="New test" classrooms={managed} />
    ) : null
  ) : (
    <Link
      href="/c/new"
      className="caps step inline-flex h-11 shrink-0 items-center border border-ink px-4 text-[16px] hover:bg-band"
    >
      Make a classroom first
    </Link>
  );

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle>Tests</PageTitle>
        {header}
      </div>
      {tests.length ? (
        <ul className="border-t border-rule">
          {tests.map((t) => (
            <li key={t.id} className="border-b border-rule">
              <Link
                href={`/c/${t.classroom_id}/tests`}
                className="step grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-4 hover:bg-band sm:px-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-display text-[clamp(1.5rem,5vw,2.25rem)] leading-[1.05] font-semibold uppercase">
                    {t.title}
                  </span>
                  <span className="block truncate text-[16px] text-ink-2">
                    {[
                      t.classrooms?.name,
                      t.time_limit_minutes ? `${t.time_limit_minutes} min` : "Untimed",
                      t.is_published ? null : "Draft",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-ink-2">
                  <span className="num caps text-[15px]">{formNumber("T", t.num)}</span>
                  <ChevronRight size={22} strokeWidth={1.75} aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : teacher && managed.length ? (
        <NewBlank action={createBlankTest} variant="tile" label={UNTITLED_TEST} classrooms={managed} />
      ) : (
        <EmptyState title="No tests yet" />
      )}
    </div>
  );
}
