import type { Metadata } from "next";
import { ClassroomForm } from "@/components/classroom-form";
import { requireRole } from "@/lib/auth";
import { createClassroom } from "../actions";

export const metadata: Metadata = { title: "New event" };

export default async function NewClassroomPage() {
  await requireRole("trainer", "executive");
  return (
    <div className="grid grid-cols-1 gap-8">
      <h1 className="font-display text-[clamp(2.75rem,10vw,5rem)] leading-[0.92] font-bold uppercase">
        New event
      </h1>
      <ClassroomForm
        action={createClassroom}
        initial={{ name: "", event: "", description: "", category: "mc" }}
        submitLabel="Make event"
        pendingLabel="Making it"
      />
    </div>
  );
}
