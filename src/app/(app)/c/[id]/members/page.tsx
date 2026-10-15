import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { ConfirmAction } from "@/components/confirm-action";
import { getOnline } from "@/lib/activity-data";
import { requireProfile } from "@/lib/auth";
import { getClassroom, getRoster, getRunners, type Runner } from "@/lib/classrooms";
import { leaveClassroom, removeMember } from "../../actions";

const joined = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "America/Toronto" });

function OnlineTag() {
  return <span className="caps ml-3 border border-ok px-2 py-0.5 align-middle text-13 text-ok">Online</span>;
}

function YouTag() {
  return <span className="caps ml-3 bg-you px-2 py-0.5 align-middle text-13 text-on-you">You</span>;
}

export default async function MembersTab({ params }: PageProps<"/c/[id]/members">) {
  const { id } = await params;
  const [profile, room, roster, online, found] = await Promise.all([
    requireProfile(),
    getClassroom(id),
    getRoster(id),
    getOnline(id).catch(() => []),
    getRunners(id).catch(() => null),
  ]);
  if (!room) notFound();
  const here = new Set(online.map((o) => o.user_id));
  // The leads (0291), or the owner alone on a database without them. A lead who also joined with the code is
  // listed once, at the top.
  const runners: Runner[] =
    found ??
    (room.owner_id && room.owner_name
      ? [{ user_id: room.owner_id, full_name: room.owner_name, lead: false }]
      : []);
  const runnerIds = new Set(runners.map((r) => r.user_id));
  const members = roster.filter((m) => !runnerIds.has(m.user_id));

  return (
    <div className="grid grid-cols-1 gap-8">
      <p className="caps num text-15 text-ink-2">
        {members.length + runners.length} people · {online.length} online now
      </p>
      <ul id="members" tabIndex={-1} aria-label="Members" className="border-t border-rule outline-none">
        {runners.map((r) => (
          <li
            key={r.user_id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-rule px-1 py-4 sm:px-3"
          >
            <span className="min-w-0 truncate text-19 font-semibold">
              {r.full_name}
              {r.user_id === profile.id ? <YouTag /> : null}
              {here.has(r.user_id) ? <OnlineTag /> : null}
            </span>
            <span className="caps text-15 text-ink-2">{r.lead ? "Lead" : "Trainer"}</span>
          </li>
        ))}
        {members.map((m) => (
          <li
            key={m.user_id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-rule px-1 py-4 sm:px-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-19 font-semibold">
                {m.full_name}
                {m.user_id === profile.id ? <YouTag /> : null}
                {here.has(m.user_id) ? <OnlineTag /> : null}
              </span>
              <span className="block truncate text-15 text-ink-2">
                {[m.email, `Joined ${joined(m.joined_at)}`].filter(Boolean).join(" · ")}
              </span>
            </span>
            {room.can_manage && m.user_id !== profile.id ? (
              <ConfirmAction
                action={removeMember.bind(null, room.id, m.user_id)}
                label="Remove"
                confirmLabel="Remove"
                pendingLabel="Removing"
                question={`Remove ${m.full_name}? They can rejoin with the code.`}
                focusAfter="members"
                compact
              />
            ) : null}
          </li>
        ))}
      </ul>
      {members.length === 0 ? (
        <EmptyState
          title={
            runners.some((r) => r.lead)
              ? "Just the leads so far"
              : runners.length
                ? "Just the trainer so far"
                : "No members yet"
          }
        >
          {room.can_manage ? "Share the join code to fill it." : null}
        </EmptyState>
      ) : null}
      {room.is_member ? (
        <ConfirmAction
          action={leaveClassroom.bind(null, room.id)}
          label="Leave event"
          confirmLabel="Leave"
          pendingLabel="Leaving"
          question="Leave? You'll need the code to rejoin."
        />
      ) : null}
    </div>
  );
}
