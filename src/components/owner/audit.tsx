import Link from "next/link";
import { Button } from "@/components/form";
import { auditLine } from "@/lib/owner-audit";
import { PAGE_SIZE, stampText } from "@/lib/owner-metrics";
import type { AuditRow } from "@/lib/owner-types";
import { DataTable, Notice, Pager, Sheet } from "./primitives";

// A triage row names "feedback #1a2b3c4d" (the id's first 8 characters). It opens the full feedback list, at that
// item when it is on the first page.
function feedbackHref(
  base: string,
  extra: Record<string, string> | undefined,
  target: string,
): string {
  const search = new URLSearchParams({
    ...extra,
    tab: "feedback",
    status: "all",
  });
  const short = /#([0-9a-f]{8})$/.exec(target)?.[1];
  return `${base}?${search.toString()}${short ? `#feedback-${short}` : ""}`;
}

// The admin log (0052), searchable: role changes, bans, titles, warnings, removals, code changes, feedback triage.
// Filled by the database itself, so nothing here can be edited.
export function AuditSection({
  base,
  q,
  page,
  rows,
  extra,
}: {
  base: string;
  q: string;
  page: number;
  rows: AuditRow[];
  extra?: Record<string, string>;
}) {
  const params: Record<string, string> = { ...extra, tab: "audit" };
  if (q) params.q = q;
  return (
    <Sheet
      id="audit-h"
      title="Audit log"
      note="Role, ban, title, warning, removal, code, GIF and feedback changes, newest first. Search by name, action or detail."
    >
      <form
        action={base}
        method="get"
        role="search"
        className="grid max-w-2xl grid-cols-[minmax(0,1fr)_auto] items-end gap-3"
      >
        {Object.entries({ ...extra, tab: "audit" }).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className="grid gap-1.5">
          <label htmlFor="audit-q" className="text-[15px] font-medium">
            Search the log
          </label>
          <input
            id="audit-q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={120}
            className="step h-12 w-full min-w-0 border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink"
          />
        </div>
        <Button type="submit" variant="line">
          Search
        </Button>
      </form>
      {rows.length === 0 ? (
        <Notice>
          {q ? `Nothing in the log matches “${q}”.` : "The log is empty."}
        </Notice>
      ) : (
        <DataTable<AuditRow>
          caption="Logged changes, newest first."
          rowKey={(r) => String(r.id)}
          rows={rows}
          columns={[
            {
              key: "what",
              header: "What",
              cell: (r) => {
                const line = auditLine(r);
                return (
                  <>
                    <span className="font-semibold">
                      {r.actor_name || "System"}
                    </span>{" "}
                    <span className="font-normal">{line.verb}</span>
                    {line.target && line.feedback ? (
                      <>
                        {" "}
                        <Link
                          href={feedbackHref(base, extra, line.target)}
                          className="font-semibold underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                        >
                          {line.target}
                        </Link>
                      </>
                    ) : line.target ? (
                      <span className="font-semibold"> {line.target}</span>
                    ) : null}
                  </>
                );
              },
            },
            {
              key: "detail",
              header: "Detail",
              when: (r) => auditLine(r).detail !== "",
              cell: (r) => (
                <span className="text-[15px] text-ink-2 [overflow-wrap:anywhere]">
                  {auditLine(r).detail}
                </span>
              ),
            },
            {
              key: "when",
              header: "When",
              cell: (r) => (
                <span className="text-[15px] whitespace-nowrap text-ink-2">
                  {stampText(r.created_at)}
                </span>
              ),
            },
          ]}
        />
      )}
      <Pager
        base={base}
        params={params}
        page={page}
        hasMore={rows.length === PAGE_SIZE}
      />
    </Sheet>
  );
}
