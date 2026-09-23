/**
 * budget.ts — クラフトの予算 (神)。スパムの組み立てと「1 手ずつ」で同じ値を使う (2026-09-23)
 *
 * 既定 500 神 (オーナー 2026-09-23:「基本的に 500 神以内にしてみよう、どこまでできるか」)。
 */
import { ref } from "vue";
import type { SpamTotal } from "../../services/htc/spam-total";

export const craftBudgetDivine = ref(500);

/**
 * 「1 手ずつ」で選んだ打ち方・リカバリー (状態のキー → 手の名前)。無い状態は期待値で一番安い手
 * (オーナー 2026-09-23:「戻す手順も色んな選択肢から選べるようにしたい」)。貼り直したら捨てる
 */
export const craftForce = ref<Record<string, string>>({});

/** 段階ごとに「予算 (高貴換算) の内でそこまで行ける確率」と、その段階までの平均 */
export function reachWithin(total: SpamTotal, capExalted: number): Array<{ label: string; p: number; mean: number }> {
  return total.stages.map((st) => ({
    label: st.label,
    p: st.cum.filter((x) => x <= capExalted).length / Math.max(1, st.cum.length),
    mean: st.cum.reduce((a, b) => a + b, 0) / Math.max(1, st.cum.length),
  }));
}
