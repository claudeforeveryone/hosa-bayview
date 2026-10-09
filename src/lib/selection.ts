// Turns a text selection in a question into a flashcard term, and the correct answer into its definition.
export const TERM_LIMIT = 500;
export const DEFINITION_LIMIT = 2000;

// Collapses whitespace. Null when nothing is left, or when it's too long to be one card term.
export function cleanSelection(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t || t.length > TERM_LIMIT) return null;
  return t;
}

// The sheet opens with the term from the selection and the definition from the right answer, both editable.
export function prefillCard(
  selection: string,
  answer: string | null,
): { term: string; definition: string } {
  const definition = (answer ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DEFINITION_LIMIT);
  return { term: cleanSelection(selection) ?? "", definition };
}
