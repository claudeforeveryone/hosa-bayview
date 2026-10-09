import type { Metadata } from "next";
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

  return <LoginForm next={next} notice={notice} />;
}
