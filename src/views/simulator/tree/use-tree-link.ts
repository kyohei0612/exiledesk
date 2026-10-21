/**
 * use-tree-link.ts — 戻り先を選んでいる間 (下の＋を押した・↩ 戻る)、ツリーの箱を「つなげる / つなげない」に色分けする (2026-10-22 オーナー
 * 「＋を押したら、打つ手の棚と同時にツリーの箱をつなげる / つなげない (灰色、理由はエンジンから) で色分けし、箱を押せばそこへつなぐ」)。
 * つなげる = その箱の手を、選んでいる箱の見本にエンジンで打てる (tree-sample の playHand、繰り返しは 1 回分)。理由はエンジンの断りの文
 */
import { computed, type Ref } from "vue";
import { mulberry32 } from "../../../services/craft-stage/engine";
import { playHand, sampleOf } from "../../../services/simulator/tree/tree-sample";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { craftStage as s } from "../../../state/craft-stage";
import { tr } from "../../../i18n/lang";

/** 箱ごとの答え: null = つなげる、文字 = つなげない理由。選んでいない時は空 */
export function useTreeLink(doc: Ref<TreeDoc>, from: Ref<string | null>) {
  return computed((): Map<string, string | null> => {
    const out = new Map<string, string | null>();
    const id = from.value, d = s.data.value;
    if (!id || !d) return out;
    const item = sampleOf(d, doc.value, id, 1).item;
    for (const b of Object.values(doc.value.boxes)) {
      if (b.id === id) { out.set(b.id, tr("自分の箱", "This box itself")); continue; }
      if (!b.hand) { out.set(b.id, tr("この箱にはまだ打つ手が無い", "This box has no craft yet")); continue; }
      const r = playHand(d, item, { ...b.hand, repeat: null }, mulberry32(1));
      out.set(b.id, r.applied ? null : tr(`この箱の手が打てない: ${r.reason ?? ""}`, `Its craft can't be used here: ${r.reason ?? ""}`));
    }
    return out;
  });
}
