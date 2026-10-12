import { describe, expect, it } from "vitest";
import { clampPage, pageButtons, pageCount, pageOfIndex, pageSlice } from "./board-pages";

describe("board pages", () => {
  it("counts 20 a page, with one page even when empty", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(21)).toBe(2);
    expect(pageCount(95)).toBe(5);
  });

  it("slices one page and clamps out-of-range pages", () => {
    const rows = Array.from({ length: 45 }, (_, i) => i);
    expect(pageSlice(rows, 1)).toEqual(rows.slice(0, 20));
    expect(pageSlice(rows, 3)).toEqual([40, 41, 42, 43, 44]);
    expect(pageSlice(rows, 9)).toEqual([40, 41, 42, 43, 44]);
    expect(clampPage(0, 45)).toBe(1);
    expect(clampPage(Number.NaN, 45)).toBe(1);
  });

  it("finds the page a row is on", () => {
    expect(pageOfIndex(0)).toBe(1);
    expect(pageOfIndex(19)).toBe(1);
    expect(pageOfIndex(20)).toBe(2);
    expect(pageOfIndex(-1)).toBeNull();
  });

  it("shows every page when there are few, gaps when there are many", () => {
    expect(pageButtons(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageButtons(1, 12)).toEqual([1, 2, 3, 4, null, 12]);
    expect(pageButtons(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(pageButtons(12, 12)).toEqual([1, null, 9, 10, 11, 12]);
  });
});
