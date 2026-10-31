/**
 * use-tree-link.ts — 戻り先を選んでいる間 (下の＋を押した・↩ 戻る)、ツリーの箱を「つなげる / つなげない」に色分けする (2026-10-22 オーナー
 * 「＋を押したら、打つ手の棚と同時にツリーの箱をつなげる / つなげない (灰色、理由はエンジンから) で色分けし、箱を押せばそこへつなぐ」)。
 * つなげる = その箱の手を、選んでいる箱の見本にエンジンで打てる (tree-sample の handProblem = エンジンの入口の canUse)。理由はエンジンの断りの文
 */
import { computed, type Ref } from "vue";
import { handProblem, sampleOf } from "../../../services/simulator/tree/tree-sample";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { shapeFits } from "../../../services/simulator/tree/tree-shape";
import { judgeOf } from "./tree-hand-plan";
import { craftStage as s } from "../../../state/craft-stage";
import { tr } from "../../../i18n/lang";

/** 箱ごとの答え: null = つなげる、文字 = つなげない理由。選んでいない時は空 */
export function useTreeLink(doc: Ref<TreeDoc>, from: Ref<string | null>) {
  return computed((): Map<string, string | null> => {
    const out = new Map<string, string | null>();
    const id = from.value, d = s.data.value;
    if (!id || !d) return out;
    const item = sampleOf(d, doc.value, id, 1).item;
    // スイッチ judgeOne: 戻せるかは「箱どうし」の判定 (中身が同じ箱だけ、S-50b・S-62)
    const j = judgeOf(doc.value);
    const fits = (to: string): boolean => (j ? j.fitsBox(id, to) : shapeFits(doc.value, id, to));
    const diff = j ? tr("中身が違う: この箱の見本と、ここから来る人の狙いの組・外れ・✦・レアリティ・品質のどれかが違う (同じ中身の箱だけ選べる)", "Different contents: the targets, misses, fractures, rarity or quality differ from the runs coming in (only boxes with the same contents can be picked)") : null;
    for (const b of Object.values(doc.value.boxes)) {
      if (b.id === id) { out.set(b.id, tr("自分の箱", "This box itself")); continue; }
      // 分かれ目 (打たずに分ける) は手が無くてもつなげる (どの形でも行の箱へ分かれる、10-22)
      if (b.split) { out.set(b.id, null); continue; }
      // 始まりの箱は帯の「↩ 始めに戻る」と同じ (setBack の "start")。箱だけ手の打てる / 打てないで灰色にしていて、押しても黙って何も起きなかった (10-25 モンキー 4 本目)
      // 10-26 モンキー 7 の 1: 始めの手がこのアイテムに打てない (レアのまま錬金術の箱へ戻る等) なら理由付きでつなげない。「↩ 始めに戻る」も同じ理由で押せない形に (黙って何も起きない、は理由の文で避ける)
      if (b.out === "start") {
        if (!fits(b.id)) { out.set(b.id, diff ?? tr("形が違う: 1 段目は狙いが付いていない形 (ここから来る人は狙いを持っている)", "Different shape: step 1 holds no targets (runs coming in hold some)")); continue; }
        const why = b.hand ? handProblem(d, item, b.hand) : null;
        out.set(b.id, why ? tr(`1 段目へ戻ると、1 段目の手が打てない: ${why}`, `Back to step 1, its craft can't be used: ${why}`) : null);
        continue;
      }
      if (!b.hand) { out.set(b.id, tr("この箱にはまだ打つ手が無い", "This box has no craft yet")); continue; }
      // 品質の上限が足りない人はカタリストの n % の箱へ行かない (S-60c、スイッチ keepOutside)
      const cap = j?.capShort(id, b.id);
      if (cap) { out.set(b.id, tr(`品質の上限が ${cap}% に届かない`, `Max quality can't reach ${cap}%`)); continue; }
      // 形 (付いている狙いの組) が違う箱へは戻せない (10-26 オーナー「その選択肢が出てくるのは前提狙いMODの状態でなんかする時やろ」、tree-shape の shapeFits)
      if (!fits(b.id)) { out.set(b.id, diff ?? tr("形が違う: この箱で付いている狙いの組と、ここから来る人の狙いが違う (同じ狙いの組の箱だけ選べる)", "Different shape: the targets held here differ from the runs coming in (only boxes with the same targets can be picked)")); continue; }
      const why = handProblem(d, item, b.hand);
      out.set(b.id, why ? tr(`この箱の手が打てない: ${why}`, `Its craft can't be used here: ${why}`) : null);
    }
    return out;
  });
}

/**
 * 戻せる箱が 1 つも無い時の理由 (10-27 モンキー 9 の 4: 白 → 変成の外れの ↩ で全部灰色なのに理由が出ず、帯は「戻り先の箱を押す」のままだった)。
 * 箱ごとの理由 (useTreeLink) のうち多い物から 2 つ。戻せる箱があれば null
 */
export function noTargetText(link: ReadonlyMap<string, string | null>, picking: string | null): string | null {
  if (!picking || [...link.values()].some((v) => v === null)) return null;
  const count = new Map<string, number>();
  for (const [id, why] of link) if (why && id !== picking) count.set(why, (count.get(why) ?? 0) + 1);
  const top = [...count].sort((a, z) => z[1] - a[1]).slice(0, 2).map(([w]) => w);
  return tr(`戻せる箱が無い: ${top.join(" / ") || "ほかに箱が無い"}。Esc でやめて、＋ で次の手を足す`, `No box to return to: ${top.join(" / ") || "there are no other boxes"}. Press Esc and add the next craft with +`);
}
