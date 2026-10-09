"use client";

import { useEffect } from "react";
import { Button } from "@/components/form";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto grid max-w-xl gap-5 px-4 py-16 sm:px-8">
      <h1 className="font-display text-[44px] leading-none font-bold uppercase">Couldn&rsquo;t load that</h1>
      <p className="text-ink-2">The server didn&rsquo;t answer. Check your connection and try again in a moment.</p>
      <div>
        <Button onClick={retry}>Try again</Button>
      </div>
    </main>
  );
}
