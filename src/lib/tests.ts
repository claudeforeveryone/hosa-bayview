import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/classrooms";
import type { GradeRow } from "@/lib/grades";
import type { TestSettings } from "@/lib/test-settings";

export type TestSummary = {
  id: string;
  num: number;
  title: string;
  description: string;
  time_limit_minutes: number | null;
  is_published: boolean;
  question_count: number;
  my_attempts: number;
  my_best: number | null;
  my_best_total: number | null;
  created_at: string;
};

export type Test = TestSettings & {
  id: string;
  num: number;
  classroom_id: string;
  title: string;
  description: string;
  time_limit_minutes: number | null;
  is_published: boolean;
  created_at: string;
};

// Only managers can read keys (RLS); everyone else gets correct_index/explanation as null.
export type EditableQuestion = {
  id: string;
  position: number;
  prompt: string;
  options: string[];
  correct_index: number | null;
  explanation: string;
};

// One question in an attempt, in the order the server decided (shuffle applied).
// choice_order[i] is the original option index shown at position i.
export type AttemptQuestion = {
  question_id: string;
  pos: number;
  prompt: string;
  options: string[];
  choice_order: number[];
  selected_index: number | null;
  is_correct: boolean | null;
  correct_index: number | null;
  explanation: string | null;
};

export type Attempt = {
  id: string;
  test_id: string;
  user_id: string;
  mode: "timed" | "practice";
  started_at: string;
  deadline: string | null;
  submitted_at: string | null;
  score: number | null;
  total: number;
};

export type ResultRow = {
  user_id: string;
  full_name: string;
  attempts: number;
  best: number | null;
  total: number | null;
  last_at: string;
  // Best score came from a practice run (answers shown as they went).
  practice_only: boolean;
};

// Ask teacher. Managers see every flag on a test; anyone else sees only their own.
export type TestFlag = {
  id: string;
  question_id: string;
  user_id: string;
  full_name: string;
  pos: number;
  prompt: string;
  note: string;
  status: "open" | "answered";
  reply: string;
  created_at: string;
  answered_at: string | null;
};

// Grades timed attempts whose time ran out while the tab was closed. Safe to call on every view.
export async function closeExpired(testId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_expired_attempts", {
    tid: testId,
  });
  if (error) console.error("[tests] close expired:", error.message);
}

export async function getClassroomTests(
  classroomId: string,
): Promise<TestSummary[]> {
  if (!uuid.safeParse(classroomId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("classroom_tests", {
    cid: classroomId,
  });
  if (error) throw new Error(`Tests lookup failed: ${error.message}`);
  return (data ?? []) as TestSummary[];
}

// Null when malformed or not visible to you.
export const getTest = cache(async (testId: string): Promise<Test | null> => {
  if (!uuid.safeParse(testId).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tests")
    .select(
      "id, num, classroom_id, title, description, time_limit_minutes, is_published, created_at, shuffle_questions, shuffle_choices, allow_practice, show_answers, attempts_allowed",
    )
    .eq("id", testId)
    .maybeSingle();
  if (error) throw new Error(`Test lookup failed: ${error.message}`);
  return (data as Test | null) ?? null;
});

export async function getQuestions(
  testId: string,
): Promise<EditableQuestion[]> {
  const supabase = await createClient();
  const questions = await supabase
    .from("questions")
    .select("id, position, prompt, options")
    .eq("test_id", testId)
    .order("position")
    .order("id");
  if (questions.error)
    throw new Error(`Questions lookup failed: ${questions.error.message}`);
  const ids = (questions.data ?? []).map((q) => q.id as string);
  const keys = ids.length
    ? await supabase
        .from("question_keys")
        .select("question_id, correct_index, explanation")
        .in("question_id", ids)
    : { data: [], error: null };
  if (keys.error)
    throw new Error(`Answer keys lookup failed: ${keys.error.message}`);
  const byId = new Map(
    (keys.data ?? []).map((k) => [k.question_id as string, k]),
  );
  return (questions.data ?? []).map((q) => {
    const k = byId.get(q.id);
    return {
      id: q.id,
      position: q.position,
      prompt: q.prompt,
      options: q.options,
      correct_index: k ? (k.correct_index as number) : null,
      explanation: k ? (k.explanation as string) : "",
    };
  });
}

export async function getAttempt(attemptId: string): Promise<Attempt | null> {
  if (!uuid.safeParse(attemptId).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attempts")
    .select(
      "id, test_id, user_id, mode, started_at, deadline, submitted_at, score, total",
    )
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw new Error(`Attempt lookup failed: ${error.message}`);
  return (data as Attempt | null) ?? null;
}

// Questions for an attempt in display order, with the server's choice order and key visibility.
export async function getAttemptQuestions(
  attemptId: string,
): Promise<AttemptQuestion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attempt_questions", {
    aid: attemptId,
  });
  if (error) throw new Error(`Attempt lookup failed: ${error.message}`);
  return ((data ?? []) as AttemptQuestion[]).map((r) => ({
    ...r,
    choice_order: r.choice_order.map(Number),
  }));
}

export async function getMyAttempts(
  testId: string,
  userId: string,
): Promise<Attempt[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attempts")
    .select(
      "id, test_id, user_id, mode, started_at, deadline, submitted_at, score, total",
    )
    .eq("test_id", testId)
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Attempts lookup failed: ${error.message}`);
  return (data ?? []) as Attempt[];
}

// How many attempts of one mode a taker has used (open or finished) on a test.
export async function countAttempts(
  testId: string,
  userId: string,
  mode: "timed" | "practice",
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("test_id", testId)
    .eq("user_id", userId)
    .eq("mode", mode);
  if (error) throw new Error(`Attempts lookup failed: ${error.message}`);
  return count ?? 0;
}

export async function getResults(testId: string): Promise<ResultRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("test_results", { tid: testId });
  if (error) throw new Error(`Results lookup failed: ${error.message}`);
  return (data ?? []) as ResultRow[];
}

export async function getTestFlags(testId: string): Promise<TestFlag[]> {
  if (!uuid.safeParse(testId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("test_flags", { tid: testId });
  if (error) throw new Error(`Questions lookup failed: ${error.message}`);
  return (data ?? []) as TestFlag[];
}

// Best score per member per posted test for a classroom. Members get only their own rows (RLS in the RPC).
export async function getClassroomGrades(
  classroomId: string,
): Promise<GradeRow[]> {
  if (!uuid.safeParse(classroomId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("classroom_grades", {
    cid: classroomId,
  });
  if (error) throw new Error(`Grades lookup failed: ${error.message}`);
  return (data ?? []) as GradeRow[];
}
