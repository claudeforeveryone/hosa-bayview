// Names given to blank items created in one tap. The editor focuses the title while it still has one.
export const UNTITLED_TEST = "Untitled test";
export const UNTITLED_DECK = "Untitled deck";

export function isUntitled(title: string, placeholder: string) {
  return title.trim() === placeholder;
}
