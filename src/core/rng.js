/** Small deterministic random helpers (same seed -> same city every time). */

/** mulberry32 PRNG: returns a function producing floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash any number of integers/strings into a 32-bit seed. */
export function hash(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

export const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
export const range = (r, a, b) => a + r() * (b - a);
export function weighted(r, items, weightOf = (x) => x.weight ?? 1) {
  let total = 0;
  for (const it of items) total += weightOf(it);
  let t = r() * total;
  for (const it of items) if ((t -= weightOf(it)) <= 0) return it;
  return items[items.length - 1];
}
