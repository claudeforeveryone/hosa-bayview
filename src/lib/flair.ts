// Board name tint and flair (0294). Pure helpers, no server imports.

// What someone is in the chapter, for the tint of their name on a board. Developer wins over executive.
export const BOARD_KINDS = ["developer", "executive", "trainer", "member"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];

export const BOARD_KIND_LABEL: Record<BoardKind, string> = {
  developer: "Developer",
  executive: "Exec",
  trainer: "Trainer",
  member: "Member",
};

// The text colour class for each kind: one faint blue for everyone who runs something, so no role outranks
// another on the board. Members keep the plain ink.
export const BOARD_KIND_TEXT: Record<BoardKind, string> = {
  developer: "text-role-staff",
  executive: "text-role-staff",
  trainer: "text-role-staff",
  member: "",
};

export const asBoardKind = (value: unknown): BoardKind =>
  typeof value === "string" && (BOARD_KINDS as readonly string[]).includes(value)
    ? (value as BoardKind)
    : "member";

export const FLAIR_MAX = 20;

// The same rule as profiles_flair_check: letters, numbers, single spaces and a little punctuation, no emoji.
const ALLOWED = /^[A-Za-z0-9 .,'&+#/!?-]+$/;

// Blank clears the flair. Spaces inside collapse to one, so a stray double space isn't an error.
export function parseFlair(
  value: unknown,
): { flair: string | null } | { error: string } {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) return { flair: null };
  if ([...text].length > FLAIR_MAX)
    return { error: `Keep it to ${FLAIR_MAX} characters.` };
  if (!ALLOWED.test(text))
    return { error: "Use letters, numbers, spaces and . , ' & + # / ! ? - only." };
  return { flair: text };
}
