import type { Metadata } from "next";
import Link from "next/link";
import { ClassicLogo } from "@/components/classic-logo";

export const metadata: Metadata = { title: "Not found" };

// An address that matches no page at all. It renders outside the app shell (no sidebar), so it carries the
// logo itself and one way back; Home sends a signed-out visitor to the sign-in page.
export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center justify-items-start gap-5 px-4 py-12 sm:px-8">
      <ClassicLogo className="h-[96px]" />
      <h1 className="font-display text-[clamp(2.75rem,10vw,5rem)] leading-[0.92] font-bold uppercase">
        Not here
      </h1>
      <p className="max-w-[50ch] text-ink-2">
        That page doesn&rsquo;t exist. The link may be old or mistyped.
      </p>
      <Link
        href="/"
        className="caps step inline-flex h-12 items-center bg-ink px-6 text-17 text-ground hover:bg-ink-2"
      >
        Back home
      </Link>
    </main>
  );
}
