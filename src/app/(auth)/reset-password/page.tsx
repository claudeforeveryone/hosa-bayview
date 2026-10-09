import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ResetForm } from "./form";

export const metadata: Metadata = { title: "New password" };

// Names the account, so a reset link opened on someone else's phone can't be mistaken for your own.
export default async function Page() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return <ResetForm email={data.user?.email ?? null} />;
}
