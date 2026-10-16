/**
 * chaos-spam.ts (state) — カオススパム (2026-10-16)。
 *   - spamming: 回している最中の印。回している間は「次の手で狙う」の計算 (打つたびに数千回試す) を止める (止めないと 1 手ごとに出し直して重い)
 *   - spamKey: アイテムの下の「カオススパム計算機へ」で持っていたカオス (普通・上級・完全)。欄はこの種類で開く
 *   - spamPending: そのボタンを押した後、狙いが決まったら欄へ送る
 *   - spamAims: 計算機の狙う MOD。「次の手で狙う」(craftStage.aims) とは別に持つ (2026-10-16 オーナー「カオススパム計算機と狙うは別ルートとして扱って」)
 */
import { ref } from "vue";

export const spamming = ref(false);
/**
 * 計算機が打った手 (工程の 1 手ずつ)。使われ方の数え (src/web/track.ts の手数・ベース・カレンシー) に入れない
 * (2026-10-16 オーナー「計算機のカオススパムの回数はカウントしちゃだめ、計算機オンリーで何回使用みたいな感じで」)。計算機は回した回数 (spam:run) で別に数える
 */
export const spamSteps = new WeakSet<object>();
export const spamKey = ref<string | null>(null);
export const spamPending = ref(false);
/** 計算機の狙う MOD (「次の手で狙う」とは別) */
export const spamAims = ref<Array<{ modId: string; minTierIndex: number; label: string }>>([]);
/** 計算機を外から閉じる (棚の覆いの「計算機を閉じる」)。印と狙いを外すと StageChaosSpam が結果・戻す所を片付ける */
export function closeChaosSpam(): void {
  if (spamming.value) return;
  spamKey.value = null;
  spamAims.value = [];
}
