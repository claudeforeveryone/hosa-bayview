import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { SkillCard } from "@/components/skill-card";
import { SkillEditor } from "@/components/skill-editor";
import { getClassroom, getRoomInfo } from "@/lib/classrooms";
import { stepsToText } from "@/lib/parse/steps";
import { deleteSkill, saveSkill } from "./actions";
import { getSkills } from "./queries";

export const metadata: Metadata = { title: "Skills" };

// Practical events only: each skill is a rating sheet to run through. Managers add, edit and delete inline.
export default async function SkillsTab({
  params,
}: PageProps<"/c/[id]/skills">) {
  const { id } = await params;
  const [room, info, skills] = await Promise.all([
    getClassroom(id),
    getRoomInfo(id),
    getSkills(id),
  ]);
  if (!room) notFound();
  if (info?.category !== "practical") redirect(`/c/${id}`);

  return (
    <div className="grid grid-cols-1 gap-10">
      {skills.length ? (
        <div className="border-t border-rule">
          {skills.map((s) => (
            <SkillCard
              key={s.id}
              name={s.name}
              round={s.round}
              steps={s.steps}
              note={s.note}
              defaultOpen={skills.length === 1}
            >
              {room.can_manage ? (
                <div className="grid gap-4 border-t border-rule-strong pt-5">
                  <details className="group">
                    <summary className="caps step inline-flex h-10 cursor-pointer items-center border border-ink px-4 text-[15px] hover:bg-band">
                      Edit
                    </summary>
                    <div className="pt-5">
                      <SkillEditor
                        action={saveSkill.bind(null, room.id, s.id)}
                        initial={{
                          name: s.name,
                          round: s.round ?? "",
                          steps: stepsToText(s.steps),
                          note: s.note ?? "",
                        }}
                        submitLabel="Save skill"
                        pendingLabel="Saving"
                      />
                    </div>
                  </details>
                  <ConfirmAction
                    action={deleteSkill.bind(null, room.id, s.id)}
                    label="Delete"
                    confirmLabel="Delete for good"
                    pendingLabel="Deleting"
                    question={`Delete ${s.name}?`}
                    compact
                  />
                </div>
              ) : null}
            </SkillCard>
          ))}
        </div>
      ) : (
        <EmptyState title="No skills yet" />
      )}

      {room.can_manage ? (
        <section
          aria-labelledby="add-skill-h"
          className="grid gap-5 border-t border-rule pt-8"
        >
          <h2 id="add-skill-h" className="caps text-[17px] font-semibold">
            Add skill
          </h2>
          <SkillEditor
            action={saveSkill.bind(null, room.id, null)}
            submitLabel="Add skill"
            pendingLabel="Adding"
            resetOnSave
          />
        </section>
      ) : null}
    </div>
  );
}
