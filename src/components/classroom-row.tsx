import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ClassroomSummary } from "@/lib/classrooms";
import { formNumber } from "@/lib/join-code";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function ClassroomRow({ room }: { room: ClassroomSummary }) {
  const meta = [
    // Most rooms are named after their event; don't say it twice.
    room.event.trim().toLowerCase() === room.name.trim().toLowerCase()
      ? null
      : room.event,
    room.is_owner ? "You run it" : room.owner_name,
    plural(room.member_count, "member"),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="border-b border-rule">
      <Link
        href={`/c/${room.id}`}
        className="step grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-4 hover:bg-band sm:px-3"
      >
        <span className="min-w-0">
          <span className="block truncate font-display text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-semibold uppercase">
            {room.name}
          </span>
          <span className="block truncate text-[16px] text-ink-2">{meta}</span>
        </span>
        <span className="flex items-center gap-2 text-ink-2">
          <span className="num caps text-[15px]">
            {formNumber("C", room.num)}
          </span>
          <ChevronRight size={22} strokeWidth={1.75} aria-hidden />
        </span>
      </Link>
    </li>
  );
}
