import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StartTest } from "@/components/start-test";
import { requireProfile } from "@/lib/auth";
import { uuid } from "@/lib/classrooms";
import {
  type CompetitionState,
  competitionState,
  groupByTest,
  myTestStatus,
  percentOf,
  stateLabel,
  windowLine,
} from "@/lib/competitions";
import { formNumber } from "@/lib/join-code";
import { createClient } from "@/lib/supabase/server";
import { attemptsLeft } from "@/lib/test-settings";
import {
  type TestSummary,
  countAttempts,
  getClassroomTests,
  getTest,
} from "@/lib/tests";
import { formatWhen, isoToToronto } from "@/lib/when";
import { updateCompetitionWindow } from "../actions";
import { WindowForm } from "../forms";

type Detail = {
  id: string;
  num: number;
  name: string;
  event: string;
  description: string;
  opens_at: string | null;
  closes_at: string | null;
};

type Result = {
  test_id: string;
  test_title: string;
  user_id: string;
  full_name: string;
  score: number;
  total: number;
  place: number;
  submitted_at: string;
};

// Cached per request so generateMetadata and the page share one lookup. Null for bad ids and non-competitions.
const loadCompetition = cache(async (raw: string): Promise<Detail | null> => {
  if (!uuid.safeParse(raw).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, num, name, event, description, opens_at, closes_at")
    .eq("id", raw)
    .eq("kind", "competition")
    .maybeSingle();
  if (error) throw new Error(`Competition lookup failed: ${error.message}`);
  return (data as Detail | null) ?? null;
});

export async function generateMetadata({
  params,
}: PageProps<"/blc/[id]">): Promise<Metadata> {
  const comp = await loadCompetition((await params).id);
  return { title: comp?.name ?? "Mock competition" };
}

export default async function CompetitionPage({
  params,
}: PageProps<"/blc/[id]">) {
  const { id } = await params;
  const [profile, comp] = await Promise.all([
    requireProfile(),
    loadCompetition(id),
  ]);
  if (!comp) notFound();

  const isExec = profile.role === "executive";
  const state: CompetitionState = competitionState(
    comp.opens_at,
    comp.closes_at,
  );
  const supabase = await createClient();

  // Members don't get the test list while it's upcoming: titles and counts would give the run away.
  const tests =
    state === "upcoming" && !isExec ? [] : await getClassroomTests(comp.id);
  const rows = await Promise.all(
    tests.map(async (t: TestSummary) => {
      const status = myTestStatus({
        state,
        attempts: t.my_attempts,
        best: t.my_best,
        bestTotal: t.my_best_total,
      });
      // Open runs are timed only, so the attempts left come from timed runs.
      let left: number | null = null;
      if (state === "open" && t.time_limit_minutes) {
        const test = await getTest(t.id);
        if (test)
          left = attemptsLeft(
            test.attempts_allowed,
            await countAttempts(t.id, profile.id, "timed"),
          );
      }
      return { t, status, left };
    }),
  );

  const showResults = state === "closed" || isExec;
  let results: Result[] = [];
  if (showResults) {
    const { data, error } = await supabase.rpc("competition_results", {
      cid: comp.id,
    });
    if (error) throw new Error(`Results lookup failed: ${error.message}`);
    results = (data ?? []) as Result[];
  }
  const grouped = groupByTest(results);

  const subtitle = [
    stateLabel(state),
    comp.event && comp.event.toLowerCase() !== comp.name.toLowerCase()
      ? comp.event
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid grid-cols-1 gap-12">
      <header className="-mx-4 -mt-6 grid gap-5 bg-field px-4 py-7 text-on-field sm:mx-0 sm:mt-0 sm:px-8 lg:px-10 lg:py-10">
        <div className="flex items-start justify-between gap-4">
          <h1 className="min-w-0 font-display text-[clamp(2.75rem,10vw,5.5rem)] leading-[0.92] font-bold [overflow-wrap:anywhere] uppercase">
            {comp.name}
          </h1>
          <span className="num caps shrink-0 pt-2 text-15 text-on-field-2">
            {formNumber("C", comp.num)}
          </span>
        </div>
        <p className="caps text-17 text-on-field-2">{subtitle}</p>
        <p className="text-17 text-on-field-2">
          {windowLine(comp.opens_at, comp.closes_at)}
        </p>
        {comp.description ? (
          <p className="max-w-[65ch] whitespace-pre-line">{comp.description}</p>
        ) : null}
      </header>

      <section aria-labelledby="tests-h" className="grid gap-4">
        <h2
          id="tests-h"
          className="font-display text-28 leading-none font-bold uppercase"
        >
          Tests
        </h2>
        {state === "upcoming" && !isExec ? (
          <EmptyState title="Tests unlock when it opens">
            {comp.opens_at ? formatWhen(comp.opens_at) : null}
          </EmptyState>
        ) : rows.length ? (
          <ul className="border-t border-rule">
            {rows.map(({ t, status, left }) => (
              <li
                key={t.id}
                className="grid gap-3 border-b border-rule px-1 py-4 sm:px-3"
              >
                <Link
                  href={`/c/${comp.id}/tests/${t.id}`}
                  className="step group flex items-center justify-between gap-4 hover:bg-band"
                >
                  <span className="min-w-0">
                    <span className="block font-display text-[clamp(1.5rem,5vw,2rem)] leading-[1.05] font-semibold uppercase [overflow-wrap:anywhere]">
                      {t.title}
                    </span>
                    <span className="num caps block text-15 text-ink-2">
                      {[
                        `${t.question_count} question${t.question_count === 1 ? "" : "s"}`,
                        t.time_limit_minutes
                          ? `${t.time_limit_minutes} min`
                          : null,
                        isExec && !t.is_published ? "Draft" : null,
                        status,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <ChevronRight
                    size={22}
                    strokeWidth={1.75}
                    aria-hidden
                    className="shrink-0 text-ink-2"
                  />
                </Link>
                {state === "open" && t.time_limit_minutes && t.is_published ? (
                  <StartTest
                    classroomId={comp.id}
                    testId={t.id}
                    timeLimit={t.time_limit_minutes}
                    hasQuestions={t.question_count > 0}
                    allowPractice={false}
                    attemptsLeft={left}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No tests posted yet">
            {isExec
              ? "Add one to this competition from Manage tests below."
              : "Check back, the first test is on its way."}
          </EmptyState>
        )}
      </section>

      {showResults ? (
        <section aria-labelledby="results-h" className="grid gap-5">
          <div className="grid gap-2">
            <h2
              id="results-h"
              className="font-display text-28 leading-none font-bold uppercase"
            >
              Results
            </h2>
            {state !== "closed" ? (
              <p className="caps text-15 text-ink-2">
                Live results, only you can see this
              </p>
            ) : null}
          </div>
          {grouped.length ? (
            grouped.map((g) => (
              <div key={g.testId} className="grid gap-2">
                <h3 className="font-display text-22 leading-none font-semibold uppercase">
                  {g.title}
                </h3>
                <ol className="border-t border-rule">
                  {g.rows.map((r) => {
                    const you = r.user_id === profile.id;
                    const pct = percentOf(r.score, r.total);
                    return (
                      <li
                        key={r.user_id}
                        className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-rule px-1 py-2.5 sm:px-3 ${you ? "bg-band" : ""}`}
                      >
                        <span className="num font-display text-20 font-semibold text-ink-2">
                          {r.place}
                        </span>
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Link
                            href={`/members/${r.user_id}`}
                            className="step -my-1.5 min-w-0 truncate py-1.5 font-display text-18 leading-tight font-semibold uppercase hover:underline sm:text-20"
                          >
                            {r.full_name || "Member"}
                          </Link>
                          {you ? (
                            <span className="caps shrink-0 bg-you px-1.5 py-0.5 text-13 leading-none text-on-you">
                              You
                            </span>
                          ) : null}
                        </span>
                        <span className="num text-right">
                          <span className="block font-display text-22 leading-none font-bold">
                            {r.score}/{r.total}
                          </span>
                          {pct === null ? null : (
                            <span className="block text-15 text-ink-2">
                              {pct}%
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))
          ) : (
            <EmptyState title="No timed runs yet" mark={false} />
          )}
        </section>
      ) : null}

      {isExec ? (
        <section
          aria-labelledby="run-h"
          className="grid gap-6 border-t border-rule pt-8"
        >
          <h2
            id="run-h"
            className="font-display text-28 leading-none font-bold uppercase"
          >
            Run it
          </h2>
          <Link
            href={`/c/${comp.id}/tests`}
            className="caps step inline-flex h-12 w-fit items-center gap-2 border border-ink px-5 text-17 hover:bg-band"
          >
            Manage tests
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden />
          </Link>
          <details className="group border-y border-rule">
            <summary className="caps step flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-18 hover:bg-band [&::-webkit-details-marker]:hidden">
              Edit times
              <ChevronDown
                size={22}
                strokeWidth={1.75}
                aria-hidden
                className="shrink-0 group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
              />
            </summary>
            <div className="pt-2 pb-8">
              <WindowForm
                action={updateCompetitionWindow.bind(null, comp.id)}
                initialOpens={isoToToronto(comp.opens_at)}
                initialCloses={isoToToronto(comp.closes_at)}
              />
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
