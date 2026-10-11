import "server-only";
import { getBoard, getMemberStats, type MemberStats } from "@/lib/activity-data";
import { getBattleWins } from "@/lib/battles";
import { getCareerItems, type CareerItemRow } from "@/lib/career-data";
import { EVENT_SKILLS, skillsFor, type SkillProgress } from "@/lib/skills";

// Chapter-wide skills from reads a page already made (Profile has all three).
export function chapterSkills(
  stats: MemberStats | null,
  answers: CareerItemRow[],
  battleWins: number | null,
): SkillProgress[] {
  return skillsFor({
    answered: stats?.answered ?? 0,
    correct: stats?.correct ?? 0,
    minutes: stats?.minutes ?? 0,
    reviews: stats?.reviews ?? 0,
    streak: stats?.streak ?? 0,
    signInStreak: stats?.sign_in_streak ?? 0,
    elo: stats?.elo ?? 0,
    rank: stats?.rank,
    battleWins,
    answers,
  });
}

// Your chapter-wide skills: your stats, your last 500 answers and your battle wins.
export async function getMySkills(userId: string): Promise<SkillProgress[]> {
  const [stats, answers, battleWins] = await Promise.all([
    getMemberStats(userId),
    getCareerItems(userId),
    getBattleWins(userId),
  ]);
  return chapterSkills(stats, answers, battleWins);
}

// Your skills inside one event: that event's board row (answers, right, time there) and your answers in it.
export async function getEventSkills(userId: string, classroomId: string): Promise<SkillProgress[]> {
  const [board, answers] = await Promise.all([getBoard("all", classroomId), getCareerItems(userId, classroomId)]);
  const me = board.find((r) => r.user_id === userId);
  return skillsFor(
    {
      answered: me?.answered ?? 0,
      correct: me?.correct ?? 0,
      minutes: me?.minutes ?? 0,
      answers,
    },
    EVENT_SKILLS,
  );
}
