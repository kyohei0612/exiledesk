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
  /**
   * ベースの付与スキル (不在のアミュレットなど候補から 1 つ付くベースだけ。i18n/inherent-skills.json)。取引所では付与スキルで
   * 別物になるので、検索に入れる (オーナー 2026-09-27「つけるもの選べるようにしないと検索で出ないぞ」)。null = 問わない
   */
  grantedSkill: null as string | null,
});

/** 検索に入れる付与スキル: 貼り付けがあればその付与スキル、ベースから選ぶ道なら選んだ物 */
export function grantedSkillFor(item: { grantedSkill: string | null } | null | undefined): string | null {
  return item ? item.grantedSkill : zeroStart.value.grantedSkill;
}
