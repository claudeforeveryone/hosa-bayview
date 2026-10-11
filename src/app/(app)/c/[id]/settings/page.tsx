import { notFound, redirect } from "next/navigation";
import { ClassroomForm } from "@/components/classroom-form";
import { ConfirmAction } from "@/components/confirm-action";
import { getClassroom, getRoomInfo } from "@/lib/classrooms";
import { formNumber } from "@/lib/join-code";
import { deleteClassroom, updateClassroom } from "../../actions";

export default async function SettingsTab({ params }: PageProps<"/c/[id]/settings">) {
  const { id } = await params;
  const [room, info] = await Promise.all([getClassroom(id), getRoomInfo(id)]);
  if (!room) notFound();
  if (!room.can_manage) redirect(`/c/${id}`);

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
    </div>
  );
}
