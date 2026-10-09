"use client";

import { useId, useMemo, useState } from "react";
import type { MemberRow } from "./queries";

// Filters the already-sorted member list by name. Each row stacks on phones and never overflows the page.
export function MemberSearch({ members }: { members: MemberRow[] }) {
  const [q, setQ] = useState("");
  const id = useId();
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? members.filter((m) => m.name.toLowerCase().includes(needle))
      : members;
  }, [members, q]);

  return (
    <div className="grid gap-4">
      <label htmlFor={id} className="text-[15px] font-medium">
        Search members
      </label>
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name"
        className="step h-12 w-full max-w-md border border-rule-strong bg-transparent px-3 text-[17px] outline-none focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
      />
      {shown.length === 0 ? (
        <p className="text-[17px] text-ink-2">No one matches “{q.trim()}”.</p>
      ) : (
        <ul className="border-t border-rule">
          {shown.map((m) => (
            <li
              key={m.user_id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-rule px-1 py-3 sm:px-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-[17px] font-medium">
                  {m.name}
                </span>
                {m.flag ? (
                  <span className="caps text-[13px] text-ink-2">
                    {m.flag === "perfect" ? "Perfect" : "Check in"}
                  </span>
                ) : null}
              </span>
              <span className="num text-right text-[16px] text-ink-2">
                {m.attended} of {m.counted} weeks
                {m.rate === null ? null : (
                  <span className="font-semibold text-ink"> · {m.rate}%</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
