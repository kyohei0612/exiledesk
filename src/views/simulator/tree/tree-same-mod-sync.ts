/**
 * tree-same-mod-sync.ts — 「エッセンスと同じ MOD」の箱 (S-33e ①・⑥・⑦) を手の結果にそろえる・既定の統合 (tree-hand-plan.ts が 500 行を超えたので分けた、11-16 整理 ③)
 */
import type { PatchData } from "../../../services/craft-stage/engine";
import { clearHand, drop, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { addOut } from "../../../services/simulator/tree/tree-model-ops";
import { effectOf } from "../../../services/simulator/tree/tree-hands";
import { needsSameHiUnder, needsSameMod, SAME_HI } from "../../../services/simulator/tree/tree-outcome";

/**
 * 「エッセンスと同じ MOD」の箱 (S-33e ①) を箱 a の手の結果にそろえる: 結果の箱のエッセンス / 合金と同じ系統が前の手で付きうれば 1 つ足し、
 * 要らなくなった (エッセンスの手を外した・替えた) 手も ↩ も無い箱は消す。足した箱の id (無ければ null)
 */
export function syncSameMod(data: PatchData, d: TreeDoc, a: string | null): string | null {
  const p = a ? d.boxes[a] : undefined;
  if (!p?.hand) return null;
  let made: string | null = null;
  for (const [hold, key] of [["blocked", undefined], ["skip", SAME_HI]] as const) {
    const has = p.outs.find((id) => d.boxes[id]?.out === "blocked" && d.boxes[id]?.junkKey === key);
    if (needsSameMod(data, d, p.id, hold)) {
      const id = has ?? addOut(d, p.id, "blocked", key);
      if (!has) made ??= id;
      if (key) linkSameHi(d, id);
      continue;
    }
    // 要らなくなった (エッセンスの手を外した・替えた) 箱は、人の決め (手・人が付けた ↩・完成 / 失敗) が無ければ消す
    const c = has ? d.boxes[has] : undefined;
    if (c && !c.hand && (!c.back || c.autoBack) && !c.done) { drop(d, [c.id]); p.outs = p.outs.filter((o) => o !== c.id); }
  }
  return made;
}
/** エッセンス / 合金の手の箱 e の下の「エッセンスと同じ MOD (同格以上)」(S-33e ⑦): 2 つ前より上の手で同格以上が付きうれば 1 つ足して統合、要らなければ人の決めの無い物を消す */
export function syncSameHiUnder(data: PatchData, d: TreeDoc, e: string): void {
  const p = d.boxes[e];
  if (!p?.hand || effectOf(p.hand.currency) !== "essence") return;
  const has = p.outs.find((id) => d.boxes[id]?.out === "blocked" && d.boxes[id]?.junkKey === SAME_HI);
  if (needsSameHiUnder(data, d, e)) { linkSameHi(d, has ?? addOut(d, e, "blocked", SAME_HI)); return; }
  const c = has ? d.boxes[has] : undefined;
  if (c && !c.hand && (!c.back || c.autoBack) && !c.done) { drop(d, [c.id]); p.outs = p.outs.filter((o) => o !== c.id); }
}
/**
 * 「エッセンスと同じ MOD (同格以上)」の箱 (S-33e ⑥) の既定 =エッセンスと同じ枠で扱う: 兄弟の箱のエッセンス / 合金の当たりの箱へ統合の ↩ (鎖の印)。
 * 人が「新しいツリーを作る」を押した箱 (ownTree) と手のある箱はつながない。自動の直し (打てない人の ↩ 外しなど) で立った noAutoBack では外さない
 * (11-08 夜オーナー「デフォでエッセンスと同じとして扱うにしてくれあとボタン押さんと扱わないからこれだと」= 手元の木で統合が外れて未設定に落ちていた)
 */
function linkSameHi(d: TreeDoc, id: string): void {
  const b = d.boxes[id], p = b ? d.boxes[b.parent ?? ""] : undefined;
  if (!b || !p || b.hand || b.ownTree || b.done || (b.back && !b.autoBack)) return;
  // 統合の先 = エッセンスの結果の当たり (完全なエッセンスは打った後の箱、同じ側 s:0|0 を先に)。箱がエッセンスの箱の下 (S-33e ⑦) なら親の結果から
  const res = (outs: readonly string[]): string | undefined => outs.find((o) => d.boxes[o]?.out === "hit") ?? outs.find((o) => d.boxes[o]?.out === "any" && (!d.boxes[o]?.junkKey || d.boxes[o]!.junkKey!.startsWith("s:0|0"))) ?? outs.find((o) => d.boxes[o]?.out === "any");
  const under = !!p.hand && effectOf(p.hand.currency) === "essence";
  const hit = under ? res(p.outs.filter((o) => o !== id)) : res(p.outs.flatMap((o) => { const c = d.boxes[o]; return c?.hand && effectOf(c.hand.currency) === "essence" ? c.outs : []; }));
  if (hit) { b.back = hit; b.autoBack = true; delete b.noAutoBack; }
}
/** 木の中の「エッセンスと同じ MOD (同格以上)」の箱を全部、既定の統合にそろえる (手を決めた後・開いた時の組み直しの後) */
export function linkAllSameHi(d: TreeDoc): void {
  for (const b of Object.values(d.boxes)) if (b.out === "blocked" && b.junkKey === SAME_HI) linkSameHi(d, b.id);
}
/** 「エッセンスと同じ MOD (同格以上)」の箱を 新しいツリーを作る (own = true、↩ を外して ＋ を出す) / エッセンスと同じ枠で扱う (false、既定へ戻す) (S-33e ⑥) */
export function setSameHiOwn(d: TreeDoc, id: string, own: boolean): void {
  const b = d.boxes[id];
  if (!b || b.out !== "blocked" || b.junkKey !== SAME_HI) return;
  if (own) { b.back = null; delete b.autoBack; b.noAutoBack = true; b.ownTree = true; return; }
  // 「新しいツリーを作る」の後に足した手は外して統合へ戻す (2 ボタンは手の後も出す、S-33e ⑥。1 つ戻すで戻せる)
  delete b.noAutoBack; delete b.ownTree;
  if (b.hand) clearHand(d, id);
  b.done = null; b.back = null; delete b.autoBack;
  linkSameHi(d, id);
}
