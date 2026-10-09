import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClassroomTabs } from "@/components/classroom-tabs";
import { CodeStrip } from "@/components/code-strip";
import { getClassroom } from "@/lib/classrooms";
import { formNumber } from "@/lib/join-code";
import { regenerateCode } from "../actions";

export async function generateMetadata({ params }: LayoutProps<"/c/[id]">): Promise<Metadata> {
  const room = await getClassroom((await params).id);
  return { title: room?.name ?? "Classroom" };
}

export default async function ClassroomLayout({ children, params }: LayoutProps<"/c/[id]">) {
  const { id } = await params;
  const room = await getClassroom(id);
  if (!room) notFound();

  const people = `${room.member_count} member${room.member_count === 1 ? "" : "s"}`;
  const meta = [room.event, room.is_owner ? "You run it" : room.owner_name && `Run by ${room.owner_name}`, people].filter(Boolean).join(" · ");

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="-mx-4 -mt-6 grid gap-5 bg-field px-4 py-7 text-on-field sm:mx-0 sm:mt-0 sm:px-8 lg:px-10 lg:py-10">
        <div className="flex items-start justify-between gap-4">
          <h1 className="min-w-0 font-display text-[clamp(2.75rem,10vw,5.5rem)] leading-[0.92] font-bold [overflow-wrap:anywhere] uppercase">
            {room.name}
          </h1>
          <span className="num caps shrink-0 pt-2 text-[15px] text-on-field-2">{formNumber("C", room.num)}</span>
        </div>
        <p className="text-[17px] text-on-field-2">{meta}</p>
        {room.description ? <p className="max-w-[65ch] whitespace-pre-line">{room.description}</p> : null}
        {room.can_manage && room.join_code ? (
          <CodeStrip code={room.join_code} regenerate={regenerateCode.bind(null, room.id)} />
        ) : null}
      </header>
      <ClassroomTabs id={room.id} canManage={room.can_manage} />
      <div>{children}</div>
    </div>
  );
}
