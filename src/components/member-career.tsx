import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { RESULTS, filterCareer, formatCount, type Result } from "@/lib/activity";
import type { CareerRow } from "@/lib/activity-data";

const RESULT_LABEL: Record<Result, string> = { all: "All", right: "Right", wrong: "Wrong" };

// Every answered question, with what you picked and, when it was wrong, the right answer.
// Right and wrong are spelled out, so the list reads without colour.
export function MemberCareer({ rows, result, basePath }: { rows: CareerRow[]; result: Result; basePath: string }) {
  const shown = filterCareer(rows, result);
  const rightCount = rows.filter((r) => r.is_correct).length;
  const wrongCount = rows.filter((r) => r.is_correct === false).length;
  const counts: Record<Result, number> = { all: rows.length, right: rightCount, wrong: wrongCount };
  return (
    <div className="grid gap-5">
      <nav aria-label="Result">
        <ul className="flex flex-wrap gap-2">
          {RESULTS.map((value) => {
            const on = value === result;
            return (
              <li key={value}>
                <Link
                  href={`${basePath}?result=${value}`}
                  aria-current={on ? "true" : undefined}
                  className={`caps step inline-flex h-11 items-center border px-3.5 text-[17px] ${
                    on ? "border-ink bg-ink text-ground" : "border-rule-strong text-ink hover:bg-band"
                  }`}
                >
                  {RESULT_LABEL[value]} {formatCount(counts[value])}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {shown.length ? (
        <ol className="border-t border-rule">
          {shown.map((item, i) => (
            <li key={`${item.answered_at}-${i}`} className="grid gap-2 border-b border-rule py-4">
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[15px] text-ink-2">
                {item.is_correct === null ? (
                  <span className="caps text-[16px]">Answers hidden</span>
                ) : (
                  <span className={`caps text-[16px] ${item.is_correct ? "text-ok" : "text-danger"}`}>
                    {item.is_correct ? "Right" : "Wrong"}
                  </span>
                )}
                <span>{item.test_title}</span>
                <span className="num">
                  {new Date(item.answered_at).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}
                </span>
              </p>
              <p className="text-[18px] leading-snug">{item.prompt}</p>
              <p className="text-[16px]">
                <span className="text-ink-2">Picked: </span>
                {item.options[item.selected_index]}
              </p>
              {item.is_correct !== false || item.correct_index === null ? null : (
                <p className="text-[16px]">
                  <span className="text-ink-2">Right answer: </span>
                  {item.options[item.correct_index]}
                </p>
              )}
              {item.explanation ? <p className="text-[16px] text-ink-2">{item.explanation}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title={rows.length ? "Nothing in this filter" : "No questions answered yet"} />
      )}
    </div>
  );
}
