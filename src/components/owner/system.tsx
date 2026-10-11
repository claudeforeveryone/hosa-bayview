import { commitUrl } from "@/lib/deployment";
import { dateText, stampText } from "@/lib/owner-metrics";
import type { SystemInfo } from "@/lib/owner-types";
import { Figure, Figures, Ledger, Sheet } from "./primitives";

const FEATURE_LABEL: Record<
  keyof NonNullable<SystemInfo["data"]>["features"],
  string
> = {
  feedback: "Feedback and question reports (0231)",
  analytics: "Usage events (0230)",
  battles: "Battles (0095 to 0098)",
  chapter_code: "Chapter code at sign-up (0090)",
  push: "Push notifications (0220)",
};

// The site as it runs right now: which build, whether the database answers and how fast, what is on the database.
// Nothing secret: the commit and branch are public on GitHub, and the database check uses the owner's own session.
// Each fact once: the Build figure carries the commit (linked), environment and branch; the rows under it don't.
// There is no "database down" state: this page's own gate asks the database first, so with the database out of
// reach the page doesn't open at all. What can show here is an answer that came back as an error.
export function SystemSection({ info }: { info: SystemInfo }) {
  const { deployment: d, data } = info;
  const link = commitUrl(d);
  return (
    <>
      <Sheet
        id="system-h"
        title="System"
        note="Checked when this page loaded. Build details come from Vercel. If the database were out of reach, this page wouldn't open at all."
      >
        <Figures label="Health">
          <Figure
            label="Database"
            value={info.db === "error" ? "Error" : "Up"}
            note={
              info.latencyMs !== null
                ? `Answered in ${info.latencyMs} ms`
                : info.db === "error"
                  ? "It answered, with an error"
                  : null
            }
          />
          <Figure
            label="Build"
            value={d.commit ? d.commit.slice(0, 7) : "Unknown"}
            note={
              d.environment || link ? (
                <>
                  {d.environment
                    ? `${d.environment}${d.branch ? `, ${d.branch}` : ""}`
                    : null}
                  {d.environment && link ? " · " : null}
                  {link ? (
                    <a
                      href={link}
                      className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                    >
                      Open the commit
                    </a>
                  ) : null}
                </>
              ) : (
                "No Vercel build details"
              )
            }
          />
        </Figures>
      </Sheet>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 xl:grid-cols-2 xl:gap-10">
        <Sheet id="server-h" title="Server">
          <Ledger
            label="Server"
            rows={[
              {
                label: "Database clock",
                value: data ? stampText(data.db_time) : "Unknown",
                note: "Toronto time",
              },
              {
                label: "Server errors",
                value: "Not stored",
                note: "Read them in the host's runtime logs.",
              },
            ]}
          />
        </Sheet>
        <Sheet id="db-h" title="On the database">
          {data ? (
            <Ledger
              label="Database"
              rows={[
                ...(
                  Object.keys(FEATURE_LABEL) as (keyof typeof FEATURE_LABEL)[]
                ).map((k) => ({
                  label: FEATURE_LABEL[k],
                  value: data.features[k] ? "On" : "Not applied",
                })),
                {
                  label: "Migrations applied",
                  value: data.migrations
                    ? String(data.migrations.count)
                    : "Unknown",
                  note: data.migrations?.latest.length
                    ? `Newest: ${data.migrations.latest.join(", ")}`
                    : null,
                },
                {
                  label: "Usage events stored",
                  value: data.analytics.stored ? "Yes" : "None yet",
                  note: data.analytics.oldest
                    ? `Oldest from ${dateText(data.analytics.oldest)}. Kept 13 months, then deleted by the daily job.`
                    : "Kept 13 months, then deleted by the daily job.",
                },
              ]}
            />
          ) : (
            <p className="text-[16px] text-ink-2">
              {info.db === "missing"
                ? "The database answered, but the owner functions (0230 to 0232) aren't applied yet."
                : "The database answered with an error, so this list didn’t load. Reload to try again."}
            </p>
          )}
        </Sheet>
      </div>
    </>
  );
}
