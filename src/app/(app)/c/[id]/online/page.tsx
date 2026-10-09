import { EmptyState } from "@/components/empty-state";
import { OnlineList } from "@/components/online-list";
import { getOnline } from "@/lib/activity-data";
import { requireProfile } from "@/lib/auth";

// Who's in this classroom right now: seen in the last two minutes on a page for this room.
export default async function OnlineTab(props: PageProps<"/c/[id]/online">) {
  const { id } = await props.params;
  const [me, rows] = await Promise.all([requireProfile(), getOnline(id)]);
  if (!rows.length) return <EmptyState title="Nobody's on right now" />;
  return <OnlineList rows={rows} meId={me.id} />;
}
