"use client";

import { usePathname } from "next/navigation";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { classroomIdFromPath } from "@/lib/activity";

// Renders nothing. Mounted once in the app layout so every signed-in page reports presence.
export function OnlineHeartbeat() {
  const path = usePathname();
  useHeartbeat(classroomIdFromPath(path));
  return null;
}
