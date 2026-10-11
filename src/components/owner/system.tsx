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
export function SystemSection({ info }: { info: SystemInfo }) {
  const { deployment: d, data } = info;
  const link = commitUrl(d);
  return (
    <>
      <Sheet id="system-h" title="System" note="Checked when this page loaded.">
        <Figures label="Health">
          <Figure
            label="Database"
            value={info.db === "down" ? "No answer" : "Up"}
            note={
              info.latencyMs !== null
                ? `Answered in ${info.latencyMs} ms`
                : null
            }
          />
          <Figure
            label="Build"
            value={d.commit ? d.commit.slice(0, 7) : "Local"}
            note={
              d.environment
                ? `${d.environment}${d.branch ? `, ${d.branch}` : ""}`
                : "Not a Vercel build"
            }
          />
        </Figures>
      </Sheet>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 xl:grid-cols-2 xl:gap-10">
        <Sheet id="deploy-h" title="Deployment">
          <Ledger
            label="Deployment"
            rows={[
              {
                label: "Commit",
                value: d.commit ? (
                  link ? (
                    <a
                      href={link}
                      className="underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                    >
                      {d.commit.slice(0, 7)}
                    </a>
                  ) : (
                    d.commit.slice(0, 7)
                  )
                ) : (
                  "Unknown"
                ),
              },
              { label: "Branch", value: d.branch ?? "Unknown" },
              { label: "Environment", value: d.environment ?? "Local" },
              {
                label: "Database clock",
                value: data ? stampText(data.db_time) : "Unknown",
                note: "Toronto time",
              },
              {
                label: "Server errors",
                value: "Vercel logs",
                note: "They aren't stored in the database. Open the project's runtime logs in Vercel.",
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
                  value: data.analytics.rows.toLocaleString("en-CA"),
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
                : "The database didn’t answer."}
            </p>
          )}
        </Sheet>
      </div>
    </>
  );
}
