import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { SkillBoard } from "@/components/skill-badges";
import { SkillCard } from "@/components/skill-card";
import { SkillEditor } from "@/components/skill-editor";
import { requireProfile } from "@/lib/auth";
import { getClassroom, getRoomInfo } from "@/lib/classrooms";
import { getEventSkills } from "@/lib/skills-data";
import { stepsToText } from "@/lib/parse/steps";
import { deleteSkill, saveSkill } from "./actions";
import { getSkills } from "./queries";

export const metadata: Metadata = { title: "Skills" };

// Every event: the skill badges you've earned here. Practical events also keep their rating sheets below: each
// one is a skill to run through step by step, and managers add, edit and delete them inline.
export default async function SkillsTab({
  params,
}: PageProps<"/c/[id]/skills">) {
  const { id } = await params;
  const [room, info, profile] = await Promise.all([
    getClassroom(id),
    getRoomInfo(id),
    requireProfile(),
  ]);
  if (!room) notFound();
  const practical = info?.category === "practical";
  const [badges, skills] = await Promise.all([
    getEventSkills(profile.id, id),
    practical ? getSkills(id) : Promise.resolve([]),
  ]);

  return (
    <div className="grid grid-cols-1 gap-12">
      <SkillBoard list={badges} scope={`Your skills in ${room.name}`} />
      {practical ? <RatingSheets room={room} skills={skills} /> : null}
    </div>
  );
}

function RatingSheets({
  room,
  skills,
}: {
  room: { id: string; can_manage: boolean };
  skills: Awaited<ReturnType<typeof getSkills>>;
}) {
  return (
    <section aria-labelledby="sheets-h" className="grid grid-cols-1 gap-6">
      <div className="grid gap-1 border-b-[3px] border-ink pb-2">
        <h2
          id="sheets-h"
          className="font-display text-[clamp(1.6rem,6vw,2.2rem)] leading-none font-bold uppercase"
        >
          Rating sheets
        </h2>
        <p className="text-16 text-ink-2">The steps judges score. Tick them off as you run through a skill.</p>
      </div>
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
                    <summary className="caps step inline-flex h-10 cursor-pointer items-center border border-ink px-4 text-15 hover:bg-band">
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
        <EmptyState title="No rating sheets yet" />
      )}

      {room.can_manage ? (
        <section
          aria-labelledby="add-skill-h"
          className="grid gap-5 border-t border-rule pt-8"
        >
          <h2 id="add-skill-h" className="caps text-17 font-semibold">
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
    </section>
  );
}
