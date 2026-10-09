"use client";

import { useState, useTransition } from "react";
import { Play, Timer } from "lucide-react";
import { startAttempt } from "@/app/(app)/c/[id]/tests/actions";
import { Button, FormMessage } from "@/components/form";

export function StartTest({
  classroomId,
  testId,
  timeLimit,
  hasQuestions,
}: {
  classroomId: string;
  testId: string;
  timeLimit: number | null;
  hasQuestions: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"timed" | "practice" | null>(null);
  const [pending, start] = useTransition();

  if (!hasQuestions) return <FormMessage tone="error">No questions yet.</FormMessage>;

  const go = (m: "timed" | "practice") => {
    setError(null);
    setMode(m);
    start(async () => {
      const result = await startAttempt(classroomId, testId, m);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        {timeLimit ? (
          <Button type="button" onClick={() => go("timed")} disabled={pending}>
            <Timer size={20} strokeWidth={1.75} aria-hidden />
            {pending && mode === "timed" ? "Starting" : `Timed · ${timeLimit} min`}
          </Button>
        ) : null}
        <Button type="button" variant={timeLimit ? "line" : "solid"} onClick={() => go("practice")} disabled={pending}>
          <Play size={20} strokeWidth={1.75} aria-hidden />
          {pending && mode === "practice" ? "Starting" : "Practice"}
        </Button>
      </div>
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </div>
  );
}
