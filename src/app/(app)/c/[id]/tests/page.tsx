import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { NewBlank } from "@/components/new-blank";
import { VisibilityToggle } from "@/components/test-visibility";
import { getClassroom } from "@/lib/classrooms";
import { formNumber } from "@/lib/join-code";
import { hiddenLabel } from "@/lib/test-visibility";
import { getClassroomTests, getPublishTimes, type TestSummary } from "@/lib/tests";
import { createBlankTest } from "./actions";

// publishAt: when a hidden test is set to post (managers only).
function meta(t: TestSummary, manager: boolean, publishAt?: string) {
  const parts = [
    `${t.question_count} question${t.question_count === 1 ? "" : "s"}`,
    t.time_limit_minutes ? `${t.time_limit_minutes} min` : "Practice",
  ];
  const hidden = manager ? hiddenLabel(t.is_published, publishAt) : null;
  if (hidden) parts.push(hidden);
  return parts.join(" · ");
}

export default async function TestsTab({ params }: PageProps<"/c/[id]/tests">) {
  const { id } = await params;
  const [room, tests] = await Promise.all([getClassroom(id), getClassroomTests(id)]);
  if (!room) notFound();
  const schedules = room.can_manage ? await getPublishTimes(id) : new Map<string, string>();

  const here = [{ id: room.id, name: room.name }];

  if (!tests.length) {
    if (!room.can_manage) return <EmptyState title="No tests yet" />;
    return <NewBlank action={createBlankTest} variant="tile" label="New test" classrooms={here} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {room.can_manage ? (
        <div className="flex justify-end">
          <NewBlank action={createBlankTest} variant="button" label="New test" classrooms={here} />
        </div>
      ) : null}
      <ul className="border-t border-rule">
        {tests.map((t) => (
          <li
            key={t.id}
            className={`border-b border-rule ${room.can_manage ? "grid grid-cols-[minmax(0,1fr)_auto] items-center" : ""}`}
          >
            <Link
              href={`/c/${room.id}/tests/${t.id}`}
              className="step grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-4 hover:bg-band sm:px-3"
            >
              <span className="min-w-0">
                <span className="block truncate font-display text-[clamp(1.5rem,5vw,2.25rem)] leading-[1.05] font-semibold uppercase">
                  {t.title}
                </span>
                {/* Wraps rather than truncates, so a manager always sees when a scheduled test posts. */}
                <span className="block text-16 text-ink-2">
                  {meta(t, room.can_manage, schedules.get(t.id))}
                </span>
              </span>
              <span className="flex items-center gap-3 text-ink-2">
                {t.my_best !== null && t.my_best_total ? (
                  <span className="num font-display text-24 font-semibold text-ink">
                    {t.my_best}/{t.my_best_total}
                  </span>
                ) : null}
                <span className="num caps hidden text-15 sm:inline">{formNumber("T", t.num)}</span>
                <ChevronRight size={22} strokeWidth={1.75} aria-hidden />
              </span>
            </Link>
            {room.can_manage ? (
              <VisibilityToggle
                testId={t.id}
                title={t.title}
                published={t.is_published}
                scheduled={schedules.has(t.id)}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
