// Paging for the long boards: 20 members a page, so a chapter-sized board stays short on a phone. Pure, so it tests
// apart from the component.
export const BOARD_PAGE_SIZE = 20;

export function pageCount(total: number, size = BOARD_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

// Keeps a page number inside 1..pageCount.
export function clampPage(page: number, total: number, size = BOARD_PAGE_SIZE): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), pageCount(total, size));
}

// The rows on one page (1-based).
export function pageSlice<T>(rows: readonly T[], page: number, size = BOARD_PAGE_SIZE): T[] {
  const p = clampPage(page, rows.length, size);
  return rows.slice((p - 1) * size, p * size);
}

// The page a row sits on, or null when it isn't on the board.
export function pageOfIndex(index: number, size = BOARD_PAGE_SIZE): number | null {
  return index < 0 ? null : Math.floor(index / size) + 1;
}

// Page numbers to show as buttons: the first, the last, and the current one with a neighbour each side, with
// null standing for a gap ("1 … 4 5 6 … 12"). Seven or fewer pages are all shown.
export function pageButtons(current: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const keep = new Set([1, count, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (current >= count - 2) [count - 3, count - 2, count - 1].forEach((n) => keep.add(n));
  const pages = [...keep].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}
