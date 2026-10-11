import type { Metadata } from "next";
import { SiteJsonLd } from "@/components/site-json-ld";
import { publicPage } from "@/lib/seo";
import { LoginForm } from "./login-form";

// For a guest this is the front door (the home page sends them here), so it carries the site's search snippet.
export const metadata: Metadata = publicPage({
  title: "Log in to practise for HOSA events",
  description:
    "Log in to HOSA Bayview, the chapter's study site: practice tests from past competition papers, flashcards, event classrooms and leaderboards.",
  path: "/login",
});

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  const notice =
    sp.link === "expired"
      ? "That link expired or was already used. Log in, or ask for a new reset link."
      : sp.account === "missing"
        ? "That account no longer exists. Ask an executive if you think this is a mistake."
        : null;

  return (
    <>
      <LoginForm next={next} notice={notice} />
      <SiteJsonLd />
    </>
  );
}
