/**
 * tree-low-tier-sync.ts — 手を決めた時に「<狙い> 低ティア MOD」の箱 (S-33g、スイッチ lowTierBox) を木にそろえる。箱を足すかの判定は
 * services の tree-low-tier (needsLowTier) を呼ぶだけ。「初めて」= 箱の代表に狙いがまだ付いていない手 (レビュワー 1 の 26)。上の手が変わると下の箱の代表も変わるので、手を置いた箱の下も全部見直す
 */
import type { PatchData } from "../../../services/craft-stage/engine";
import { drop, subtree, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { heldOnRep } from "../../../services/simulator/tree/tree-judge";
import { addOut } from "../../../services/simulator/tree/tree-model-ops";
import { firstAimsOf, lowTierKey, lowTierModOf, needsLowTier, reaimedBelow } from "../../../services/simulator/tree/tree-low-tier";
import { flag } from "../../../web/release-flags";

/** 箱 id の手の結果の低ティアの箱を、要る物は足し、要らない物は人の決め (手・人が付けた ↩・完成 / 失敗) が無ければ消す */
function syncOne(data: PatchData, d: TreeDoc, id: string, memo: Map<string, boolean>): void {
  const b = d.boxes[id];
  if (!b) return;
  // 「初めて」は代表に A が付いていないかで見る (レビュワー 1 の 26)。代表 = 見本の 1 番目の名前の印
  const held = (bid: string, a: Aim): boolean => heldOnRep(data, d, bid, a);
  // 外れ側の下で同じ狙いを ☑ する手がある時だけ (無ければ外れの箱とまとめる、S-33g ⑧ 1A)
  const want = flag("lowTierBox") && b.hand ? firstAimsOf(data, d, b, held).filter((a) => reaimedBelow(data, d, id, a) && needsLowTier(data, d, id, a, memo, held)) : [];
  const keys = new Set(want.map(lowTierKey));
  for (const o of [...b.outs]) {
    const c = d.boxes[o];
    if (!c || c.out !== "blocked" || !lowTierModOf(c.junkKey) || keys.has(c.junkKey!)) continue;
    if (!c.hand && (!c.back || c.autoBack) && !c.done) { drop(d, [c.id]); b.outs = b.outs.filter((x) => x !== c.id); }
  }
  for (const a of want) if (!b.outs.some((o) => d.boxes[o]?.out === "blocked" && d.boxes[o]?.junkKey === lowTierKey(a))) addOut(d, id, "blocked", lowTierKey(a));
}

/**
 * 箱 at と、その下の手のある箱の低ティアの箱をそろえる (手を決めた後・外した後)。上の箱も (外れの側の下に同じ狙いを ☑ する手を置く・外すと、
 * 上の手の低ティアの箱が要る・要らないが変わる、S-33g ⑧ 1A)
 */
export function syncLowTier(data: PatchData, d: TreeDoc, at: string | null): void {
  if (!at || !d.boxes[at]) return;
  const memo = new Map<string, boolean>(); // 1 回のそろえの中だけの控え (上の箱の見本 × 手の結果を箱ごとに打ち直さない、レビュワー 1 の 28)
  for (let p = d.boxes[at]?.parent ? d.boxes[d.boxes[at]!.parent!] : undefined; p; p = p.parent ? d.boxes[p.parent] : undefined) if (p.hand) syncOne(data, d, p.id, memo);
  for (const id of subtree(d, at)) if (d.boxes[id]?.hand) syncOne(data, d, id, memo);
}
