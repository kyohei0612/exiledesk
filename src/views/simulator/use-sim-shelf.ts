/**
 * use-sim-shelf.ts — シミュの画面で見本のアイテムにクラフト台の棚 (CurrencyShelf) を出す時の共通の部品 (2026-10-22 code-audit 2 節。
 * 木の手を選ぶ TreeHandShelf・シミュのクイズ StageQuizEditor の写しをまとめた。ツリーの試し打ち TreeTrial は 10-22 に消した)。
 * provideShelf で見本を棚に渡し、打てるか (当たり所で弾かれるだけの物は打てる扱い、オーナーの方針 2026-10-12) とお告げの付け外しを決める。
 * 持つ / 離すはクラフト台と同じ: 同じ物をもう一度押す・棚の空いている所を押す = 離す (お告げも外す、オーナー 10-22)
 */
import { ref, type Ref } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { provideShelf, simHidden } from "../../state/emulator/shelf-context";
import { applyCurrency, mulberry32, type StageItem } from "../../services/craft-stage/engine";
import { tr } from "../../i18n/lang";

export function useSimShelf(item: Ref<StageItem | null>, held: Ref<string | null> = ref(null), omens: Ref<string[]> = ref([])) {
  function toggleOmen(id: string): void { omens.value = omens.value.includes(id) ? omens.value.filter((o) => o !== id) : [...omens.value, id]; }
  function release(): void { held.value = null; omens.value = []; }
  function onHold(k: string): void { if (held.value === k) release(); else held.value = k; }
  /** 棚の空いている所を押す = 離す (ボタン・入力・お告げの欄の中は除く) */
  function onShelfDown(e: PointerEvent): void { if (held.value && !(e.target as HTMLElement).closest("button,input,select,label,[data-held-box]")) release(); }
  provideShelf({
    data: s.data, item, omens, held,
    usable: (k) => {
      const d = s.data.value, it = item.value;
      if (!d || !it) return tr("準備中", "Loading");
      const r = applyCurrency(d, it, k, mulberry32(0), omens.value);
      return r.applied || r.random ? null : (r.reason ?? tr("打てない", "Can't use"));
    },
    toggleOmen,
    hidden: simHidden,
  });
  return { held, omens, toggleOmen, release, onHold, onShelfDown };
}
