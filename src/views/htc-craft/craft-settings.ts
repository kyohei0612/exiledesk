/**
 * craft-settings.ts — 作り方の設定 (2026-09-23)
 *
 * オーナー:「作り方の設定やった方が良いかもね」。スパムの組み立て・1 手ずつ・0 から組む道で共通に使う。
 *   - 予算 (既定 500 神。「基本的に 500 神以内にしてみよう、どこまでできるか」)
 *   - 1 手ずつで選んだ打ち方・リカバリー (「戻す手順も色んな選択肢から選べるように」)
 *   - 0 から組む時の品質と、固定済みの樹 MOD が使う枠 (貼り付けが無いので自分で決める)
 */
import { ref } from "vue";
import type { SpamTotal } from "../../services/htc/spam-total";

export const craftBudgetDivine = ref(500);

/** 選んだ打ち方・リカバリー (状態のキー → 手の名前)。無い状態は期待値で一番安い手。貼り直したら捨てる */
export const craftForce = ref<Record<string, string>>({});

/**
 * 固定済みの MOD が付いたベース (フラクチャー品) から始めるか。false なら無し品から、その MOD も作る
 * (オーナー 2026-09-24:「フラクチャー品かフラクチャー無し品かみたいなところは？」)
 */
export const startFractured = ref(true);

/**
 * 0 から組む時 (ベースから選ぶ道) の設定。貼り付けの時は貼り付けの値を使うので効かない。
 * 品質 40% = ブリーチのエッセンスで上限を上げる (プレにブリーチの MOD が 1 つ居る)
 */
export const zeroStart = ref({
  baseType: null as string | null,
  itemLevel: 82,
  quality: 20 as 20 | 40,
  /** 最後に上げる品質の種類 (mana など)。無ければ品質は上げない */
  qualityTag: null as string | null,
  /** 固定済みの樹 MOD (買う物) が使う枠 */
  fixedPrefix: 0,
  fixedSuffix: 0,
});

/** 段階ごとに「予算 (高貴換算) の内でそこまで行ける確率」と、その段階までの平均 */
export function reachWithin(total: SpamTotal, capExalted: number): Array<{ label: string; p: number; mean: number }> {
  return total.stages.map((st) => ({
    label: st.label,
    p: st.cum.filter((x) => x <= capExalted).length / Math.max(1, st.cum.length),
    mean: st.cum.reduce((a, b) => a + b, 0) / Math.max(1, st.cum.length),
  }));
}
