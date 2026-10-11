import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AskTeacher } from "@/components/ask-teacher";
import { ClassroomFlagsPanel, TestFlagsSection } from "@/components/flag-list";
import { BottomNav, Sidebar } from "@/components/nav";
import { AuditForExecutives, AuditSection } from "@/components/owner/audit";
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
  classroomFlagsFixture,
  contentFixture,
  engagementFixture,
  feedbackAfterMoveFixture,
  feedbackFixtureFor,
  growth7Fixture,
  growth90Fixture,
  growthAllFixture,
  growthFixture,
  membersFixture,
  overviewFixture,
  smallEngagementFixture,
  smallGrowth7Fixture,
  smallGrowth90Fixture,
  smallGrowthAllFixture,
  smallGrowthFixture,
  smallOverviewFixture,
  systemFixture,
  trainerTestFixture,
} from "@/lib/owner-fixtures";
import {
  FEEDBACK_DESCRIPTION,
  parseFeedbackFilter,
  parseRange,
  parseTab,
  type Range,
} from "@/lib/owner-metrics";
import type { ContentData, GrowthData } from "@/lib/owner-types";

// Dev server only: the owner console, the two student entry points with the trainer's side of reports (?view=entry),
// and the owner's navigation (?view=nav), filled with made-up data, for screenshots and design review. ?scale=small swaps in a chapter the size of today's (13 members, all new this month, a few
// quiet days), so the mostly-Under-5 first look gets reviewed too. The .dev.tsx extension is a page only under `next dev` (next.config.ts), so production builds
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
  const views = [
    { view: undefined, href: BASE, label: "Owner console" },
    { view: "entry", href: `${BASE}?view=entry`, label: "Entry points" },
    { view: "nav", href: `${BASE}?view=nav`, label: "Owner's navigation" },
  ].filter((v) => v.view !== sp.view);
  const banner = (
    <Notice>
      {FIXTURE_MARKER}: made-up data on the dev server.{" "}
      {views.map((v, i) => (
        <span key={v.href}>
          {i ? " · " : null}
          <Link href={v.href} className="underline underline-offset-4">
            {v.label}
          </Link>
        </span>
      ))}
    </Notice>
  );
  if (sp.view === "entry") return <EntryPoints banner={banner} />;
  if (sp.view === "nav") return <OwnerNav banner={banner} />;

  const tab = parseTab(sp.tab);
  const extra: Record<string, string> | undefined =
    sp.scale === "small" ? { scale: "small" } : undefined;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {banner}
      <OwnerConsole base={BASE} tab={tab} extra={extra}>
        {section(tab, sp, extra)}
      </OwnerConsole>
    </div>
  );
}

function section(
  tab: ReturnType<typeof parseTab>,
  sp: Search,
  extra: Record<string, string> | undefined,
) {
  const small = extra?.scale === "small";
  switch (tab) {
    case "overview":
      return (
        <OverviewSection
          data={small ? smallOverviewFixture : overviewFixture}
        />
      );
    case "growth": {
      const range = parseRange(sp.range);
      return (
        <GrowthSection
          base={BASE}
          range={range}
          data={growthFor(range, small)}
          extra={extra}
        />
      );
    }
    case "engagement":
      return (
        <EngagementSection
          base={BASE}
          range={parseRange(sp.range)}
          data={small ? smallEngagementFixture : engagementFixture}
          extra={extra}
        />
      );
    case "content":
      // ?wording=none: what a stats viewer who isn't an executive gets (0232 sends no question wording).
      return (
        <ContentSection
          data={
            sp.wording === "none"
              ? withoutWording(contentFixture)
              : contentFixture
          }
        />
      );
    case "feedback": {
      // ?status filters the rows as owner_feedback does; ?scale=small is an empty queue (the nothing-here notes);
      // ?moved=1 is Open just after an item was set to Done (the note left in its place).
      const filter = parseFeedbackFilter(sp.status);
      const after =
        sp.moved === "1" && filter === "open" && !small
          ? feedbackAfterMoveFixture()
          : null;
      return (
        <FeedbackSection
          base={BASE}
          filter={filter}
          page={0}
          queue={after ? after.queue : feedbackFixtureFor(filter, small)}
          moved={after?.moved}
          extra={extra}
          readOnly
        />
      );
    }
    case "members":
      return (
        <MembersSection
          base={BASE}
          period={parsePeriod(sp.period)}
          rows={membersFixture}
          battles={false}
          extra={extra}
        />
      );
    case "audit":
      // ?viewer=member: what a stats viewer who isn't an executive gets (owner_audit refuses them, 0232).
      return sp.viewer === "member" ? (
        <AuditForExecutives />
      ) : (
        <AuditSection
          base={BASE}
          q=""
          page={0}
          rows={auditFixture}
          hasMore={false}
          extra={extra}
        />
      );
    case "system":
      return (
        <SystemSection
          info={{
            deployment: {
              commit: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
              branch: "main",
              environment: "production",
              repo: "sample-owner/sample-repo",
            },
            db: "up",
            latencyMs: 42,
            data: systemFixture,
          }}
        />
      );
  }
}

// The range picker works here too: days for 7 and 30, Monday-to-Sunday weeks for 90 days and all time, for the
// chapter on screen (owner-fixtures.test.ts keeps each chapter's ranges and overview in agreement).
function growthFor(range: Range, small: boolean): GrowthData {
  if (range === "7d") return small ? smallGrowth7Fixture : growth7Fixture;
  if (range === "30d") return small ? smallGrowthFixture : growthFixture;
  if (range === "90d") return small ? smallGrowth90Fixture : growth90Fixture;
  return small ? smallGrowthAllFixture : growthAllFixture;
}

function withoutWording(data: ContentData): ContentData {
  return {
    ...data,
    reported: data.reported.map((r) => ({ ...r, prompt: null })),
    duplicates: data.duplicates.map((d) => ({
      ...d,
      stem: null,
      example: null,
    })),
  };
}

const Q = "00000000-0000-4000-8000-00000000e00";
const T = "00000000-0000-4000-8000-00000000d001";

// Settings > Account > Send feedback, and Report this question under a reviewed answer, as members see them; then
// where the reports land: the trainer's list on the test page and the classroom hub (replies switched off here).
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
        description={FEEDBACK_DESCRIPTION}
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
          <AskTeacher testId={T} questionId={`${Q}1`} flag={null} canReport />
        </ReviewSample>
        <ReviewSample n={15} prompt="Sample question: the prefix brady- means">
          <AskTeacher
            canReport
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
            canReport
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
        {/* A plain question the trainer answered: asking again stays closed, a report can still reopen it. */}
        <ReviewSample n={17} prompt="Sample question: the suffix -ectomy means">
          <AskTeacher
            canReport
            testId={T}
            questionId={`${Q}4`}
            flag={{
              id: "00000000-0000-4000-8000-00000000a003",
              note: "Sample note: why not C?",
              status: "answered",
              reply:
                "Sample reply: C is -otomy, cutting into. -ectomy is removal.",
              reason: "ask",
            }}
          />
        </ReviewSample>
        {/* Reported after that reply: the reply stays on the thread until the trainer answers again. */}
        <ReviewSample n={18} prompt="Sample question: tachy- means">
          <AskTeacher
            canReport
            testId={T}
            questionId={`${Q}5`}
            flag={{
              id: "00000000-0000-4000-8000-00000000a004",
              note: "Sample note: the key says slow.",
              status: "open",
              reply: "Sample reply: tachy- is fast, as in tachycardia.",
              reason: "wrong_answer",
            }}
          />
        </ReviewSample>
      </section>
      <section
        aria-labelledby="trainer-h"
        className="grid gap-8 border-t-[3px] border-ink pt-5"
      >
        <h2
          id="trainer-h"
          className="font-display text-[clamp(1.75rem,5vw,2.25rem)] leading-none font-bold uppercase"
        >
          Trainer&rsquo;s side
        </h2>
        <p className="caps num text-15 text-ink-2">
          Test page · {trainerTestFixture.title}
        </p>
        <TestFlagsSection
          testId={trainerTestFixture.testId}
          flags={trainerTestFixture.flags}
          readOnly
        />
        <p className="caps num text-15 text-ink-2">Classroom hub</p>
        <ClassroomFlagsPanel
          classroomId={trainerTestFixture.classroomId}
          flags={classroomFlagsFixture}
          open
          readOnly
        />
      </section>
    </div>
  );
}

// The owner's navigation: an executive on the stats list, with Send feedback on the database. The real sidebar
// (desktop) and the real phone bar, whose More sheet lists Developer and Send feedback; the layout's own bar is the
// signed-in account's, so this one sits above it. /more reads the same two checks on the server.
function OwnerNav({ banner }: { banner: ReactNode }) {
  const owner = {
    isExec: true,
    canSeeStats: true,
    canSendFeedback: true,
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      {banner}
      <PageTitle meta="An executive on the stats list, with Send feedback on">
        Owner&rsquo;s navigation
      </PageTitle>
      <p className="text-17 text-ink-2 lg:hidden">
        Tap More on the bar below for the sheet.
      </p>
      {/* Full height here, so the whole panel (More group included) shows without the sidebar's own scroll. */}
      <div className="hidden w-[18rem] lg:block [&>aside]:static [&>aside]:h-auto">
        <Sidebar
          {...owner}
          canTeach
          rooms={[
            { id: `${SAMPLE_ROOM}01`, num: 1, name: "Sample Event Alpha" },
            { id: `${SAMPLE_ROOM}02`, num: 2, name: "Sample Event Bravo" },
          ]}
          unread={0}
        />
      </div>
      <div className="relative z-50 lg:hidden">
        <BottomNav {...owner} />
      </div>
    </div>
  );
}

const SAMPLE_ROOM = "00000000-0000-4000-8000-00000000f0";

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
      <p className="caps num text-15 text-ink-2">Q{n}</p>
      <p className="text-17">{prompt}</p>
      {children}
    </div>
  );
}
