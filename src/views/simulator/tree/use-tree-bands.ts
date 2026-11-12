/**
 * use-tree-bands.ts — 削減の手前の枠を 1 つの箱 + 下の帯で見せる (S-65c ⑫、スイッチ whittleBands、tree-band.ts) のページ側。
 * 帯の頭の箱に渡す帯の並び (枠ごとの手・未設定・選んでいる) と、帯を押した時 (手があればその手の窓、無ければ＋と同じ = 次に打つ手) を出す
 */
import { watch, type Ref } from "vue";
import { pickBox } from "./tree-picked";
import { bandHead, headBands } from "../../../services/simulator/tree/tree-band";
import type { TreeBox, TreeDoc } from "../../../services/simulator/tree/tree-model";
import type { LvClass } from "../../../services/simulator/tree/tree-whittle";
import { handLabel } from "./tree-names";
import { holdsAt } from "../../../services/simulator/tree/tree-foresee";
import { isWhittleHand } from "../../../services/simulator/tree/tree-whittle";
import { tr } from "../../../i18n/lang";
import { askQuit, quitWhittle } from "./tree-whittle-quit";

/** 箱の帯 1 本の見せ方 */
export interface BandView { id: string; lv: LvClass; hand: string | null; issue: string | null; selected: boolean }

export function useTreeBands(o: { doc: Ref<TreeDoc>; selectedId: () => string | null; issueOf: (b: TreeBox) => string | null; openHand: (id: string) => void; onPlus: (b: TreeBox, e: PointerEvent) => void; edit: (fn: (d: TreeDoc) => void) => void }) {
  // 選んでいる箱 (手の窓か ＋ を開いた箱) を、帯から読める置き場へ覚えておく (S-145g、tree-picked)
  watch(o.selectedId, pickBox, { immediate: true });
  /** 帯の頭の箱 id に出す帯 (頭でなければ空) */
  const bandsFor = (id: string): BandView[] => headBands(o.doc.value, id).map(({ id: x, lv }) => {
    const b = o.doc.value.boxes[x]!;
    // ヒネコラで持つ削減は 打つ / 打たない (S-39 ②b)
    const held = !!b.hand && holdsAt(o.doc.value, x) && isWhittleHand(b.hand);
    const hand = !b.hand ? null : b.hand.noUse ? tr("打たない", "Skip") : held ? tr(`打つ: ${handLabel(b.hand)}`, `Use: ${handLabel(b.hand)}`) : handLabel(b.hand);
    return { id: x, lv, hand, issue: o.issueOf(b), selected: o.selectedId() === x };
  });
  /** 帯を押した: 手があればその手の窓、無ければ＋と同じ (押すと次に打つ手・長押しで引っ張ってつなぐ) */
  const onBand = (id: string, e: PointerEvent): void => {
    const b = o.doc.value.boxes[id];
    if (!b) return;
    if (b.hand) o.openHand(id);
    else o.onPlus(b, e);
  };
  /** 寄る・描くかの判定で使う箱 (帯の中の枠の箱は帯の頭) */
  const drawnId = (id: string): string => bandHead(o.doc.value, id);
  /** 帯の右の「削減をやめる」(S-65c5): 確かめ 1 回 → 枠を帯の頭の 1 つの箱に戻し、その箱の次に打つ手の窓を開く */
  const onQuit = (id: string): void => askQuit(o.doc.value, id, () => { o.edit((d) => quitWhittle(d, id)); o.openHand(id); });
  return { bandsFor, onBand, onQuit, drawnId };
}
