import "server-only";
import { cache } from "react";
import { markKey, type RosterWeek } from "@/lib/roster";
import { createClient } from "@/lib/supabase/server";

export type RosterPerson = {
  id: string;
  name: string;
  grade: number | null;
  hasAccount: boolean;
};

export type RosterClass = {
  id: string;
  name: string;
  code: string | null;
  members: RosterPerson[];
};

export type RosterData = {
  // Every class the viewer can see, rostered or not, by name.
  classes: RosterClass[];
  weeks: RosterWeek[];
  // markKey(member, week) for every present mark.
  present: string[];
};

type MemberDb = {
  id: string;
  classroom_id: string;
  full_name: string;
  grade: number | null;
  user_id: string | null;
  position: number;
  roster_marks: { week_id: string; present: boolean }[];
};

// Three reads in parallel, whatever the number of classes: classes, roster rows with their marks embedded,
// and the meeting dates. RLS limits all three to what the viewer manages (executives: everything).
// Sizes are small (one chapter: ~100 names, ~30 weeks), well under PostgREST's 1000-row page; page these
// reads with fetchAllPages if the roster ever nears that.
export const loadRoster = cache(
  async (classroomId?: string): Promise<RosterData> => {
    const supabase = await createClient();
    let classesQ = supabase
      .from("classrooms")
      .select("id, name, short_code")
      .eq("kind", "class")
      .order("name");
    let membersQ = supabase
      .from("roster_members")
      .select(
        "id, classroom_id, full_name, grade, user_id, position, roster_marks(week_id, present)",
      )
      // Current members only (0104): leaving an event archives the row, and the first typed-in names are archived.
      .eq("archived", false)
      .order("position")
      .order("full_name");
    if (classroomId) {
      classesQ = classesQ.eq("id", classroomId);
      membersQ = membersQ.eq("classroom_id", classroomId);
    }
    const [classes, members, weeks] = await Promise.all([
      classesQ,
      membersQ,
      supabase.from("roster_weeks").select("id, meet_on").order("meet_on"),
    ]);
    const err = classes.error ?? members.error ?? weeks.error;
    if (err)
      throw new Error(`Attendance tracker lookup failed: ${err.message}`);

    const byClass = new Map<string, RosterPerson[]>();
    const present: string[] = [];
    for (const m of (members.data ?? []) as MemberDb[]) {
      const list = byClass.get(m.classroom_id) ?? [];
      list.push({
        id: m.id,
        name: m.full_name,
        grade: m.grade,
        hasAccount: m.user_id !== null,
      });
      byClass.set(m.classroom_id, list);
      for (const k of m.roster_marks ?? [])
        if (k.present) present.push(markKey(m.id, k.week_id));
    }

    return {
      classes: (
        (classes.data ?? []) as {
          id: string;
          name: string;
          short_code: string | null;
        }[]
      ).map((c) => ({
        id: c.id,
        name: c.name,
        code: c.short_code,
        members: byClass.get(c.id) ?? [],
      })),
      weeks: (weeks.data ?? []) as RosterWeek[],
      present,
    };
  },
);
