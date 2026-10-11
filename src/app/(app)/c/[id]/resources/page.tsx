import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { TopicList } from "@/components/topic-breakdown";
import { TopicEditor } from "@/components/topic-editor";
import { getClassroom } from "@/lib/classrooms";
import { getProfile } from "@/lib/auth";
import { saveMaterial } from "@/app/(app)/library/actions";
import { getMaterials } from "@/app/(app)/library/queries";
import { MaterialForm } from "@/components/material-form";
import { MaterialList } from "@/components/material-list";
import { StorageBar } from "@/components/storage-bar";
import { sectionNames } from "@/lib/materials";
import { saveTopics } from "./actions";
import { getTopicWeights } from "./queries";

export const metadata: Metadata = { title: "Resources" };

const heading =
  "font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase";

export default async function ResourcesTab({
  params,
}: PageProps<"/c/[id]/resources">) {
  const { id } = await params;
  const [room, files, topics, profile] = await Promise.all([
    getClassroom(id),
    getMaterials(id),
    getTopicWeights(id),
    getProfile(),
  ]);
  if (!room) notFound();

  return (
    <div className="grid grid-cols-1 gap-14">
      <section aria-labelledby="files-h" className="grid gap-6">
        <h2 id="files-h" className={heading}>
          Files and links
        </h2>
        <MaterialList
          rows={files}
          canManage={room.can_manage}
          empty="Nothing here yet"
        />
        {room.can_manage ? (
          <div className="grid gap-5 border-t border-rule pt-8">
            <h3 className="caps text-[17px] font-semibold">Add a file or link</h3>
            {profile?.role === "executive" ? <StorageBar /> : null}
            <MaterialForm
              action={saveMaterial.bind(null, room.id)}
              classroomId={room.id}
              sections={sectionNames(files)}
            />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="topics-h" className="grid gap-6">
        <h2 id="topics-h" className={heading}>
          Event breakdown
        </h2>
        {room.can_manage ? (
          <TopicEditor
            action={saveTopics.bind(null, room.id)}
            initial={topics.map((t) => ({
              topic: t.topic,
              percent: String(t.percent),
            }))}
          />
        ) : topics.length ? (
          <TopicList rows={topics} />
        ) : (
          <EmptyState title="No breakdown yet" />
        )}
      </section>
    </div>
  );
}
