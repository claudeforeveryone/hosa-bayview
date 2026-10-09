import { describe, expect, it } from "vitest";
import { layoutFor, pairsWith } from "@/components/match-game";
import type { StudyCard } from "@/components/study-session";

const card = (n: number, definition: string): StudyCard => ({ id: `c${n}`, term: `Term ${n}`, definition });

describe("pairsWith", () => {
  it("pairs a term with a definition cell whose text is equal", () => {
    expect(pairsWith(card(1, "Longest bone"), card(2, "Longest bone"))).toBe(true);
  });

  it("does not pair different definitions", () => {
    expect(pairsWith(card(1, "Longest bone"), card(2, "Shin bone"))).toBe(false);
  });

  it("counts a duplicate definition on another card as the right answer", () => {
    // Two cards share a definition; picking either definition cell for the first term is correct.
    const first = card(1, "Muscle");
    const duplicate = card(2, "Muscle");
    expect(pairsWith(first, duplicate)).toBe(true);
  });
});

describe("layoutFor", () => {
  const cards = Array.from({ length: 25 }, (_, i) => card(i, `Def ${i}`));

  it("is the same for the same seed and round, so the server and client agree", () => {
    expect(layoutFor(cards, "seed", 0)).toEqual(layoutFor(cards, "seed", 0));
  });

  it("changes between rounds", () => {
    expect(layoutFor(cards, "seed", 0).terms.map((c) => c.id)).not.toEqual(layoutFor(cards, "seed", 1).terms.map((c) => c.id));
  });

  it("takes at most ten cards, and terms and definitions use the same subset", () => {
    const { total, terms, defs } = layoutFor(cards, "seed", 0);
    expect(total).toBe(10);
    expect(terms).toHaveLength(10);
    expect(defs).toHaveLength(10);
    expect(new Set(terms.map((c) => c.id))).toEqual(new Set(defs.map((c) => c.id)));
  });

  it("handles a deck smaller than a round", () => {
    const small = cards.slice(0, 3);
    const { total, terms } = layoutFor(small, "seed", 0);
    expect(total).toBe(3);
    expect(terms).toHaveLength(3);
  });
});
