import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { ResourceForm } from "@/components/resource-form";
import { TopicList } from "@/components/topic-breakdown";
import { TopicEditor } from "@/components/topic-editor";
import { getClassroom } from "@/lib/classrooms";
import { hostOf } from "@/lib/resources";
import { saveMaterial } from "@/app/(app)/library/actions";
import { getMaterials } from "@/app/(app)/library/queries";
import { MaterialForm } from "@/components/material-form";
import { MaterialList } from "@/components/material-list";
import { deleteResource, saveResource, saveTopics } from "./actions";
import { getResources, getTopicWeights } from "./queries";

export const metadata: Metadata = { title: "Resources" };

const heading =
  "font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase";

export default async function ResourcesTab({
  params,
}: PageProps<"/c/[id]/resources">) {
  const { id } = await params;
  const [room, files, links, topics] = await Promise.all([
    getClassroom(id),
    getMaterials(id),
    getResources(id),
    getTopicWeights(id),
  ]);
  if (!room) notFound();

  return (
    <div className="grid grid-cols-1 gap-14">
      <section aria-labelledby="files-h" className="grid gap-6">
        <h2 id="files-h" className={heading}>
          Files
        </h2>
        <MaterialList
          rows={files}
          canManage={room.can_manage}
          empty="No files yet"
        />
        {room.can_manage ? (
          <div className="grid gap-5 border-t border-rule pt-8">
            <h3 className="caps text-[17px] font-semibold">Add a file</h3>
            <MaterialForm
              action={saveMaterial.bind(null, room.id)}
              classroomId={room.id}
              modes={["file"]}
            />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="links-h" className="grid gap-6">
        <h2 id="links-h" className={heading}>
          Links
        </h2>
        {links.length ? (
          <ul className="border-t border-rule">
            {links.map((r) => (
              <li
                key={r.id}
                className="grid gap-4 border-b border-rule px-1 py-4 sm:px-3"
              >
                <div className="min-w-0">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="step block truncate text-[19px] font-semibold underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                  >
                    {r.title}
                  </a>
                  <span className="block truncate text-[15px] text-ink-2">
                    {hostOf(r.url)}
                    {r.note ? ` · ${r.note}` : ""}
                  </span>
                </div>
                {room.can_manage ? (
                  <div className="grid justify-items-start gap-4">
                    <details className="w-full max-w-xl">
                      <summary className="caps step inline-flex h-10 cursor-pointer items-center text-[15px] text-ink-2 hover:text-ink">
                        Edit
                      </summary>
                      <div className="pt-5">
                        <ResourceForm
                          action={saveResource.bind(null, room.id, r.id)}
                          initial={{ title: r.title, url: r.url, note: r.note }}
                          submitLabel="Save"
                          pendingLabel="Saving"
                        />
                      </div>
                    </details>
                    <ConfirmAction
                      action={deleteResource.bind(null, room.id, r.id)}
                      label="Delete"
                      confirmLabel="Delete"
                      pendingLabel="Deleting"
                      question={`Delete ${r.title}?`}
                      compact
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No links yet" />
        )}
        {room.can_manage ? (
          <div className="grid gap-5 border-t border-rule pt-8">
            <h3 className="caps text-[17px] font-semibold">Add a link</h3>
            <ResourceForm
              action={saveResource.bind(null, room.id, null)}
              submitLabel="Add link"
              pendingLabel="Adding"
              resetOnSave
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
