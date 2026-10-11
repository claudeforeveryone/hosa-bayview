import Link from "next/link";
import { reasonLabel } from "@/lib/flag-reasons";
import { countText, percentText, stampText } from "@/lib/owner-metrics";
import type { ContentData, ContentEventRow } from "@/lib/owner-types";
import { DataTable, Figure, Figures, Notice, Sheet } from "./primitives";

// Content health: the question bank across every event. These counts are about the material, not about people,
// so they are exact.
export function ContentSection({ data }: { data: ContentData }) {
  const repeated = data.per_event.reduce((n, e) => n + e.repeated, 0);
  const noExplain = percentText(data.missing_explanations, data.questions);
  const withQuestions = data.per_event.filter(
    (e) => e.questions > 0 || e.tests > 0,
  );
  const empty = data.per_event.length - withQuestions.length;
  return (
    <>
      <Sheet
        id="content-h"
        title="Content health"
        note={`${countText(data.questions)} questions in ${countText(data.tests)} tests (${countText(data.published_tests)} posted).`}
      >
        <Figures label="Content totals">
          <Figure label="Questions" value={countText(data.questions)} />
          <Figure
            label="No explanation"
            value={countText(data.missing_explanations)}
            note={noExplain ? `${noExplain} of all questions` : null}
          />
          <Figure
            label="Repeated"
            value={countText(repeated)}
            note="Extra copies inside one event"
          />
          <Figure
            label="Open reports"
            value={countText(data.open_reports)}
            note={`${countText(data.open_asks)} Ask teacher questions waiting`}
          />
        </Figures>
      </Sheet>

      <Sheet
        id="reported-h"
        title="Reported questions"
        note="Members report a wrong key, unclear wording or a typo from practice and review. The event's trainer is told and replies in the test's question list."
      >
        {data.reported.length === 0 ? (
          <Notice>No open reports.</Notice>
        ) : (
          <ol className="border-t-[3px] border-ink">
            {data.reported.map((r) => (
              <li
                key={r.question_id}
                className="grid gap-2 border-b border-rule py-4"
              >
                <p className="caps num text-[14px] text-ink-2">
                  {r.room} · {r.test_title} · Q{r.pos}
                </p>
                <p className="line-clamp-3 text-[17px] [overflow-wrap:anywhere]">
                  {r.prompt}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <ul className="flex flex-wrap gap-1.5" aria-label="Reasons">
                    {r.reasons.map((reason) => (
                      <li
                        key={reason}
                        className="caps border border-ink px-2 py-0.5 text-[13px]"
                      >
                        {reasonLabel(reason)}
                      </li>
                    ))}
                  </ul>
                  <span className="text-[14px] text-ink-2">
                    {r.reports} {r.reports === 1 ? "report" : "reports"}, last{" "}
                    {stampText(r.last_at)}
                  </span>
                  <Link
                    href={`/c/${r.classroom_id}/tests/${r.test_id}`}
                    className="caps text-[14px] underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                  >
                    Open the test
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Sheet>

      <Sheet
        id="per-event-h"
        title="By event"
        note={
          empty > 0
            ? `${empty} more ${empty === 1 ? "room has" : "rooms have"} no tests yet.`
            : undefined
        }
      >
        {withQuestions.length === 0 ? (
          <Notice>No tests in any event yet.</Notice>
        ) : (
          <DataTable<ContentEventRow>
            caption="Questions per event, with the ones that need a look."
            rowKey={(e) => e.id}
            rows={withQuestions}
            columns={[
              {
                key: "name",
                header: "Event",
                cell: (e) => (
                  <>
                    {e.name}
                    {e.kind === "competition" ? (
                      <span className="block text-[13px] font-normal text-ink-2">
                        Mock competition
                      </span>
                    ) : null}
                  </>
                ),
              },
              {
                key: "questions",
                header: "Questions",
                numeric: true,
                cell: (e) => countText(e.questions),
              },
              {
                key: "tests",
                header: "Tests",
                numeric: true,
                cell: (e) => countText(e.tests),
              },
              {
                key: "missing",
                header: "No explanation",
                numeric: true,
                cell: (e) => countText(e.missing_explanations),
              },
              {
                key: "repeated",
                header: "Repeated",
                numeric: true,
                cell: (e) => countText(e.repeated),
              },
              {
                key: "reports",
                header: "Reports",
                numeric: true,
                cell: (e) => countText(e.open_reports),
              },
            ]}
          />
        )}
      </Sheet>

      <Sheet
        id="dupes-h"
        title="Most repeated"
        note={`${countText(data.duplicate_groups)} questions appear more than once (capitals, spacing and end punctuation ignored). The 20 with the most copies, each shown as one copy is written:`}
      >
        {data.duplicates.length === 0 ? (
          <Notice>No repeated questions.</Notice>
        ) : (
          <ol className="border-t-[3px] border-ink">
            {data.duplicates.map((d) => (
              <li key={d.stem} className="grid gap-1 border-b border-rule py-3">
                <p className="line-clamp-2 text-[16px] [overflow-wrap:anywhere]">
                  {d.example}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <p className="num text-[14px] text-ink-2">
                    {d.copies} copies in {d.tests}{" "}
                    {d.tests === 1 ? "test" : "tests"}
                    {d.rooms.length ? ` · ${d.rooms.join(", ")}` : ""}
                  </p>
                  <Link
                    href={`/c/${d.classroom_id}/tests/${d.test_id}`}
                    className="caps text-[14px] underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                  >
                    Open one copy
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Sheet>
    </>
  );
}
