"use client";

import { useState } from "react";
import { PasteImport } from "@/components/paste-import";
import { QuestionBuilder } from "@/components/question-builder";
import type { AddManyFn, AddOneFn } from "@/components/questions-editor";

// One question at a time, or a whole past test pasted in.
export function AddQuestions({
  testId,
  addOne,
  addMany,
  unsaved,
  nextNumber,
}: {
  testId: string;
  addOne: AddOneFn;
  addMany: AddManyFn;
  // Single adds kept in the list after a failed save. A paste waits until they are sorted, to keep the order.
  unsaved: number;
  nextNumber: number;
}) {
  const [mode, setMode] = useState<"write" | "paste">("write");
  return (
    <div className="grid gap-5">
      <div
        role="group"
        aria-label="How to add"
        className="flex justify-self-start border border-ink"
      >
        {(
          [
            ["write", "Write one"],
            ["paste", "Paste many"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={`caps step h-11 px-5 text-[15px] not-first:border-l not-first:border-ink ${
              mode === value ? "bg-ink text-ground" : "hover:bg-band"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "write" ? (
        <QuestionBuilder testId={testId} add={addOne} nextNumber={nextNumber} />
      ) : (
        <PasteImport testId={testId} add={addMany} unsaved={unsaved} />
      )}
    </div>
  );
}
