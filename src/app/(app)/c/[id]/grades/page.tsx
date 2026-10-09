import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GradesView } from "@/components/grades-view";
import { getClassroom } from "@/lib/classrooms";
import { getClassroomGrades } from "@/lib/tests";

export const metadata: Metadata = { title: "Grades" };

export default async function GradesPage({
  params,
}: PageProps<"/c/[id]/grades">) {
  const { id } = await params;
  const room = await getClassroom(id);
  if (!room) notFound();
  const rows = await getClassroomGrades(room.id);
  return (
    <GradesView
      rows={rows}
      canManage={room.can_manage}
      classroomName={room.name}
    />
  );
}
