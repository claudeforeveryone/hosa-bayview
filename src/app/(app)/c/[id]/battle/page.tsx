import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BattleSetup } from "@/components/battle-setup";
import { EmptyState } from "@/components/empty-state";
import { hubHeading } from "@/components/event-hub";
import { createBattle } from "@/app/(app)/battle/actions";
import { getRoomInfo } from "@/lib/classrooms";
import { getBattleSources } from "@/lib/battles";

export const metadata: Metadata = { title: "New battle" };

// Host a battle in this event. Multiple-choice and practical events only; hidden until battles exist on the
// database (getBattleSources is null then).
export default async function NewBattlePage(
  props: PageProps<"/c/[id]/battle">,
) {
  const { id } = await props.params;
  const [info, sources] = await Promise.all([
    getRoomInfo(id),
    getBattleSources(id),
  ]);
  if (
    !info ||
    info.kind !== "class" ||
    (info.category !== "mc" && info.category !== "practical") ||
    !sources
  )
    notFound();
  return (
    <section aria-labelledby="battle-h" className="grid gap-6">
      <h2 id="battle-h" className={hubHeading}>
        Battle
      </h2>
      {sources.some((s) => s.playable) ? (
        <div className="px-1 sm:px-3">
          <BattleSetup action={createBattle.bind(null, id)} sources={sources} />
        </div>
      ) : (
        <EmptyState title="No questions to battle yet">
          Battles use this event&apos;s published tests that show answers.
        </EmptyState>
      )}
    </section>
  );
}
