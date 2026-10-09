// Stable shuffles: the same seed always gives the same order, so a reload mid-test
// doesn't reshuffle the questions or the choices under the student.

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32
function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Returns a permutation of 0..n-1: order[i] is the original index shown in position i.
export function permutation(n: number, seed: string): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const next = rng(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Orders items by a per-item seeded key, so adding or removing one item never reshuffles the rest.
export function orderBy<T>(items: T[], seed: string, key: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, k: hash(`${seed}:${key(item)}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.item);
}
