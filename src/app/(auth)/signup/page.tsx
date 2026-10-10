import type { Metadata } from "next";
import { readChapterGate } from "@/lib/chapter-code";
import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "./form";

export const metadata: Metadata = { title: "Make an account" };

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
  return <SignupForm chapterGate={await chapterGate()} />;
}
