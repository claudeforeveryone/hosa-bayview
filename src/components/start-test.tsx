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
  allowPractice = true,
  attemptsLeft = null,
  openModes = [],
}: {
  classroomId: string;
  testId: string;
  timeLimit: number | null;
  hasQuestions: boolean;
  allowPractice?: boolean;
  // Null means unlimited; otherwise scored attempts still open to you.
  attemptsLeft?: number | null;
  // Runs you started and didn't hand in: the button picks them back up (the server resumes the open run).
  openModes?: ("timed" | "practice")[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"timed" | "practice" | null>(null);
  const [pending, start] = useTransition();

  if (!hasQuestions)
    return <FormMessage tone="error">No questions yet.</FormMessage>;

  const go = (m: "timed" | "practice") => {
    setError(null);
    setMode(m);
    start(async () => {
      const result = await startAttempt(classroomId, testId, m);
      if (result?.error) setError(result.error);
    });
  };

  // The scored run is timed when there's a time limit, practice otherwise.
  const outOfAttempts = attemptsLeft === 0;
  const timedOut = outOfAttempts && Boolean(timeLimit);
  const practiceOut = outOfAttempts && !timeLimit;
  // A capped timed test keeps its questions hidden until the scored runs are used, so practice can't preview it.
  const practiceLocked =
    Boolean(timeLimit) && attemptsLeft !== null && attemptsLeft > 0;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        {timeLimit ? (
          <Button
            type="button"
            onClick={() => go("timed")}
            disabled={pending || timedOut}
          >
            <Timer size={20} strokeWidth={1.75} aria-hidden />
            {pending && mode === "timed"
              ? "Starting"
              : openModes.includes("timed")
                ? "Resume timed"
                : `Timed · ${timeLimit} min`}
          </Button>
        ) : null}
        {allowPractice ? (
          <Button
            type="button"
            variant={timeLimit ? "line" : "solid"}
            onClick={() => go("practice")}
            disabled={pending || practiceOut || practiceLocked}
          >
            <Play size={20} strokeWidth={1.75} aria-hidden />
            {pending && mode === "practice"
              ? "Starting"
              : openModes.includes("practice")
                ? "Resume practice"
                : "Practice"}
          </Button>
        ) : null}
      </div>
      {attemptsLeft !== null ? (
        <p className="caps num text-15 text-ink-2">
          {attemptsLeft === 0
            ? "No attempts left"
            : `${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left`}
        </p>
      ) : null}
      {allowPractice && practiceLocked ? (
        <p className="text-15 text-ink-2">
          Practice opens once you&apos;ve used your timed attempts.
        </p>
      ) : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    </div>
  );
}
