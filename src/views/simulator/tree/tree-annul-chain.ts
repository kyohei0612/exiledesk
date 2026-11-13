/**
 * tree-annul-chain.ts — 消去の続き (S-28g、11-06 オーナー「単純に同じ枠のものが見つかるまで枝作り続けるべきよな最後の1MODになるまで」)。
 * 消去の手の結果の箱は、同じ枠 (配置、S-200 ②) の手のある箱があれば自動の ↩ で止め (S-190b のまま)、無ければ同じ消去 (同じお告げ・同じ残したい MOD) を自動で足し、
 * アイテムの MOD が 1 つ (✦ も数える) になるまで続ける。外れが消えた・狙いが消えたの両方とも続ける。自動で足した手は印 autoAnnul を持ち、保存しない (開く時に同じ決まりで作り直す)。
 * 打たない: 代表の品に手を数え上げるだけ (possibleOutsOf)。段ごとにまとめて置き、つなぎも段ごとに 1 回 (1 手ずつ組み替えると 8 MOD で 9 秒、annul6c)
 */
import { stepOutcomes } from "../../../services/simulator/sim-engine";
import { effectOf, engineOmens } from "../../../services/simulator/tree/tree-hands";
import { holdDocSig, possibleOutsOf } from "../../../services/simulator/tree/tree-sample";
import { judgeMemo } from "../../../services/simulator/tree/tree-judge";
import { sameAimMod } from "../../../services/simulator/tree/tree-hand-core";
import { frameOfDoc } from "../../../services/simulator/tree/tree-frame";
import { autoTarget, linkByContent, pruneByContent } from "../../../services/simulator/tree/tree-judge-link";
import { mergeOpenSame } from "../../../services/simulator/tree/tree-merge-open";
import { clearHand, setHand, subtree, type Hand, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import type { PatchData } from "../../../services/craft-stage/engine";
import { flag } from "../../../web/release-flags";

/** 続ける段の上限 (消せる MOD は多くて 8 なので届かない、壊れた木の止め) */
const DEPTH_MAX = 12;
/** 開いている途中 (保存の決めを置き直している間) の木。スイッチ treeNoAnnulAuto の下だけ見る (S-28g ⑤ オ) */
const opening = new WeakSet<TreeDoc>();
export const holdAnnul = (d: TreeDoc, on: boolean): void => { if (on) opening.add(d); else opening.delete(d); };
export const isAnnulHand =(h: Hand | null | undefined): h is Hand => !!h && effectOf(h.currency) === "remove";
const open = (b: TreeBox | undefined): b is TreeBox => !!b && !b.hand && !b.back && !b.done && !b.split && !b.merged && !b.noAutoBack && !b.noAnnul && b.out !== "pass" && b.out !== "branch";

/**
 * roots の消去の手の結果の空いた箱を続ける (roots を渡さなければ木の消去の手の全部)。返すのは自動で手を足した箱の数。
 * 止まり = 同じ枠の手のある箱へ自動の ↩・同じ段の同じ枠はまとめ (S-66)・アイテムの MOD が 1 つ・消せる MOD が無い (側のお告げならその側)・決まりで配置の出せない箱
 */
export function extendAnnul(data: PatchData, d: TreeDoc, roots?: readonly string[], toward?: (id: string) => boolean): number {
  // (スイッチ treeNoAnnulAuto、S-28g ⑤。11-12 オーナー「消去自動は無しだな…すべて削除の奴だけ自動でいいかもね残しMODがある時は自動はやめた方が良いかもね」)
  // 残したい MOD (☑) のある消去は、狙いの残る結果の箱では続けない = 置いた手の結果の箱だけ (全部外れになった箱からは続ける)。☑ の無い消去 (全部消えてよい) は今までどおり止まる所まで続ける。
  // 開く時 (toward) は 1 回に 1 段だけ続け、呼ぶ側がそのたびに保存の決めを置く (まとめて続けてから置くと、続きの下の保存の決めが置かれない木があった = オーナーの木の 11 個)。
  // ☑ のある消去は開く時だけ、前に保存した決めへ着くのに要る箱に限って続ける (自動の消去は保存していないので、続けないと下の人の決めの置き場が無くなる)
  const stop = flag("treeNoAnnulAuto");
  const keeps = (h: Hand): boolean => !!h.keep?.length;
  // 開いている途中の木は、保存の手を置き直すたびの続き (applyPick・整理から来る toward 無しの呼び) を止める。続きは開く側が 1 段ずつ足す
  if (stop && !toward && opening.has(d)) return 0;
  // お告げ付きの消去は続けない (人が置いた分だけ。11-08 オーナー「お告げありの消去は自動でやらない」)
  const plain = (id: string): boolean => { const h = d.boxes[id]?.hand; return isAnnulHand(h) && !h.omens.length; };
  let front = (roots ?? Object.values(d.boxes).filter((b) => isAnnulHand(b.hand)).map((b) => b.id)).filter(plain);
  let made = 0;
  for (let depth = 0; depth < (stop && toward ? 1 : DEPTH_MAX) && front.length; depth++) {
    const kids = front.flatMap((id) => d.boxes[id]!.outs).filter((id) => open(d.boxes[id]));
    if (!kids.length) break;
    // 配置は段の頭で 1 回 (つなぎ・まとめは子の代表を変えないので、後の決めにもそのまま使う)
    const frames = frameOfDoc(data, d).frames, j = judgeMemo(data, d);
    linkByContent(d, kids, j);
    mergeOpenSame(d, kids, j);
    const go = kids.flatMap((id) => {
      const b = d.boxes[id], f = frames.get(id), h = b?.parent ? d.boxes[b.parent]?.hand : null;
      // ☑ のある消去でも、結果の箱の品が全部外れ (狙いが 1 つも残っていない。フラクチャーは数えない = holdsAim) になったら、その箱からは自動で続ける
      // (11-12 オーナー「何か1つでも残ってたら自動で消去は無しで１つずつ手打ち。その中で全部ハズレになる瞬間あるでしょ？その時からは自動って話ね。」)
      // 残したい MOD に選んだ物 (完成形に無いエッセンスの MOD も選べる、S-27b) が品に残っている間も狙いが残る箱 = 続けない
      const keptOn = (): boolean => !!f && [...f.item.prefixes, ...f.item.suffixes].some((m) => (h?.keep ?? []).some((a) => sameAimMod(data, a, { modId: m.modId, tier: 1 })));
      if (!open(b) || !f || f.note || !isAnnulHand(h) || (stop && (toward ? !toward(id) : keeps(h) && (j.holdsAim(id) || keptOn())))) return [];
      // MOD が 1 つ (✦ も数える) になるまで続ける = 最後はプレ 1 つかサフィ 1 つ (11-06 オーナー「0になるまでじゃなくて１MODになるまでな サフィプレ1つずつになるだろ最終」。
      // 前は消去の結果が 1 つの所で止め、全部消えてよい消去が [エッセンス / ✦] で止まった)。消せる MOD が無い (結果 0) 時も止める。
      // 残したい MOD が消える枝は消せる物に数えない (残したい MOD は木の側の物でエンジンは知らない。同じ MOD かはエンジンの当て方 sameAimMod、✦ はエンジンが消さない)。
      // 前は残すと決めたエッセンスしか左に残っていない箱にも消去を足し、オーナーの組んでいない「狙いが消えた」の未設定の箱ができた (11-08 オーナー「そもそも残すっていってんのにすすむんだが」)
      const kept = (m: { modId: string }): boolean => (h.keep ?? []).some((a) => sameAimMod(data, a, { modId: m.modId, tier: 1 }));
      // (スイッチ annulLastOne) 数えるのは消せる MOD だけ (✦・残すと決めた MOD を引く)。✦ + 1 MOD の箱は続けず未設定で出す = カオスを打てる最後の形
      // (11-14 オーナー「一応カオススパム用で１MOD残してね？」。前は ✦ も数え、✦ だけの箱まで消してから人がカオスに替えていた)
      const all = [...f.item.prefixes, ...f.item.suffixes];
      const mods = flag("annulLastOne") ? all.filter((m) => !m.fractured && !kept(m)).length : all.length;
      return mods > 1 && (stepOutcomes(data, f.item, h.currency, engineOmens(h)) ?? []).some((o) => !o.void && !(o.removed ?? []).some(kept)) ? [{ id, h }] : [];
    });
    if (!go.length) break;
    // 結果の箱の一覧は木を変える前に全部出す (段の中で配置を出し直さない)
    const plans = holdDocSig(d, () => go.map(({ id, h }) => ({ id, h, only: possibleOutsOf(data, d, id, h), holds: j.holdsAim(id) })), true);
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
