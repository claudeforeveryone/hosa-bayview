import { redirect } from "next/navigation";

// Blank tests are made from the Tests tab in one tap; this old form URL just lands there.
export default async function NewTestPage({ params }: PageProps<"/c/[id]/tests/new">) {
  const { id } = await params;
  redirect(`/c/${id}/tests`);
}
