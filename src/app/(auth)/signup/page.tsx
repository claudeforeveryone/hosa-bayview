import type { Metadata } from "next";
import { SiteJsonLd } from "@/components/site-json-ld";
import { readChapterGate } from "@/lib/chapter-code";
import { publicPage } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "./form";

export const metadata: Metadata = publicPage({
  title: "Join the chapter: make your member account",
  description:
    "Make your free HOSA Bayview member account to join your event's classroom, practise past competition tests and flashcards, and track your study time.",
  path: "/signup",
});

// The chapter code field shows only while an executive has set one. A failed lookup just hides it: the action
// checks again and brings the field back if a gate is on.
async function chapterGate() {
  try {
    return (await readChapterGate(await createClient())) === true;
  } catch (e) {
    console.error("[signup]", (e as Error).message);
    return false;
  }
}

export default async function Page() {
  return (
    <>
      <SignupForm chapterGate={await chapterGate()} />
      <SiteJsonLd />
    </>
  );
}
