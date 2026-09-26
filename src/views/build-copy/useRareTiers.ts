/**
 * 忍者ビルドコピーのレアの段と数値の割合 (2026-09-26)
 *
 * オーナー:「アイテムの行に各 MOD とティア出して、ティアはいじれる様に」「各項目にティアを 1 つずつ下げる設定と、リセット」
 * 「上げるも一応ね」「ジュエルはティアじゃなくて数値に、割合で減らす感じで」。
 *   picked: 行の番号 → MOD の並び → tiers の添字 (大きいほど上の段)
 *   ratios: 行の番号 → 数値で条件にする行 (ジュエル・特殊な MOD) の下限の割合 (%、無ければ 100)
 */
import { reactive, type ShallowRef } from "vue";
import type { RareAnalysis } from "../../services/build-copy/rare-query";

const RATIO_STEP = 10;
const RATIO_MIN = 10;
const RATIO_MAX = 150;

export function useRareTiers(analyses: ShallowRef<Map<number, RareAnalysis>>) {
  const picked = reactive(new Map<number, Record<number, number>>());
  const ratios = reactive(new Map<number, number>());

  function pickTier(row: number, mod: number, tier: number): void {
    picked.set(row, { ...(picked.get(row) ?? {}), [mod]: tier });
  }
  /** 選べる段の中で 1 つ上 (dir = 1) / 下 (dir = -1) へ。端ならそのまま。数値の行は割合を 10% */
  function shift(row: number, dir: 1 | -1): void {
    const a = analyses.value.get(row);
    if (!a) return;
    if (a.lines.length) ratios.set(row, Math.min(RATIO_MAX, Math.max(RATIO_MIN, (ratios.get(row) ?? 100) + dir * RATIO_STEP)));
    if (!a.mods.length) return;
    const cur = picked.get(row) ?? {};
    const next: Record<number, number> = { ...cur };
    a.mods.forEach((m, k) => {
      const now = cur[k] ?? m.tier;
      const cand = m.options.map((o) => o.i).filter((i) => (dir < 0 ? i < now : i > now));
      if (cand.length) next[k] = dir < 0 ? Math.max(...cand) : Math.min(...cand);
    });
    picked.set(row, next);
  }
  /** 付いている段と 100% に戻す */
  function resetTiers(row: number): void {
    picked.delete(row);
    ratios.delete(row);
  }
  function clearTiers(): void {
    picked.clear();
    ratios.clear();
  }
  return {
    picked,
    ratios,
    pickTier,
    lowerTiers: (row: number) => shift(row, -1),
    raiseTiers: (row: number) => shift(row, 1),
    resetTiers,
    clearTiers,
  };
}
