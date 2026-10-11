import { redirect } from "next/navigation";

// Help moved into Settings; old links and bookmarks land on its tab.
export default function HelpPage() {
  redirect("/settings?tab=help");
}
