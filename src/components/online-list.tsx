import Link from "next/link";
import { formatCount, type OnlineRow } from "@/lib/activity";

// Who's online now. Your own row gets the maroon tag; everyone else links to their profile.
export function OnlineList({ rows, meId }: { rows: OnlineRow[]; meId: string }) {
  return (
    <div className="grid gap-4">
      <p className="caps text-[17px] text-ink-2">{formatCount(rows.length)} online now</p>
      <ul className="border-t border-rule">
        {rows.map((row) => {
          const you = row.user_id === meId;
          return (
            <li key={row.user_id} className="flex items-baseline justify-between gap-4 border-b border-rule px-1 py-3 sm:px-3">
              <span className="flex min-w-0 items-baseline gap-2">
                <Link
                  href={`/members/${row.user_id}`}
                  className="step truncate font-display text-[clamp(1.4rem,5vw,1.9rem)] leading-tight font-semibold uppercase hover:underline"
                >
                  {row.full_name || "Member"}
                </Link>
                {you ? <span className="caps shrink-0 bg-you px-1.5 py-0.5 text-[13px] leading-none text-on-you">You</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
