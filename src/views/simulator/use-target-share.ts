/**
 * use-target-share.ts — ② 狙う MOD の確率の % (付きやすさ・注記・貼った物の品質の断り)。StageTargetSummary.vue から分けた (2026-10-20 R3)。中身は前のまま
 */
import { computed } from "vue";
import { craftStage } from "../../state/craft-stage";
import { fmtPct } from "../../utils/format-pct";
import { tr } from "../../i18n/lang";
import { simPasted } from "../../state/simulator/sim-state";
import { targetShare } from "../../services/simulator/target-share";

export function useTargetShare(editable: () => boolean) {
  const s = craftStage;
  /** 付きやすさ (その段以上が、同じ側の 1 回の抽選で出る割合。エンジンの入口の 1 手の確率から、services/simulator/target-share.ts) */
  function shareOf(modId: string, minTierIndex: number): number | null {
    const d = s.data.value, it = s.item.value;
    return d && it ? targetShare(d, it.base, s.itemLevel.value, modId, minTierIndex) : null;
  }
  /** 確率の % (2026-10-10 動きの揃え 5: 書き方は utils/format-pct.ts の 1 つ) */
  const pct = (x: number): string => fmtPct(x);
  /** 貼った物の品質で盛られた値の断り (品質の種類がある時だけ) */
  const pastedQuality = computed(() => {
    const p = simPasted.value;
    return p?.qualityLabel && p.quality ? tr(`貼った値は ${p.qualityLabel} +${p.quality}% で盛られている。ここの段の幅は素の値`, `Pasted values were boosted by ${p.qualityLabel} +${p.quality}%. The tier ranges here are unboosted`) : "";
  });
  /** % の注記: 何の割合か・どのアイテムレベルの数か */
  const shareNote = computed(() => {
    const lv = s.itemLevel.value;
    const from = simPasted.value?.ilvl === lv ? tr("貼ったアイテムの", "the pasted item's ") : "";
    const tail = editable() && !from ? tr("。③ でレベルを決めると変わる", "; changes when you set the level in step 3") : "";
    return tr(`% = 1 回付けた時に、その段以上が出る割合 (${from}アイテムレベル ${lv}${tail})`, `% = chance that one added mod is this tier or better (at ${from}item level ${lv}${tail})`);
  });


  return { shareOf, pct, pastedQuality, shareNote };
}
