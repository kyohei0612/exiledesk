/**
 * format.ts — アドニアの賭けの画面で使う表示の小物 (確率の %)
 * Overquality.vue から切り出し (2026-09-26)。中身は変えていない。
 */
export function pct(p: number): string {
  return `${(p * 100).toFixed(p * 100 >= 10 ? 1 : 2)}%`;
}
