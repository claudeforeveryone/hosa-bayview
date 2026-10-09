import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TestForm } from "@/components/test-form";
import { getClassroom } from "@/lib/classrooms";
import { createTest } from "../actions";

export const metadata: Metadata = { title: "New test" };

export default async function NewTestPage({ params }: PageProps<"/c/[id]/tests/new">) {
  const { id } = await params;
  const room = await getClassroom(id);
  if (!room) notFound();
  if (!room.can_manage) redirect(`/c/${id}/tests`);

  return (
    <div className="grid grid-cols-1 gap-8">
      <h2 className="font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase">New test</h2>
      <TestForm action={createTest.bind(null, room.id)} submitLabel="Make test" pendingLabel="Making it" />
    </div>
  );
}
