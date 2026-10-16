/**
 * chaos-spam.ts (state) — カオススパム (2026-10-16)。
 *   - spamming: 回している最中の印。回している間は「次の手で狙う」の計算 (打つたびに数千回試す) を止める (止めないと 1 手ごとに出し直して重い)
 *   - spamKey: アイテムの下の「カオススパム確率機へ」で持っていたカオス (普通・上級・完全)。欄はこの種類で開く
 *   - spamPending: そのボタンを押した後、狙いが決まったら欄へ送る
 *   - spamAims: 確率機の狙う MOD。「次の手で狙う」(craftStage.aims) とは別に持つ (2026-10-16 オーナー「カオススパム確率機と狙うは別ルートとして扱って」)
 */
import { ref } from "vue";

export const spamming = ref(false);
export const spamKey = ref<string | null>(null);
export const spamPending = ref(false);
/** 確率機の狙う MOD (「次の手で狙う」とは別) */
export const spamAims = ref<Array<{ modId: string; minTierIndex: number; label: string }>>([]);
