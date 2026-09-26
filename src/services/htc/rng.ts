/**
 * rng.ts — 決まった種の乱数 (回すたびに同じ分布になるように)
 *
 * シミュレーター ([[sim-route.ts]]) と作り方のツリーで共通に使う。
 */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
