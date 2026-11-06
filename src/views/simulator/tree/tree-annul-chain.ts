/**
 * tree-annul-chain.ts — 消去の続き (S-28g、11-06 オーナー「単純に同じ枠のものが見つかるまで枝作り続けるべきよな最後の1MODになるまで」)。
 * 消去の手の結果の箱は、同じ枠 (配置、S-200 ②) の手のある箱があれば自動の ↩ で止め (S-190b のまま)、無ければ同じ消去 (同じお告げ・同じ残したい MOD) を自動で足し、
 * 消せる MOD が残り 1 になるまで続ける。外れが消えた・狙いが消えたの両方とも続ける。自動で足した手は印 autoAnnul を持ち、保存しない (開く時に同じ決まりで作り直す)。
 * 打たない: 代表の品に手を数え上げるだけ (possibleOutsOf)。段ごとにまとめて置き、つなぎも段ごとに 1 回 (1 手ずつ組み替えると 8 MOD で 9 秒、annul6c)
 */
import { stepOutcomes } from "../../../services/simulator/sim-engine";
import { effectOf, engineOmens } from "../../../services/simulator/tree/tree-hands";
import { holdDocSig, possibleOutsOf } from "../../../services/simulator/tree/tree-sample";
import { judgeMemo } from "../../../services/simulator/tree/tree-judge";
import { frameOfDoc } from "../../../services/simulator/tree/tree-frame";
import { autoTarget, linkByContent, pruneByContent } from "../../../services/simulator/tree/tree-judge-link";
import { mergeOpenSame } from "../../../services/simulator/tree/tree-merge-open";
import { clearHand, setHand, subtree, type Hand, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import type { PatchData } from "../../../services/craft-stage/engine";

/** 続ける段の上限 (消せる MOD は多くて 8 なので届かない、壊れた木の止め) */
const DEPTH_MAX = 12;
export const isAnnulHand = (h: Hand | null | undefined): h is Hand => !!h && effectOf(h.currency) === "remove";
const open = (b: TreeBox | undefined): b is TreeBox => !!b && !b.hand && !b.back && !b.done && !b.split && !b.merged && !b.noAutoBack && b.out !== "pass" && b.out !== "branch";

/**
 * roots の消去の手の結果の空いた箱を続ける (roots を渡さなければ木の消去の手の全部)。返すのは自動で手を足した箱の数。
 * 止まり = 同じ枠の手のある箱へ自動の ↩・同じ段の同じ枠はまとめ (S-66)・消去の結果が 1 つ以下 (消せる MOD が残り 1、側のお告げならその側)・決まりで配置の出せない箱
 */
export function extendAnnul(data: PatchData, d: TreeDoc, roots?: readonly string[]): number {
  let front = (roots ?? Object.values(d.boxes).filter((b) => isAnnulHand(b.hand)).map((b) => b.id)).filter((id) => isAnnulHand(d.boxes[id]?.hand));
  let made = 0;
  for (let depth = 0; depth < DEPTH_MAX && front.length; depth++) {
    const kids = front.flatMap((id) => d.boxes[id]!.outs).filter((id) => open(d.boxes[id]));
    if (!kids.length) break;
    const j = judgeMemo(data, d);
    linkByContent(d, kids, j);
    mergeOpenSame(d, kids, undefined, j);
    const frames = frameOfDoc(data, d).frames;
    const go = kids.flatMap((id) => {
      const b = d.boxes[id], f = frames.get(id), h = b?.parent ? d.boxes[b.parent]?.hand : null;
      if (!open(b) || !f || f.note || !isAnnulHand(h)) return [];
      return (stepOutcomes(data, f.item, h.currency, engineOmens(h)) ?? []).filter((o) => !o.void).length > 1 ? [{ id, h }] : [];
    });
    if (!go.length) break;
    // 結果の箱の一覧は木を変える前に全部出す (段の中で配置を出し直さない)
    const jj = judgeMemo(data, d);
    const plans = holdDocSig(d, () => go.map(({ id, h }) => ({ id, h, only: possibleOutsOf(data, d, id, h), holds: jj.holdsAim(id) })), true);
    for (const p of plans) {
      setHand(d, p.id, { ...p.h, omens: [...p.h.omens], ...(p.h.keep ? { keep: p.h.keep.map((a) => ({ ...a })) } : {}) }, "remove", [], p.only, undefined, p.holds);
      d.boxes[p.id]!.autoAnnul = true;
    }
    made += plans.length;
    front = plans.map((p) => p.id);
  }
  if (made) pruneByContent(d, judgeMemo(data, d));
  return made;
}

/** 人の決め (自動の消去の手・自動の ↩ でない手・↩・完成 / 失敗・分かれ目・メモ・×) が下にあるか */
const humanBelow = (d: TreeDoc, id: string): boolean =>
  subtree(d, id).some((x) => { const b = d.boxes[x]!; return (!!b.hand && !b.autoAnnul) || (!!b.back && !b.autoBack) || !!b.done || !!b.split || !!b.note || !!b.unwanted?.length || !!b.noAutoBack; });

/**
 * 自動の消去の手の箱で、木に同じ枠の手のある箱ができた物は、手を外してそこへ自動の ↩ (後から同じ枠が見つかった = そこで止まる)。
 * 下に人の決めがある箱は触らない。浅い段から見る
 */
export function trimAnnul(data: PatchData, d: TreeDoc): boolean {
  const depth = (id: string): number => { let n = 0; for (let b = d.boxes[id]; b?.parent; b = d.boxes[b.parent]) n++; return n; };
  const ids = Object.values(d.boxes).filter((b) => b.autoAnnul && b.hand).map((b) => b.id).sort((a, z) => depth(a) - depth(z));
  if (!ids.length) return false;
  const j = judgeMemo(data, d);
  let changed = false;
  for (const id of ids) {
    const b = d.boxes[id];
    if (!b?.autoAnnul || humanBelow(d, id)) continue;
    const to = autoTarget(d, id, j);
    if (!to || d.boxes[to]?.autoAnnul) continue;
    clearHand(d, id);
    delete b.autoAnnul;
    b.back = to; b.autoBack = true;
    changed = true;
  }
  return changed;
}
