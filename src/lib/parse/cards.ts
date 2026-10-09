// Bulk paste for flashcards. One card per line, split on the first separator the line has, in this order:
//   term<TAB>definition           (spreadsheet paste)
//   term - definition             (also en dash – and em dash —, spaces on both sides)
//   term: definition              (colon with a space or the end of the line after it)
// Times like 9:30 and ratios like 3:1 are not split. Every non-blank line comes back:
// good ones as items, bad ones as errors the preview can show.

export type ParsedCard = { line: number; term: string; definition: string };
export type CardError = { line: number; text: string; message: string };
export type ParsedCards = { items: ParsedCard[]; errors: CardError[] };

export const TERM_MAX = 500;
export const DEFINITION_MAX = 2000;
export const MAX_CARDS_PER_PASTE = 300;

const SEPARATORS: RegExp[] = [
  /\t/, // tab (spreadsheet paste)
  /\s[—–-]\s/, // spaced em dash, en dash or hyphen
  /:(?=\s|$)/, // colon followed by whitespace or the end of the line
];

// The first separator type that appears wins; within it, the first occurrence splits.
function split(line: string): [string, string] | null {
  for (const sep of SEPARATORS) {
    const m = sep.exec(line);
    if (m) return [line.slice(0, m.index), line.slice(m.index + m[0].length)];
  }
  return null;
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
