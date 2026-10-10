import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BattleRoom } from "@/components/battle-room";
import { requireProfile } from "@/lib/auth";
import { getBattleState } from "@/lib/battles";

export const metadata: Metadata = { title: "Battle" };

// A live battle. Only people who can see its event get a state back; everyone else gets not found.
export default async function BattlePage(props: PageProps<"/battle/[id]">) {
  const { id } = await props.params;
  await requireProfile();
  const state = await getBattleState(id);
  if (!state) notFound();
  return <BattleRoom key={state.id} initial={state} />;
}
