/**
 * use-sim-shelf.ts — シミュの画面で見本のアイテムにクラフト台の棚 (CurrencyShelf) を出す時の共通の部品 (2026-10-22 code-audit 2 節。
 * 木の手を選ぶ TreeHandShelf・シミュのクイズ StageQuizEditor の写しをまとめた。ツリーの試し打ち TreeTrial は 10-22 に消した)。
 * provideShelf で見本を棚に渡し、打てるか (当たり所で弾かれるだけの物は打てる扱い、オーナーの方針 2026-10-12) とお告げの付け外しを決める。
 * 持つ / 離すはクラフト台と同じ: 同じ物をもう一度押す・棚の空いている所を押す = 離す (お告げも外す、オーナー 10-22)
 */
import { ref, type Ref } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { provideShelf, simHidden } from "../../state/for-share/shelf-context";
import { useReason, type StageItem } from "../../services/craft-stage/engine";
import { CRAFT_RUNE_KEYS } from "../../state/for-share/craft-stage-shelf";
import { tr } from "../../i18n/lang";

/**
 * ツリーの棚だけで出さない物 (10-24 オーナー「要望があれば戻す」温度感。消さずに出さないだけ、戻す時はここ 1 か所):
 * 聖別 (聖別のお告げ。神のオーブと組む手) と、クラフトのルーン以外のルーン (ソウルコア・アイドル・遺産・効き目だけのルーン)。
 * ヒネコラの錠・鏡写しは前から共通の SIM_HIDDEN で出していない。エミュの棚は変えない
 */
export const TREE_HIDDEN = new Set(["OmenofSanctification"]);
export const treeHidden = (key: string): boolean => simHidden(key) || TREE_HIDDEN.has(key) || (key.startsWith("rune:") && !CRAFT_RUNE_KEYS.includes(key));

export function useSimShelf(item: Ref<StageItem | null>, held: Ref<string | null> = ref(null), omens: Ref<string[]> = ref([])) {
  function toggleOmen(id: string): void { omens.value = omens.value.includes(id) ? omens.value.filter((o) => o !== id) : [...omens.value, id]; }
  function release(): void { held.value = null; omens.value = []; }
  function onHold(k: string): void { if (held.value === k) release(); else held.value = k; }
  /** 棚の空いている所を押す = 離す (ボタン・入力・お告げの欄の中は除く) */
  function onShelfDown(e: PointerEvent): void { if (held.value && !(e.target as HTMLElement).closest("button,input,select,label,[data-held-box]")) release(); }
  function usableWith(k: string, om: readonly string[]): string | null {
    const d = s.data.value, it = item.value;
    return d && it ? useReason(d, it, k, om) : tr("準備中", "Loading");
  }
  provideShelf({
    data: s.data, item, omens, held,
    // 打てるかはエンジンの useReason (クラフト台の棚と同じ判定、10-23)。お告げを抜いた判定も渡す (掛けたお告げのせいで棚から消さない、クラフト台と同じ)
    usable: (k) => usableWith(k, omens.value),
    usableBare: (k) => usableWith(k, []),
    toggleOmen,
    hidden: treeHidden,
  });
  return { held, omens, toggleOmen, release, onHold, onShelfDown };
}
