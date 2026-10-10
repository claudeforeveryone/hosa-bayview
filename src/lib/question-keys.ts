// Keyboard rules for writing one question: Enter walks down the choices (adding one at the end), Backspace in an
// empty choice removes it, Alt or Option plus 1 to 5 marks the right one, Ctrl or Cmd plus Enter saves.

import { MAX_CHOICES, MIN_CHOICES } from "@/lib/question-rules";

export type KeyLike = {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

export function isSaveKey(e: KeyLike): boolean {
  return e.key === "Enter" && (e.ctrlKey || e.metaKey);
}

export function choiceKey(
  e: KeyLike,
  at: { index: number; count: number; value: string },
): "next" | "add" | "explanation" | "remove" | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  if (e.key === "Enter") {
    if (at.index < at.count - 1) return "next";
    return at.count < MAX_CHOICES ? "add" : "explanation";
  }
  if (e.key === "Backspace" && at.value === "" && at.count > MIN_CHOICES)
    return "remove";
  return null;
}

// Which choice (0-based) a key marks right, or null. Reads the key's position (code), not the character, because
// Option plus 1 on a Mac types a symbol. A plain digit only counts on the letter buttons themselves.
export function markKey(
  e: KeyLike,
  at: { count: number; onMark: boolean },
): number | null {
  if (e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (!e.altKey && !at.onMark) return null;
  const m = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
  if (!m) return null;
  const i = Number(m[1]) - 1;
  return i < at.count ? i : null;
}
