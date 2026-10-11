import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { AuditSection } from "@/components/owner/audit";
import { OwnerConsole } from "@/components/owner/console";
import { ContentSection } from "@/components/owner/content";
import { EngagementSection } from "@/components/owner/engagement";
import { FeedbackSection } from "@/components/owner/feedback";
import { GrowthSection } from "@/components/owner/growth";
import { MembersSection } from "@/components/owner/members";
import { OverviewSection } from "@/components/owner/overview";
import { Unavailable } from "@/components/owner/primitives";
import { SystemSection } from "@/components/owner/system";
import { parsePeriod } from "@/lib/activity";
import { deploymentFrom } from "@/lib/deployment";
import { canSeeDevStats, getDevStats } from "@/lib/dev-stats-data";
import {
  loadAudit,
  loadContent,
  loadEngagement,
  loadFeedback,
  loadGrowth,
  loadOverview,
  loadSystem,
  type Loaded,
} from "@/lib/owner-data";
import {
  pageNumber,
  parseFeedbackFilter,
  parseRange,
  parseTab,
} from "@/lib/owner-metrics";

// The owner console. Only accounts in private.stats_viewers (0105) get past the first line; everyone else, signed in
// or not, gets the not-found page, so the console's existence isn't shown. Every owner_* function checks the same
// list again in the database (0232), so this check is never the only guard. All reads happen here, on the server.
export const metadata: Metadata = { title: "Developer" };

const BASE = "/developer";

export default async function DeveloperPage(props: PageProps<"/developer">) {
  if (!(await canSeeDevStats())) notFound();
  const sp = await props.searchParams;
  const tab = parseTab(sp.tab);
  return (
    <OwnerConsole base={BASE} tab={tab}>
      {await section(tab, sp)}
    </OwnerConsole>
  );
}

// A refusal here means the viewer row went away between the gate and the read: treat it like any non-owner.
function settle<T>(r: Loaded<T>, render: (data: T) => ReactNode) {
  if (r.ok) return render(r.data);
  if (r.reason === "denied") notFound();
  return <Unavailable reason={r.reason} />;
}

async function section(
  tab: ReturnType<typeof parseTab>,
  sp: Awaited<PageProps<"/developer">["searchParams"]>,
) {
  switch (tab) {
    case "overview":
      return settle(await loadOverview(), (d) => <OverviewSection data={d} />);
    case "growth": {
      const range = parseRange(sp.range);
      return settle(await loadGrowth(range), (d) => (
        <GrowthSection base={BASE} range={range} data={d} />
      ));
    }
    case "engagement": {
      const range = parseRange(sp.range);
      return settle(await loadEngagement(range), (d) => (
        <EngagementSection base={BASE} range={range} data={d} />
      ));
    }
    case "content":
      return settle(await loadContent(), (d) => <ContentSection data={d} />);
    case "feedback": {
      const filter = parseFeedbackFilter(sp.status);
      const page = pageNumber(sp.p);
      return settle(await loadFeedback(filter, page), (d) => (
        <FeedbackSection base={BASE} filter={filter} page={page} queue={d} />
      ));
    }
    case "members": {
      const period = parsePeriod(sp.period);
      const [rows, system] = await Promise.all([
        getDevStats(period),
        loadSystem(),
      ]);
      if (!rows) notFound();
      // Without 0232 the console can't tell whether battles exist, so the column stays as it always was.
      const battles = system.ok ? system.data.features.battles : true;
      return (
        <MembersSection
          base={BASE}
          period={period}
          rows={rows}
          battles={battles}
        />
      );
    }
    case "audit": {
      const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 120) : "";
      const page = pageNumber(sp.p);
      return settle(await loadAudit(q, page), (rows) => (
        <AuditSection base={BASE} q={q} page={page} rows={rows} />
      ));
    }
    case "system": {
      const system = await loadSystem();
      if (!system.ok && system.reason === "denied") notFound();
      return (
        <SystemSection
          info={{
            deployment: deploymentFrom(process.env),
            db: system.ok ? "up" : system.reason === "missing" ? "missing" : "down",
            latencyMs: system.latencyMs,
            data: system.ok ? system.data : null,
          }}
        />
      );
    }
  }
}
