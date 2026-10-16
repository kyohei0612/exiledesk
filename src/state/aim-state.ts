/**
 * aim-state.ts — エミュレーターの「狙う」と MOD 一覧の開き方の状態。state/craft-stage.ts から分けた (2026-10-16、500 行の決まり)。
 * 画面からは今まで通り craftStage.aims などで触る
 */
import { ref } from "vue";

/**
 * エミュレーターの「狙う」(2026-10-09): 狙う MOD (その段以上)。最大 6 つ (2026-10-16 にカオススパムに合わせて 4 → 6)、全部揃えば当たり。
 * 棚の上に打ち方ごとの揃う確率を出す (StageAimPanel.vue)
 */
/** at = 押した段の印 (MOD 一覧の data-aim-at。確率の一覧の「＋ 足す」でそこへ戻る) */
export const aims = ref<Array<{ modId: string; minTierIndex: number; label: string; at?: string }>>([]);
/** 狙いの数 (2026-10-16 カオススパムモードに合わせて 4 → 6。オーナーのメモ「MOD を選ぶ (複数でも可) 最高 6 MOD」) */
export const AIM_MAX = 6;
export type AimPick = { modId: string; minTierIndex: number; label: string; at?: string };
/**
 * 「次の手で狙う」の選ぶ窓 (StageAimPicker.vue)。seed = 押した段 (最初からチェックが入る)。null = 閉じている
 * (2026-10-09 オーナー「押したらチェックボックスで複数狙えるように別でポップアップ、選択しなくて単体でも進めるように」)
 */
/** 狙う MOD を選ぶ窓。spam = カオススパム計算機の狙い (spamAims) を選ぶ */
export const aimPicker = ref<{ seed: AimPick | null; spam?: boolean } | null>(null);
/** カードの MOD を押した: MOD の一覧のその行まで飛ぶ (StageModList が見る。n は同じ MOD を続けて押しても動くように) */
export const modJump = ref<{ modId: string; n: number } | null>(null);
/** MOD 一覧を画面いっぱいの重ね (後ろを暗く) で開いている (2026-10-11 オーナー「MOD 一覧は飛ばずに全部画面に出して、閉じる・Tab でいつでも」) */
export const modOverlay = ref(false);
