import "server-only";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/classrooms";
import {
  parseBattleState,
  type BattleFormat,
  type BattleState,
} from "@/lib/battle";

// Server reads for battles. Battles ship with migrations 0095-0098; until those are applied the RPCs don't
// exist, and every read here returns null so the entry points stay hidden instead of showing a broken feature.

export type OpenBattle = {
  id: string;
  code: string;
  classroom_id: string;
  classroom_name: string;
  format: BattleFormat;
  status: "lobby" | "playing";
  host_name: string | null;
  players: number;
  joined: boolean;
};

export type BattleSource = {
  test_id: string;
  title: string;
  questions: number;
  // False for tests that hide answers or cap attempts; those can't be battled (their keys stay private).
  playable: boolean;
};

// PostgREST says PGRST202 for a function it doesn't know; Postgres says 42883.
const missing = (code: string | undefined) =>
  code === "PGRST202" || code === "42883";

function quiet(what: string, error: { code?: string; message: string }) {
  if (!missing(error.code)) console.error(`${what} failed: ${error.message}`);
}

// Live battles in one event (cid) or in every room you're in (cid null). Null means battles are not available.
export async function getOpenBattles(
  cid: string | null,
): Promise<OpenBattle[] | null> {
  if (cid !== null && !uuid.safeParse(cid).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_battles", { cid });
  if (error) {
    quiet("Battle lookup", error);
    return null;
  }
  return ((data ?? []) as (OpenBattle & { players: number | string })[]).map(
    (b) => ({
      ...b,
      players: Number(b.players),
    }),
  );
}

export async function getBattleSources(
  cid: string,
): Promise<BattleSource[] | null> {
  if (!uuid.safeParse(cid).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("battle_sources", { cid });
  if (error) {
    quiet("Battle sources lookup", error);
    return null;
  }
  return (
    (data ?? []) as (BattleSource & { questions: number | string })[]
  ).map((s) => ({
    ...s,
    questions: Number(s.questions),
  }));
}

export async function getBattleWins(userId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("battle_wins", { p_user: userId });
  if (error) {
    quiet("Battle wins lookup", error);
    return null;
  }
  return typeof data === "number" ? data : null;
}

// Null when the id is malformed, the battle is gone, or you can't see it; all read as "not found".
export async function getBattleState(id: string): Promise<BattleState | null> {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("battle_state", { bid: id });
  if (error) {
    if (error.code !== "42501") quiet("Battle lookup", error);
    return null;
  }
  return parseBattleState(data);
}
