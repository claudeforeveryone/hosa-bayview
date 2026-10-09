import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { PageTitle } from "@/components/page-title";
import { SocialLinks } from "@/components/social-links";
import { filterMembers, formatCount } from "@/lib/activity";
import { getDirectory, getMemberDetails } from "@/lib/activity-data";
import { requireProfile, type Role } from "@/lib/auth";
import { GRADES, filterByGrade, gradeLabel, parseGrade } from "@/lib/profile";

export const metadata: Metadata = { title: "Members" };

const ROLE_LABEL = {
  executive: "Executive",
  trainer: "Trainer",
  trainee: "Trainee",
} satisfies Record<Role, string>;

export default async function MembersPage(props: PageProps<"/members">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const grade = parseGrade(sp.grade);
  const [me, all, details] = await Promise.all([
    requireProfile(),
    getDirectory(),
    getMemberDetails(),
  ]);
  const withDetails = all.map((m) => ({
    ...m,
    grade: details.get(m.user_id)?.grade ?? null,
    avatar_url: details.get(m.user_id)?.avatar_url ?? null,
  }));
  const rows = filterByGrade(filterMembers(withDetails, q), grade);
  // Keeps the search while switching grade, and the other way round.
  const hrefFor = (g: number | null) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (g) params.set("grade", String(g));
    const text = params.toString();
    return text ? `/members?${text}` : "/members";
  };

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <PageTitle meta={`${formatCount(all.length)} in HOSA Bayview`}>
          Members
        </PageTitle>
        <SocialLinks />
      </div>
      <form role="search" method="get" action="/members" className="flex gap-3">
        <label htmlFor="member-search" className="sr-only">
          Search by name
        </label>
        {grade ? <input type="hidden" name="grade" value={grade} /> : null}
        <input
          id="member-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search by name"
          className="step h-12 min-w-0 flex-1 border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink"
        />
        <button
          type="submit"
          className="caps step h-12 shrink-0 bg-ink px-5 text-[17px] text-ground hover:bg-field"
        >
          Search
        </button>
      </form>
      <nav aria-label="Grade">
        <ul className="flex flex-wrap gap-2">
          {[null, ...GRADES].map((g) => {
            const on = g === grade;
            return (
              <li key={g ?? "all"}>
                <Link
                  href={hrefFor(g)}
                  aria-current={on ? "true" : undefined}
                  className={`caps step inline-flex h-11 items-center border px-3.5 text-[16px] ${
                    on
                      ? "border-ink bg-ink text-ground"
                      : "border-rule-strong text-ink hover:bg-band"
                  }`}
                >
                  {g ? `Grade ${g}` : "All grades"}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {rows.length ? (
        <ul className="border-t border-rule">
          {rows.map((member) => (
            <li key={member.user_id} className="border-b border-rule">
              <Link
                href={`/members/${member.user_id}`}
                className="step flex items-center justify-between gap-4 px-1 py-3 hover:bg-band sm:px-3"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar
                    name={member.full_name || "Member"}
                    src={member.avatar_url}
                    size="sm"
                  />
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-semibold uppercase">
                      {member.full_name || "Member"}
                    </span>
                    {member.user_id === me.id ? (
                      <span className="caps shrink-0 bg-you px-1.5 py-0.5 text-[13px] leading-none text-on-you">
                        You
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="grid shrink-0 justify-items-end gap-0.5">
                  <span className="caps text-[15px] text-ink-2">
                    {ROLE_LABEL[member.role]}
                  </span>
                  {member.grade ? (
                    <span className="num text-[15px] text-ink-2">
                      {gradeLabel(member.grade)}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={q || grade ? "No one matches" : "No members yet"} />
      )}
    </div>
  );
}
