/**
 * craft-settings.ts — 作り方の設定 (2026-09-23)
 *
 * 0 から組む時 (ベースから選ぶ道) の品質と、固定済みの樹 MOD が使う枠 (貼り付けが無いので自分で決める)。
 */
import { ref } from "vue";

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
