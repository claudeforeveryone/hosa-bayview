import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  type BoardRow,
  type CareerItem,
  type HonorRow,
  type OnlineRow,
  type Period,
} from "@/lib/activity";
import type { Role } from "@/lib/auth";
import { uuid } from "@/lib/classrooms";
import { avatarSources } from "@/lib/avatar-urls";
import type { LuckyReason } from "@/lib/lucky";

export type BonusRow = {
  amount: number;
  reason: LuckyReason | string;
  created_at: string;
};

// Reads from the activity RPCs in migrations 0017 and 0030. The database decides who may see what; these just call and map.

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
  sign_in_streak: number;
  rank: number;
};

export type DirectoryRow = { user_id: string; full_name: string; role: Role };

export type CareerRow = CareerItem & {
  answered_at: string;
  test_title: string;
  prompt: string;
  options: string[];
  selected_index: number;
  // Null when the test hides answers from this viewer.
  correct_index: number | null;
  explanation: string | null;
};

const num = (v: number | string | null) => (v === null ? null : Number(v));

export type MemberDetail = {
  user_id: string;
  avatar_url: string | null;
  grade: number | null;
  title: string | null;
};

type RawDetail = {
  user_id: string;
  avatar_path: string | null;
  grade: number | null;
  title: string | null;
};

// Picture (a short-lived signed URL) and grade for every member, once per request. Pictures are decoration:
// if this lookup fails, pages still render, with initials.
export const getMemberDetails = cache(
  async (): Promise<Map<string, MemberDetail>> => {
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
          title: r.title,
          avatar_url: r.avatar_path
            ? (sources.get(r.avatar_path) ?? null)
            : null,
        },
      ]),
    );
  },
);

// One member's picture, grade and title, for their member page. Since 0206 the full list above gives grade and
// title only for your own row (or to an executive), so other members' pages ask for the one row. Before 0206 is in
// the database the function is missing (PGRST202) and the full list still has every row, so it is used instead.
export async function getMemberDetail(
  userId: string,
): Promise<MemberDetail | null> {
  if (!uuid.safeParse(userId).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("member_detail", {
    uid: userId,
  });
  if (error?.code === "PGRST202") {
    return (await getMemberDetails()).get(userId) ?? null;
  }
  if (error) {
    console.error("[activity] member detail:", error.message);
    return null;
  }
  const row = ((data ?? []) as RawDetail[])[0];
  if (!row) return null;
  const sources = await avatarSources([row.avatar_path]);
  return {
    user_id: row.user_id,
    grade: row.grade,
    title: row.title,
    avatar_url: row.avatar_path ? (sources.get(row.avatar_path) ?? null) : null,
  };
}

// Club board when classroomId is null, otherwise that classroom's board.
export async function getBoard(
  period: Period,
  classroomId: string | null,
): Promise<BoardRow[]> {
  if (classroomId !== null && !uuid.safeParse(classroomId).success) return [];
  const supabase = await createClient();
  // Pictures load alongside the board rather than after it.
  const [{ data, error }, details] = await Promise.all([
    supabase.rpc("leaderboard", { period, cid: classroomId }),
    getMemberDetails(),
  ]);
  // 42501: a room you can't view. Read as an empty board, not an error page.
  if (error?.code === "42501") return [];
  if (error) throw new Error(`Board lookup failed: ${error.message}`);
  return ((data ?? []) as RawBoard[]).map((r) => ({
    ...r,
    minutes: Number(r.minutes),
    reviews: Number(r.reviews),
    answered: Number(r.answered),
    correct: Number(r.correct),
    accuracy: num(r.accuracy),
    elo: Number(r.elo),
    gain: Number(r.gain),
    streak: Number(r.streak),
    avatar_url: details.get(r.user_id)?.avatar_url ?? null,
  }));
}

// Honor roll: members with a sign-in streak of 3+ days, longest first.
export async function getHonorRoll(): Promise<HonorRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("honor_roll");
  if (error) throw new Error(`Honor roll lookup failed: ${error.message}`);
  return ((data ?? []) as HonorRow[]).map((r) => ({
    ...r,
    streak: Number(r.streak),
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
    sign_in_streak: Number(r.sign_in_streak),
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

// Last five lucky bonuses for one member, newest first. Empty for a bad id or no bonuses.
export async function getRecentBonuses(userId: string): Promise<BonusRow[]> {
  if (!uuid.safeParse(userId).success) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recent_bonuses", { uid: userId });
  if (error) throw new Error(`Bonus lookup failed: ${error.message}`);
  return ((data ?? []) as BonusRow[]).map((r) => ({
    ...r,
    amount: Number(r.amount),
  }));
}
