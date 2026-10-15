import { notFound, redirect } from "next/navigation";
import { ClassroomForm } from "@/components/classroom-form";
import { ConfirmAction } from "@/components/confirm-action";
import { LeadsForm } from "@/components/leads-form";
import { getDirectory } from "@/lib/activity-data";
import { requireProfile } from "@/lib/auth";
import { getClassroom, getRoomInfo, getRunners } from "@/lib/classrooms";
import { formNumber } from "@/lib/join-code";
import { deleteClassroom, setLeads, updateClassroom } from "../../actions";

export default async function SettingsTab({ params }: PageProps<"/c/[id]/settings">) {
  const { id } = await params;
  const [profile, room, info] = await Promise.all([requireProfile(), getClassroom(id), getRoomInfo(id)]);
  if (!room) notFound();
  if (!room.can_manage) redirect(`/c/${id}`);
  // Only executives pick who runs an event. Without 0291 (no classroom_runners) the section stays hidden.
  const isExec = profile.role === "executive";
  const [runners, directory] = isExec
    ? await Promise.all([getRunners(id).catch(() => null), getDirectory().catch(() => [])])
    : [null, []];
  const eligible = directory.filter((p) => p.role === "trainer" || p.role === "executive");

  return (
    <div className="grid grid-cols-1 gap-12">
      <ClassroomForm
        action={updateClassroom.bind(null, room.id)}
        initial={{
          name: room.name,
          event: room.event,
          description: room.description,
          category: info?.category ?? "",
        }}
        submitLabel="Save changes"
        pendingLabel="Saving"
      />
      {isExec && runners ? (
        <section aria-labelledby="leads-h" className="grid max-w-xl gap-3 border-t border-rule pt-8">
          <h2 id="leads-h" className="font-display text-28 leading-none font-bold uppercase">
            Who runs it
          </h2>
          <p className="text-ink-2">
            Leads show as &ldquo;Run by&rdquo; in this order, can manage the event, and hear when someone asks a
            question here.
          </p>
          <LeadsForm action={setLeads.bind(null, room.id)} people={eligible} initial={runners.filter((r) => r.lead)} />
        </section>
      ) : null}
      {/* A lead runs the event but can't delete it (0291); only its maker or an executive can. */}
      {isExec || room.owner_id === profile.id ? (
        <section aria-labelledby="delete-h" className="grid max-w-xl gap-3 border-t border-rule pt-8">
          <h2 id="delete-h" className="font-display text-28 leading-none font-bold uppercase">
            Delete event
          </h2>
          <p className="text-ink-2">
            Deletes everything in {formNumber("C", room.num)} for everyone. Can&rsquo;t be undone.
          </p>
          <ConfirmAction
            action={deleteClassroom.bind(null, room.id)}
            label="Delete event"
            confirmLabel="Delete for good"
            pendingLabel="Deleting"
            question={`Delete ${room.name} for everyone?`}
          />
        </section>
      ) : null}
    </div>
  );
}
