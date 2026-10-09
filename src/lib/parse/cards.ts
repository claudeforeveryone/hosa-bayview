// Bulk paste for flashcards. One card per line, split on the first separator found:
//   term<TAB>definition
//   term - definition   (also en dash –)
//   term — definition   (em dash)
//   term: definition
// Every non-blank line comes back: good ones as items, bad ones as errors the preview can show.

export type ParsedCard = { line: number; term: string; definition: string };
export type CardError = { line: number; text: string; message: string };
export type ParsedCards = { items: ParsedCard[]; errors: CardError[] };

export const TERM_MAX = 500;
export const DEFINITION_MAX = 2000;
export const MAX_CARDS_PER_PASTE = 300;

const SEPARATORS: RegExp[] = [
  /\t/, // tab (spreadsheet paste)
  /\s[—–-]\s/, // spaced em dash, en dash or hyphen
  /:\s*/, // colon
];

// The earliest separator wins, so "Time: 3 - 4 pm" splits at the colon.
function split(line: string): [string, string] | null {
  let best: RegExpExecArray | null = null;
  for (const sep of SEPARATORS) {
    const m = sep.exec(line);
    if (m && (!best || m.index < best.index)) best = m;
  }
  if (!best) return null;
  return [line.slice(0, best.index), line.slice(best.index + best[0].length)];
}

export function parseCards(text: string): ParsedCards {
  const items: ParsedCard[] = [];
  const errors: CardError[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const number = i + 1;
    const parts = split(line);
    if (!parts) {
      errors.push({ line: number, text: line, message: "No separator. Use a tab, ' - ', ' — ' or a colon." });
      return;
    }
    const term = parts[0].trim();
    const definition = parts[1].trim();
    if (!term) {
      errors.push({ line: number, text: line, message: "The term is empty." });
    } else if (!definition) {
      errors.push({ line: number, text: line, message: "The definition is empty." });
    } else if (term.length > TERM_MAX) {
      errors.push({ line: number, text: line, message: `Keep terms under ${TERM_MAX} characters.` });
    } else if (definition.length > DEFINITION_MAX) {
      errors.push({ line: number, text: line, message: `Keep definitions under ${DEFINITION_MAX} characters.` });
    } else {
      items.push({ line: number, term, definition });
    }
  });

  return { items, errors };
}
