"use client";

import { useCallback, useState } from "react";
import { Avatar } from "@/components/avatar";
import { banStatus, banWhen } from "@/lib/moderation";
import { gradeLabel } from "@/lib/profile";
import { PersonDialog, type PersonRow, type WarningRow } from "./person-dialog";
import { roleLabel } from "@/lib/role-label";

// Scannable list on a phone: picture, name, role and grade, then one Manage button. Everything else lives in the panel.
export function PeopleList({
  people,
  warnings,
  meId,
  isDemo,
}: {
  people: PersonRow[];
  warnings: Record<string, WarningRow[]>;
  meId: string;
  isDemo: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? (people.find((p) => p.id === openId) ?? null) : null;
  const close = useCallback(() => setOpenId(null), []);
  // After a removal the row is gone, so send focus to the list heading rather than letting it drop to the page.
  const removed = useCallback(() => {
    setOpenId(null);
    requestAnimationFrame(() => document.getElementById("people-h")?.focus());
  }, []);

  return (
    <>
      <ul className="border-t border-rule">
        {people.map((p) => {
          const ban = banStatus(p.banned_until, new Date());
          const count = warnings[p.id]?.length ?? 0;
          return (
            <li
              key={p.id}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 border-b border-rule px-1 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-3"
            >
              <Avatar name={p.full_name} src={p.avatar_src} size="sm" />
              <div className="min-w-0">
                <p className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-17 font-medium">
                    {p.full_name}
                  </span>
                  {p.id === meId ? (
                    <span className="caps shrink-0 bg-you px-1.5 py-0.5 text-12 text-on-you">
                      You
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-15 text-ink-2">
                  {isDemo ? null : <>{p.email} · </>}
                  {roleLabel(p.role, p.title, true)} · {gradeLabel(p.grade)}
                </p>
                {ban.banned || count ? (
                  <p className="caps text-14">
                    {ban.banned ? <span>Banned {banWhen(ban)}</span> : null}
                    {ban.banned && count ? <span aria-hidden> · </span> : null}
                    {count ? (
                      <span>
                        {count === 1 ? "1 warning" : `${count} warnings`}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              {isDemo ? null : (
                <button
                  type="button"
                  onClick={() => setOpenId(p.id)}
                  className="caps step col-span-2 h-11 justify-self-start border border-ink px-4 text-15 hover:bg-band sm:col-span-1 sm:justify-self-end"
                >
                  Manage
                  <span className="sr-only"> {p.full_name}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <PersonDialog
        person={open}
        warnings={open ? (warnings[open.id] ?? []) : []}
        meId={meId}
        onClose={close}
        onRemoved={removed}
      />
    </>
  );
}
