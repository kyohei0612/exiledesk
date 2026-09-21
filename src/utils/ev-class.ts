/**
 * ev-class.ts — 損益の色 (2026-09-21)
 *
 * プラス = 緑 / マイナス = 赤 / 不明 = 灰。
 * 同じ 4 行がジェムコラプト・規格外 (2 か所)・アドニアに写してあったので 1 つにまとめた。
 */
export function evClass(v: number | null | undefined): string {
  if (v == null) return "text-[var(--exile-color-text-tertiary)]";
  return v > 0 ? "text-emerald-300" : v < 0 ? "text-red-300" : "";
}
