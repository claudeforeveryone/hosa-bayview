import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  Medal,
  Megaphone,
  MessageSquareReply,
  MessageCircleQuestion,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { PushHint } from "@/components/pwa/push-hint";
import { pushConfig } from "@/lib/push/config";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/when";
import { MarkRead } from "./mark-read";

export const metadata: Metadata = { title: "Notifications" };

type Row = {
  id: string;
  kind:
    | "announcement"
    | "test"
    | "reply"
    | "event"
    | "competition"
    | "role"
    | "question";
  title: string;
  body: string;
  link: string;
  created_at: string;
  read_at: string | null;
};

const KIND: Record<Row["kind"], { Icon: LucideIcon; label: string }> = {
  announcement: { Icon: Megaphone, label: "Announcement" },
  test: { Icon: ClipboardList, label: "New test" },
  reply: { Icon: MessageSquareReply, label: "Reply" },
  question: { Icon: MessageCircleQuestion, label: "Ask teacher" },
  event: { Icon: CalendarDays, label: "Calendar" },
  competition: { Icon: Medal, label: "BLC" },
  role: { Icon: ShieldCheck, label: "Your role" },
};

// Links are written by the database: one leading slash, no backslashes (browsers read "/\host" as another site).
const safeLink = (l: string) => (/^\/(?![/\\])[^\\]*$/.test(l) ? l : "/");

function Item({ n, now }: { n: Row; now: number }) {
  const { Icon, label } = KIND[n.kind] ?? KIND.announcement;
  const fresh = !n.read_at;
  return (
    <li className="border-b border-rule">
      <Link
        href={safeLink(n.link)}
        className="step grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-1 py-4 hover:bg-band sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:px-3"
      >
        <Icon
          size={22}
          strokeWidth={1.75}
          aria-hidden
          className={`mt-0.5 ${fresh ? "text-you" : "text-ink-2"}`}
        />
        <span className="min-w-0">
          <span className="caps flex items-center gap-2 text-[13px] text-ink-2">
            {fresh ? (
              <span
                className="inline-block size-2 shrink-0 bg-you"
                aria-label="New"
                role="img"
              />
            ) : null}
            {label}
            <span className="num sm:hidden">
              · {timeAgo(n.created_at, now)}
            </span>
          </span>
          <span
            className={`block text-[18px] leading-snug ${fresh ? "font-semibold" : "font-medium"}`}
          >
            {n.title}
          </span>
          {n.body ? (
            <span className="line-clamp-2 block text-[16px] text-ink-2">
              {n.body}
            </span>
          ) : null}
        </span>
        <span className="num caps hidden pt-0.5 text-[14px] text-ink-2 sm:block">
          {timeAgo(n.created_at, now)}
        </span>
      </Link>
    </li>
  );
}

export default async function NotificationsPage() {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Notifications lookup failed: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const fresh = rows.filter((r) => !r.read_at);
  const earlier = rows.filter((r) => r.read_at);
  // eslint-disable-next-line react-hooks/purity -- server render time, once per request
  const now = Date.now();

  return (
    <div className="grid grid-cols-1 gap-10">
      <PageTitle
        meta={fresh.length ? `${fresh.length} new` : "You're all caught up"}
      >
        Notifications
      </PageTitle>
      <MarkRead unread={fresh.length} />
      <PushHint vapidPublicKey={pushConfig()?.publicKey ?? null} />
      {rows.length ? (
        <>
          {fresh.length ? (
            <section aria-labelledby="new-h" className="grid gap-3">
              <h2
                id="new-h"
                className="caps border-b-[3px] border-ink pb-2 text-[16px]"
              >
                New
              </h2>
              <ul>
                {fresh.map((n) => (
                  <Item key={n.id} n={n} now={now} />
                ))}
              </ul>
            </section>
          ) : null}
          {earlier.length ? (
            <section aria-labelledby="earlier-h" className="grid gap-3">
              <h2
                id="earlier-h"
                className="caps border-b-[3px] border-ink pb-2 text-[16px]"
              >
                Earlier
              </h2>
              <ul>
                {earlier.map((n) => (
                  <Item key={n.id} n={n} now={now} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <div className="grid justify-items-start gap-3 border-2 border-ink bg-band px-5 py-8">
          <p className="font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-semibold uppercase">
            Nothing yet
          </p>
          <p className="max-w-[60ch] text-[17px] text-ink-2">
            New tests, announcements, events, BLC runs and trainer replies land
            here.
          </p>
        </div>
      )}
    </div>
  );
}
