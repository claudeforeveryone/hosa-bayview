import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageTitle } from "@/components/page-title";
import { formNumber } from "@/lib/join-code";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tests")
    .select("id, num, title, time_limit_minutes, is_published, classroom_id, classrooms(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Tests lookup failed: ${error.message}`);
  const tests = (data ?? []) as unknown as Row[];

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageTitle>Tests</PageTitle>
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
                    {[t.classrooms?.name, t.time_limit_minutes ? `${t.time_limit_minutes} min` : "Untimed", t.is_published ? null : "Draft"]
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
      ) : (
        <EmptyState title="No tests yet" />
      )}
    </div>
  );
}
