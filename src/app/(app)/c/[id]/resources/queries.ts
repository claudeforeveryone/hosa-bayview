import "server-only";
import { cache } from "react";
import { uuid } from "@/lib/classrooms";
import type { ResourceRow, TopicRow } from "@/lib/resources";
import { createClient } from "@/lib/supabase/server";

// Viewers read these through RLS; a null-ish id reads as an empty list.
export const getResources = cache(async (classroomId: string): Promise<ResourceRow[]> => {
  if (!uuid.safeParse(classroomId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources")
    .select("id, title, url, note, position")
    .eq("classroom_id", classroomId)
    .order("position")
    .order("created_at");
  if (error) throw new Error(`Resources lookup failed: ${error.message}`);
  return (data ?? []) as ResourceRow[];
});

export const getTopicWeights = cache(async (classroomId: string): Promise<TopicRow[]> => {
  if (!uuid.safeParse(classroomId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("topic_weights")
    .select("id, topic, percent, position")
    .eq("classroom_id", classroomId)
    .order("position");
  if (error) throw new Error(`Breakdown lookup failed: ${error.message}`);
  return (data ?? []) as TopicRow[];
});
