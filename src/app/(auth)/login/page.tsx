import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { DemoAdmins } from "./demo-admins";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  const notice =
    sp.link === "expired"
      ? "That link expired or was already used. Log in, or ask for a new reset link."
      : sp.account === "missing"
        ? "That account no longer exists. Ask an executive if you think this is a mistake."
        : null;

  // Empty unless an exec has demo sign-in switched on.
  const supabase = await createClient();
  const { data: demo } = await supabase.rpc("demo_logins");
  const people = (demo ?? []) as { slug: string; full_name: string }[];

  return (
    <div className="grid gap-10">
      {people.length ? <DemoAdmins people={people} /> : null}
      <LoginForm next={next} notice={notice} />
    </div>
  );
}
