import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageTitle } from "@/components/page-title";
import { filterMembers, formatCount } from "@/lib/activity";
import { getDirectory } from "@/lib/activity-data";
import { requireProfile, type Role } from "@/lib/auth";

export const metadata: Metadata = { title: "Members" };

const ROLE_LABEL = { executive: "Executive", trainer: "Trainer", trainee: "Trainee" } satisfies Record<Role, string>;

export default async function MembersPage(props: PageProps<"/members">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const [me, all] = await Promise.all([requireProfile(), getDirectory()]);
  const rows = filterMembers(all, q);

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageTitle meta={`${formatCount(all.length)} in HOSA Bayview`}>Members</PageTitle>
      <form role="search" method="get" action="/members" className="flex gap-3">
        <label htmlFor="member-search" className="sr-only">
          Search by name
        </label>
        <input
          id="member-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search by name"
          className="step h-12 min-w-0 flex-1 border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink"
        />
        <button type="submit" className="caps step h-12 shrink-0 bg-ink px-5 text-[17px] text-ground hover:bg-field">
          Search
        </button>
      </form>
      {rows.length ? (
        <ul className="border-t border-rule">
          {rows.map((member) => (
            <li key={member.user_id} className="border-b border-rule">
              <Link
                href={`/members/${member.user_id}`}
                className="step flex items-baseline justify-between gap-4 px-1 py-4 hover:bg-band sm:px-3"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-semibold uppercase">
                    {member.full_name || "Member"}
                  </span>
                  {member.user_id === me.id ? (
                    <span className="caps shrink-0 bg-you px-1.5 py-0.5 text-[13px] leading-none text-on-you">You</span>
                  ) : null}
                </span>
                <span className="caps shrink-0 text-[15px] text-ink-2">{ROLE_LABEL[member.role]}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={q ? "No one matches" : "No members yet"} />
      )}
    </div>
  );
}
