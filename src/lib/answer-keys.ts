// Keyboard answering for multiple-choice surfaces (timed tests, practice, battles) and flashcard study.
// Pure, so the rules are unit tested; src/hooks/use-answer-keys.ts wires them to the page.
//
// 1-5 and A-E pick a choice (the position on screen, so a shuffled test still reads 1 to 4 top down).
// Left and Right move to the previous or next question. Enter and Space act on the page itself, never on a
// focused control, which already handles them with a native click. Nothing fires while typing, with Ctrl,
// Meta or Alt held, with Shift on an arrow (text selection), on a key repeat, or while a dialog is open.

export const KEYED_OPTIONS = 5;

const LETTER_KEYS = "abcde";
const ARROWS = new Set(["ArrowLeft", "ArrowRight"]);
const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const CONTROL_TAGS = new Set([
  "BUTTON",
  "A",
  "SUMMARY",
  "INPUT",
  "SELECT",
  "TEXTAREA",
]);
const CONTROL_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "tab",
  "menuitem",
  "option",
  "switch",
]);

export type KeyEventLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
};

// What the key landed on. Null when the event has no element (never in practice; fails safe).
export type KeyTarget = {
  tagName: string;
  isContentEditable: boolean;
  role: string | null;
} | null;

export type AnswerKeyContext = {
  // Choices the number and letter keys can pick. 0 when nothing is answerable right now (locked, or no options).
  options: number;
  // Whether a previous or next question exists to move to.
  prev: boolean;
  next: boolean;
  // Whether Enter and Space do something on this screen.
  enter: boolean;
  space: boolean;
  // A modal dialog (the add-to-flashcards sheet, a confirm) is open, so the page keeps its keys.
  dialogOpen: boolean;
  // The reader has text selected; arrows keep it instead of moving.
  selecting: boolean;
};

export type AnswerKeyAction =
  | { kind: "pick"; index: number }
  | { kind: "prev" }
  | { kind: "next" }
  | { kind: "enter" }
  | { kind: "space" };

export function isTypingTarget(target: KeyTarget): boolean {
  if (!target) return false;
  return (
    target.isContentEditable || TYPING_TAGS.has(target.tagName.toUpperCase())
  );
}

// A focused button, link or field keeps Enter and Space for its own native action.
export function isControlTarget(target: KeyTarget): boolean {
  if (!target) return false;
  return (
    CONTROL_TAGS.has(target.tagName.toUpperCase()) ||
    CONTROL_ROLES.has(target.role ?? "")
  );
}

// Which choice (0-based) a key picks among `options` choices, or null. Digits 1-5 and letters A-E, any case.
export function pickIndex(key: string, options: number): number | null {
  const count = Math.min(Math.max(options, 0), KEYED_OPTIONS);
  if (/^[1-5]$/.test(key)) {
    const i = Number(key) - 1;
    return i < count ? i : null;
  }
  if (key.length === 1) {
    const i = LETTER_KEYS.indexOf(key.toLowerCase());
    if (i >= 0 && i < count) return i;
  }
  return null;
}

export function answerAction(
  e: KeyEventLike,
  target: KeyTarget,
  ctx: AnswerKeyContext,
): AnswerKeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (ctx.dialogOpen || isTypingTarget(target)) return null;
  const arrow = ARROWS.has(e.key);
  // Holding a key repeats it: arrows may walk through questions, nothing else should repeat.
  if (e.repeat && !arrow) return null;

  if (arrow) {
    if (e.shiftKey || ctx.selecting) return null;
    if (e.key === "ArrowLeft") return ctx.prev ? { kind: "prev" } : null;
    return ctx.next ? { kind: "next" } : null;
  }

  const index = pickIndex(e.key, ctx.options);
  if (index !== null) return { kind: "pick", index };

  if (isControlTarget(target)) return null;
  if (e.key === "Enter") return ctx.enter ? { kind: "enter" } : null;
  if (e.key === " " || e.key === "Spacebar")
    return ctx.space ? { kind: "space" } : null;
  return null;
}

// The one-line hint: "Keys: 1-4 answer · ← → move". Empty when there is nothing to pick.
export function answerKeysLabel(options: number): string {
  const count = Math.min(Math.max(options, 0), KEYED_OPTIONS);
  if (count === 0) return "";
  return count === 1 ? "1 answer" : `1-${count} answer`;
}

export function keysLine(...parts: string[]): string {
  const shown = parts.filter((p) => p.length > 0);
  return shown.length ? `Keys: ${shown.join(" · ")}` : "";
}
