"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/form";

// A page inside the app failed to load. This sits under the app layout, so the sidebar and bottom bar stay and
// the member can go somewhere else instead of being stuck on a bare error screen.
export default function AppPageError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid justify-items-start gap-5 py-10">
      <h1 className="font-display text-[clamp(2.75rem,10vw,5rem)] leading-[0.92] font-bold uppercase">
        Couldn&rsquo;t load that
      </h1>
      <p className="max-w-[50ch] text-ink-2">
        The server didn&rsquo;t answer. Check your connection and try again.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => retry()}>Try again</Button>
        <Link
          href="/"
          className="caps step inline-flex h-12 items-center border border-ink px-6 text-17 hover:bg-band"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
