import { redirect } from "next/navigation";

// Who's online now shows on the People tab.
export default async function OnlineTab(props: PageProps<"/c/[id]/online">) {
  const { id } = await props.params;
  redirect(`/c/${id}/members`);
}
