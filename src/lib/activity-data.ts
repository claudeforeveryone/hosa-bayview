import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  type BoardRow,
  type CareerItem,
  type OnlineRow,
  type Period,
} from "@/lib/activity";
import type { Role } from "@/lib/auth";
import { uuid } from "@/lib/classrooms";
import { avatarSources } from "@/lib/avatar-urls";

// Reads from the activity RPCs in migration 0017. The database decides who may see what; these just call and map.

type RawBoard = Omit<BoardRow, "accuracy"> & {
  accuracy: number | string | null;
};

export type MemberStats = {
  user_id: string;
  full_name: string;
  role: Role;
  minutes: number;
  reviews: number;
  answered: number;
  correct: number;
  accuracy: number | null;
  elo: number;
  streak: number;
  rank: number;
};

export type DirectoryRow = { user_id: string; full_name: string; role: Role };

export type CareerRow = CareerItem & {
  answered_at: string;
  test_title: string;
  prompt: string;
  options: string[];
  selected_index: number;
  correct_index: number;
  explanation: string;
};

const num = (v: number | string | null) => (v === null ? null : Number(v));

export type MemberDetail = {
  user_id: string;
  avatar_url: string | null;
  grade: number | null;
};

type RawDetail = {
  user_id: string;
  avatar_path: string | null;
  grade: number | null;
};

// Picture (a short-lived signed URL) and grade for every member. Pictures are decoration: if this lookup
// fails, pages still render, with initials.
export async function getMemberDetails(): Promise<Map<string, MemberDetail>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("member_details");
  if (error) {
    console.error("[activity] member details:", error.message);
    return new Map();
  }
  const rows = (data ?? []) as RawDetail[];
  const sources = await avatarSources(rows.map((r) => r.avatar_path));
  return new Map(
    rows.map((r) => [
      r.user_id,
      {
        user_id: r.user_id,
        grade: r.grade,
        avatar_url: r.avatar_path ? (sources.get(r.avatar_path) ?? null) : null,
      },
    ]),
  );
}

// Club board when classroomId is null, otherwise that classroom's board.
export async function getBoard(
  period: Period,
  classroomId: string | null,
): Promise<BoardRow[]> {
  if (classroomId !== null && !uuid.safeParse(classroomId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leaderboard", {
    period,
    cid: classroomId,
  });
  // 42501: a room you can't view. Read as an empty board, not an error page.
  if (error?.code === "42501") return [];
  if (error) throw new Error(`Board lookup failed: ${error.message}`);
  const details = await getMemberDetails();
  return ((data ?? []) as RawBoard[]).map((r) => ({
    ...r,
    minutes: Number(r.minutes),
    reviews: Number(r.reviews),
    answered: Number(r.answered),
    correct: Number(r.correct),
    accuracy: num(r.accuracy),
    elo: Number(r.elo),
    streak: Number(r.streak),
    avatar_url: details.get(r.user_id)?.avatar_url ?? null,
  }));
}

// Who's online (seen in the last two minutes). Null classroom means the whole chapter.
export async function getOnline(
  classroomId: string | null,
): Promise<OnlineRow[]> {
  if (classroomId !== null && !uuid.safeParse(classroomId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("members_online", {
    cid: classroomId,
  });
  // 42501: a room you can't view. Read as nobody online, not an error page.
  if (error?.code === "42501") return [];
  if (error) throw new Error(`Online lookup failed: ${error.message}`);
  return (data ?? []) as OnlineRow[];
}

export async function getMemberStats(
  userId: string,
): Promise<MemberStats | null> {
  if (!uuid.safeParse(userId).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("member_stats", { uid: userId })
    .maybeSingle();
  if (error) throw new Error(`Member lookup failed: ${error.message}`);
  if (!data) return null;
  const r = data as MemberStats & { accuracy: number | string | null };
  return {
    ...r,
    minutes: Number(r.minutes),
    reviews: Number(r.reviews),
    answered: Number(r.answered),
    correct: Number(r.correct),
    accuracy: num(r.accuracy),
    elo: Number(r.elo),
    streak: Number(r.streak),
    rank: Number(r.rank),
  };
}

export async function getDirectory(): Promise<DirectoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("member_directory");
  if (error) throw new Error(`Directory lookup failed: ${error.message}`);
  return (data ?? []) as DirectoryRow[];
}

// Answered questions for one member, newest first. The database limits this to what you may see.
export async function getCareer(userId: string): Promise<CareerRow[]> {
  if (!uuid.safeParse(userId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("career", {
    uid: userId,
    cid: null,
  });
  if (error) throw new Error(`Career lookup failed: ${error.message}`);
  return (data ?? []) as CareerRow[];
}
