import Link from "next/link";
import type { ReactNode } from "react";
import { ConfirmAction } from "@/components/confirm-action";
import { deleteMaterial } from "@/app/(app)/library/actions";
import { formNumber } from "@/lib/join-code";
import { createClient } from "@/lib/supabase/server";
import { formatWhen, timeAgo } from "@/lib/when";
import { adminDelete } from "./content-actions";
import { BLC_ENABLED } from "@/lib/features";

const heading =
  "font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase";

type LogRow = {
  id: number;
  actor_name: string;
  action: string;
  target_name: string;
  detail: string;
  created_at: string;
};

const VERB: Record<string, string> = {
  role: "changed the role of",
  banned: "banned",
  unbanned: "unbanned",
  title: "set the title of",
  warned: "warned",
  removed: "removed",
  passcode: "changed the admin passcode",
};

// Who did what to whom: roles, bans, titles, warnings, removals, passcode changes. Filled by triggers.
export async function AdminLog({ now }: { now: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_log")
    .select("id, actor_name, action, target_name, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Admin log lookup failed: ${error.message}`);
  const rows = (data ?? []) as LogRow[];

  return (
    <section aria-labelledby="log-h" className="grid gap-4">
      <h2 id="log-h" className={heading}>
        Admin log
      </h2>
      {rows.length ? (
        <ol className="max-h-[32rem] overflow-y-auto border-y border-rule">
          {rows.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-rule px-1 py-3 last:border-b-0 sm:px-3"
            >
              <p className="min-w-0 text-[16px]">
                <span className="font-semibold">
                  {r.actor_name || "System"}
                </span>{" "}
                {VERB[r.action] ?? r.action}
                {r.target_name ? (
                  <>
                    {" "}
                    <span className="font-semibold">{r.target_name}</span>
                  </>
                ) : null}
                {r.detail && r.action !== "passcode" ? (
                  <span className="block truncate text-[15px] text-ink-2">
                    {r.detail}
                  </span>
                ) : null}
              </p>
              <time
                dateTime={r.created_at}
                title={formatWhen(r.created_at)}
                className="num caps pt-0.5 text-[14px] whitespace-nowrap text-ink-2"
              >
                {timeAgo(r.created_at, now)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="border-y border-dashed border-rule-strong px-1 py-6 text-[17px] text-ink-2 sm:px-3">
          Nothing logged yet. Role changes, bans, titles, warnings and passcode
          changes show up here.
        </p>
      )}
    </section>
  );
}

// One collapsible list with a count in its summary; rows carry a delete.
function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <details className="group border-b border-rule">
      <summary className="step flex h-14 cursor-pointer items-center justify-between px-1 hover:bg-band sm:px-3">
        <span className="caps text-[18px]">{title}</span>
        <span className="num caps text-[16px] text-ink-2">{count}</span>
      </summary>
      {count ? (
        <ul className="border-t border-rule pb-4">{children}</ul>
      ) : (
        <p className="px-1 pb-5 text-[16px] text-ink-2 sm:px-3">None yet.</p>
      )}
    </details>
  );
}

function Row({
  href,
  title,
  meta,
  del,
}: {
  href: string | null;
  title: string;
  meta: string;
  del: ReactNode;
}) {
  return (
    <li className="grid gap-3 border-b border-rule px-1 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3">
      <span className="min-w-0">
        {href ? (
          <Link
            href={href}
            className="block truncate text-[17px] font-semibold underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
          >
            {title}
          </Link>
        ) : (
          <span className="block truncate text-[17px] font-semibold">
            {title}
          </span>
        )}
        <span className="block truncate text-[15px] text-ink-2">{meta}</span>
      </span>
      {del}
    </li>
  );
}

type Room = {
  id: string;
  num: number;
  name: string;
  kind: string;
  owner: { full_name: string } | null;
};
type Test = {
  id: string;
  num: number;
  title: string;
  classroom_id: string;
  room: { name: string } | null;
};
type Deck = {
  id: string;
  num: number;
  title: string;
  owner: { full_name: string } | null;
  room: { name: string } | null;
};
type Material = {
  id: string;
  title: string;
  url: string | null;
  file_name: string | null;
  room: { name: string } | null;
};

// Everything made in the app, for clean-up. Executives see it all through RLS.
export async function ContentLists() {
  const supabase = await createClient();
  const [rooms, tests, decks, materials] = await Promise.all([
    supabase
      .from("classrooms")
      .select(
        "id, num, name, kind, owner:profiles!classrooms_owner_id_fkey(full_name)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("tests")
      .select(
        "id, num, title, classroom_id, room:classrooms!tests_classroom_id_fkey(name)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("decks")
      .select(
        "id, num, title, owner:profiles!decks_owner_id_fkey(full_name), room:classrooms!decks_classroom_id_fkey(name)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("materials")
      .select(
        "id, title, url, file_name, room:classrooms!materials_classroom_id_fkey(name)",
      )
      .order("created_at", { ascending: false }),
  ]);
  const failed = rooms.error ?? tests.error ?? decks.error ?? materials.error;
  if (failed) throw new Error(`Content lookup failed: ${failed.message}`);
  const R = (rooms.data ?? []) as unknown as Room[];
  const T = (tests.data ?? []) as unknown as Test[];
  const D = (decks.data ?? []) as unknown as Deck[];
  const M = (materials.data ?? []) as unknown as Material[];

  const del = (action: () => Promise<{ error?: string }>, what: string) => (
    <ConfirmAction
      action={action}
      label="Delete"
      confirmLabel="Delete"
      pendingLabel="Deleting"
      question={`Delete ${what}?`}
      compact
    />
  );

  return (
    <section aria-labelledby="content-h" className="grid gap-4">
      <h2 id="content-h" className={heading}>
        Content
      </h2>
      <div className="border-t border-rule">
        <Group title="Classrooms" count={R.length}>
          {R.map((r) => (
            <Row
              key={r.id}
              href={
                r.kind === "competition" && BLC_ENABLED
                  ? `/blc/${r.id}`
                  : `/c/${r.id}`
              }
              title={r.name}
              meta={[
                formNumber("C", r.num),
                r.kind === "competition" ? "Mock competition" : null,
                r.owner?.full_name,
              ]
                .filter(Boolean)
                .join(" · ")}
              del={del(
                adminDelete.bind(null, "classroom", r.id),
                `${r.name} and everything in it`,
              )}
            />
          ))}
        </Group>
        <Group title="Tests" count={T.length}>
          {T.map((t) => (
            <Row
              key={t.id}
              href={`/c/${t.classroom_id}/tests/${t.id}`}
              title={t.title}
              meta={[formNumber("T", t.num), t.room?.name]
                .filter(Boolean)
                .join(" · ")}
              del={del(adminDelete.bind(null, "test", t.id), t.title)}
            />
          ))}
        </Group>
        <Group title="Flashcard decks" count={D.length}>
          {D.map((d) => (
            <Row
              key={d.id}
              href={`/flashcards/${d.id}`}
              title={d.title}
              meta={[d.room?.name ?? "Private", d.owner?.full_name]
                .filter(Boolean)
                .join(" · ")}
              del={del(adminDelete.bind(null, "deck", d.id), d.title)}
            />
          ))}
        </Group>
        <Group title="Files and links" count={M.length}>
          {M.map((m) => (
            <Row
              key={m.id}
              href={null}
              title={m.title}
              meta={[m.room?.name ?? "Library", m.file_name ?? m.url]
                .filter(Boolean)
                .join(" · ")}
              del={del(deleteMaterial.bind(null, m.id), m.title)}
            />
          ))}
        </Group>
      </div>
    </section>
  );
}
