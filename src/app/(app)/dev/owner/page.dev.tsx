import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AskTeacher } from "@/components/ask-teacher";
import { AuditSection } from "@/components/owner/audit";
import { OwnerConsole } from "@/components/owner/console";
import { ContentSection } from "@/components/owner/content";
import { EngagementSection } from "@/components/owner/engagement";
import { FeedbackSection } from "@/components/owner/feedback";
import { GrowthSection } from "@/components/owner/growth";
import { MembersSection } from "@/components/owner/members";
import { OverviewSection } from "@/components/owner/overview";
import { Notice } from "@/components/owner/primitives";
import { SystemSection } from "@/components/owner/system";
import { PageTitle } from "@/components/page-title";
import { SendFeedback } from "@/components/send-feedback";
import { SettingsSection } from "@/components/settings-section";
import { parsePeriod } from "@/lib/activity";
import {
  FIXTURE_MARKER,
  auditFixture,
  contentFixture,
  engagementFixture,
  feedbackFixture,
  growthFixture,
  membersFixture,
  overviewFixture,
  systemFixture,
} from "@/lib/owner-fixtures";
import { parseFeedbackFilter, parseRange, parseTab } from "@/lib/owner-metrics";

// Dev server only: the owner console and the two student entry points, filled with made-up data, for screenshots
// and design review. The .dev.tsx extension is a page only under `next dev` (next.config.ts), so production builds
// have no /dev/owner route at all; the NODE_ENV check is a second lock. Signed-in pages, like the rest of (app).
export const metadata: Metadata = { title: "Owner console fixtures" };

const BASE = "/dev/owner";

type Search = Record<string, string | string[] | undefined>;

export default async function OwnerGallery({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const banner = (
    <Notice>
      {FIXTURE_MARKER}: made-up data on the dev server.{" "}
      {sp.view === "entry" ? (
        <Link href={BASE} className="underline underline-offset-4">
          Owner console
        </Link>
      ) : (
        <Link
          href={`${BASE}?view=entry`}
          className="underline underline-offset-4"
        >
          Student entry points
        </Link>
      )}
    </Notice>
  );
  if (sp.view === "entry") return <EntryPoints banner={banner} />;

  const tab = parseTab(sp.tab);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {banner}
      <OwnerConsole base={BASE} tab={tab}>
        {section(tab, sp)}
      </OwnerConsole>
    </div>
  );
}

function section(tab: ReturnType<typeof parseTab>, sp: Search) {
  switch (tab) {
    case "overview":
      return <OverviewSection data={overviewFixture} />;
    case "growth":
      return (
        <GrowthSection
          base={BASE}
          range={parseRange(sp.range)}
          data={growthFixture}
        />
      );
    case "engagement":
      return (
        <EngagementSection
          base={BASE}
          range={parseRange(sp.range)}
          data={engagementFixture}
        />
      );
    case "content":
      return <ContentSection data={contentFixture} />;
    case "feedback":
      return (
        <FeedbackSection
          base={BASE}
          filter={parseFeedbackFilter(sp.status)}
          page={0}
          queue={feedbackFixture}
          readOnly
        />
      );
    case "members":
      return (
        <MembersSection
          base={BASE}
          period={parsePeriod(sp.period)}
          rows={membersFixture}
          battles={false}
        />
      );
    case "audit":
      return <AuditSection base={BASE} q="" page={0} rows={auditFixture} />;
    case "system":
      return (
        <SystemSection
          info={{
            deployment: {
              commit: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
              branch: "main",
              environment: "production",
              repo: null,
            },
            db: "up",
            latencyMs: 42,
            data: systemFixture,
          }}
        />
      );
  }
}

const Q = "00000000-0000-4000-8000-00000000e00";
const T = "00000000-0000-4000-8000-00000000d001";

// Settings > Account > Send feedback, and Report this question under a reviewed answer, as members see them.
function EntryPoints({ banner }: { banner: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      {banner}
      <PageTitle meta="Where members send feedback and report questions">
        Entry points
      </PageTitle>
      <SettingsSection
        id="feedback-h"
        title="Send feedback"
        description="A bug, an idea, or something that could be clearer. Only the site owner reads it."
      >
        <SendFeedback readOnly />
      </SettingsSection>
      <section
        aria-labelledby="review-h"
        className="grid gap-8 border-t-[3px] border-ink pt-5"
      >
        <h2
          id="review-h"
          className="font-display text-[clamp(1.75rem,5vw,2.25rem)] leading-none font-bold uppercase"
        >
          Practice review
        </h2>
        <ReviewSample
          n={14}
          prompt="Sample question: which suffix means inflammation?"
        >
          <AskTeacher testId={T} questionId={`${Q}1`} flag={null} />
        </ReviewSample>
        <ReviewSample n={15} prompt="Sample question: the prefix brady- means">
          <AskTeacher
            testId={T}
            questionId={`${Q}2`}
            flag={{
              id: "00000000-0000-4000-8000-00000000a001",
              note: "Sample note: the key says fast.",
              status: "open",
              reply: "",
              reason: "wrong_answer",
            }}
          />
        </ReviewSample>
        <ReviewSample
          n={16}
          prompt="Sample question: convert 5 ml to teaspoons"
        >
          <AskTeacher
            testId={T}
            questionId={`${Q}3`}
            flag={{
              id: "00000000-0000-4000-8000-00000000a002",
              note: "",
              status: "answered",
              reply: "Sample reply: fixed, thanks. The answer is 1 teaspoon.",
              reason: "typo",
            }}
          />
        </ReviewSample>
      </section>
    </div>
  );
}

function ReviewSample({
  n,
  prompt,
  children,
}: {
  n: number;
  prompt: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3">
      <p className="caps num text-[15px] text-ink-2">Q{n}</p>
      <p className="text-[17px]">{prompt}</p>
      {children}
    </div>
  );
}
