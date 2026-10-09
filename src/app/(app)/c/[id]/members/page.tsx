import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { ConfirmAction } from "@/components/confirm-action";
import { requireProfile } from "@/lib/auth";
import { getClassroom, getRoster } from "@/lib/classrooms";
import { leaveClassroom, removeMember } from "../../actions";

const joined = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "America/Toronto" });

function YouTag() {
  return <span className="caps ml-3 bg-you px-2 py-0.5 align-middle text-[13px] text-on-you">You</span>;
}

export default async function MembersTab({ params }: PageProps<"/c/[id]/members">) {
  const { id } = await params;
  const [profile, room, roster] = await Promise.all([requireProfile(), getClassroom(id), getRoster(id)]);
  if (!room) notFound();

  return (
    <div className="grid grid-cols-1 gap-8">
      <ul id="members" tabIndex={-1} aria-label="Members" className="border-t border-rule outline-none">
        {room.owner_id ? (
          <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-rule px-1 py-4 sm:px-3">
            <span className="min-w-0 truncate text-[19px] font-semibold">
              {room.owner_name}
              {room.is_owner ? <YouTag /> : null}
            </span>
            <span className="caps text-[15px] text-ink-2">Trainer</span>
          </li>
        ) : null}
        {roster.map((m) => (
          <li
            key={m.user_id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-rule px-1 py-4 sm:px-3"
          >
            <span className="min-w-0">
              <span className="block truncate text-[19px] font-semibold">
                {m.full_name}
                {m.user_id === profile.id ? <YouTag /> : null}
              </span>
              <span className="block truncate text-[15px] text-ink-2">
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
      {roster.length === 0 ? (
        <EmptyState title={room.owner_id ? "Just the trainer so far" : "No members yet"}>
          {room.can_manage ? "Share the join code to fill it." : null}
        </EmptyState>
      ) : null}
      {room.is_member ? (
        <ConfirmAction
          action={leaveClassroom.bind(null, room.id)}
          label="Leave classroom"
          confirmLabel="Leave"
          pendingLabel="Leaving"
          question="Leave? You'll need the code to rejoin."
        />
      ) : null}
    </div>
  );
}
