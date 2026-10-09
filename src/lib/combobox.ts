// Pure pieces of the combobox so the keyboard logic can be tested without a DOM.

export function filterOptions(options: string[], query: string, typed: boolean): string[] {
  const q = query.trim().toLowerCase();
  if (!typed || !q) return options;
  return options.filter((o) => o.toLowerCase().includes(q));
}

// Arrow keys wrap around. From "nothing highlighted", down goes to the first option and up to the last.
export function nextIndex(active: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (active < 0 || active >= count) return delta === 1 ? 0 : count - 1;
  return (active + delta + count) % count;
}
