import "server-only";
import { cache } from "react";
import { uuid } from "@/lib/classrooms";
import { cleanSteps, type Step } from "@/lib/parse/steps";
import { createClient } from "@/lib/supabase/server";

export type SkillRow = {
  id: string;
  position: number;
  name: string;
  round: string | null;
  steps: Step[];
  note: string | null;
};

// In list order. RLS shows them to anyone who can see the room. Cached: the hub counts them too.
export const getSkills = cache(
  async (classroomId: string): Promise<SkillRow[]> => {
    if (!uuid.safeParse(classroomId).success) return [];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("skills")
      .select("id, position, name, round, steps, note")
      .eq("classroom_id", classroomId)
      .order("position")
      .order("created_at");
    if (error) throw new Error(`Skills lookup failed: ${error.message}`);
    return (data ?? []).map(
      (r) => ({ ...r, steps: cleanSteps(r.steps) }) as SkillRow,
    );
  },
);
