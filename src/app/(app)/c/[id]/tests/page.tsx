import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { getClassroom } from "@/lib/classrooms";
import { formNumber } from "@/lib/join-code";
import { getClassroomTests, type TestSummary } from "@/lib/tests";

function meta(t: TestSummary, manager: boolean) {
  const parts = [
    `${t.question_count} question${t.question_count === 1 ? "" : "s"}`,
    t.time_limit_minutes ? `${t.time_limit_minutes} min` : "Practice",
  ];
  if (manager && !t.is_published) parts.push("Draft");
  return parts.join(" · ");
}

export default async function TestsTab({ params }: PageProps<"/c/[id]/tests">) {
  const { id } = await params;
  const [room, tests] = await Promise.all([getClassroom(id), getClassroomTests(id)]);
  if (!room) notFound();

  const newTest = room.can_manage ? (
    <Link
      href={`/c/${room.id}/tests/new`}
      className="caps step inline-flex h-11 shrink-0 items-center gap-2 border border-ink px-4 text-[16px] hover:bg-band"
    >
      <Plus size={18} strokeWidth={2} aria-hidden />
      New test
    </Link>
  ) : null;

  if (!tests.length) return <EmptyState title="No tests yet" action={newTest} />;

  return (
    <div className="grid grid-cols-1 gap-4">
      {newTest ? <div className="flex justify-end">{newTest}</div> : null}
      <ul className="border-t border-rule">
        {tests.map((t) => (
          <li key={t.id} className="border-b border-rule">
            <Link
              href={`/c/${room.id}/tests/${t.id}`}
              className="step grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-4 hover:bg-band sm:px-3"
            >
              <span className="min-w-0">
                <span className="block truncate font-display text-[clamp(1.5rem,5vw,2.25rem)] leading-[1.05] font-semibold uppercase">
                  {t.title}
                </span>
                <span className="block truncate text-[16px] text-ink-2">{meta(t, room.can_manage)}</span>
              </span>
              <span className="flex items-center gap-3 text-ink-2">
                {t.my_best !== null && t.my_best_total ? (
                  <span className="num font-display text-[24px] font-semibold text-ink">
                    {t.my_best}/{t.my_best_total}
                  </span>
                ) : null}
                <span className="num caps hidden text-[15px] sm:inline">{formNumber("T", t.num)}</span>
                <ChevronRight size={22} strokeWidth={1.75} aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
