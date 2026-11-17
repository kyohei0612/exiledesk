/**
 * tree-grade-prune.ts — 格だけ替えて残した下の木を、新しい下限で数え直す (S-57d2、スイッチ gradeKeepAll。11-18 オーナー「その後リセットよな」)。
 * 替えた箱の結果の箱は setHand の graftOuts が作り直す (S-57d)。ここはその下: 手のある箱を上から順に、
 *   ① 削減の手前の枠 (S-65c、低い・同じ・高い) を数え直し、付きえなくなった帯は人の決めがあっても下ごと消す (syncWhittlePre の force)
 *   ② 起こりうる結果 (S-21、onlyOf) に無くなった当たりの箱を下ごと消す。骨の下限は次の発現の結果に効くので、骨ではここで消える
 * 消すのは当たりの箱と枠だけ (外れ・打った後などの種類ごとの箱は、狙いが付かないと出ない「狙いが消えた」の扱いなどが手ごとに違うので触らない)。
 * 下の手・兄弟枠の写し・↩ は残す。消える数は手の窓の確かめと同じ数え (dropCountOf が applyPick を写しに打つ) に入る
 */
import type { PatchData } from "../../../services/craft-stage/engine";
import { drop, subtree, type Aim, type Hand, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { sameAim, sameAimMod } from "../../../services/simulator/tree/tree-hand-core";
import { syncWhittlePre } from "./tree-whittle-pre";

type OnlyFn = (data: PatchData, d: TreeDoc, id: string, h: Hand, pre: string | null, aims: Aim[]) => ReadonlyArray<{ out: string; aim: Aim | null }> | null;

/** 箱の手の ☑ = 当たりの子の狙い (まとめた狙いも)。同じ狙いかはエンジンの sameAimTarget を通す木の sameAim (G-40) */
function hitAimsOf(data: PatchData, d: TreeDoc, id: string): Aim[] {
  const out: Aim[] = [];
  for (const o of d.boxes[id]?.outs ?? []) {
    const c = d.boxes[o];
    if (c?.out !== "hit") continue;
    for (const a of [c.aim, ...(c.anyOf ?? [])]) if (a && !out.some((x) => sameAim(data, x, a))) out.push({ ...a });
  }
  return out;
}

/** at (格を替えた箱) の下の木を数え直す。消した箱の数 */
export function pruneGradeBelow(data: PatchData, d: TreeDoc, at: string, onlyOf: OnlyFn): number {
  const before = Object.keys(d.boxes).length;
  const queue = [at];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!, b = d.boxes[id];
    if (!b) continue;
    if (b.hand) {
      // ① 付きえなくなった削減の帯 (替えた箱の結果の箱の枠も、ここで見る)。帯を作るのは外れを付けた手の結果の箱で、その手は狙い無しの
      // 高貴・カオスが多いので、狙い無し (free)・神の目標の手でも数え直す (レビュワー 1 の G-1。前は free を丸ごと飛ばし、付きえない帯が残った)
      syncWhittlePre(data, d, id, undefined, true);
      // ② 起こりうる結果に無くなった当たりの箱 (替えた箱の結果の箱は graftOuts が作り直し済み)。狙い無し・神の目標の手は当たりの数え方が違うので飛ばす
      if (id !== at && !b.hand.free && !b.hand.targets?.length) {
        const aims = hitAimsOf(data, d, id);
        const l = aims.length ? onlyOf(data, d, id, b.hand, null, aims) : null;
        if (l) {
          // 起こりうる当たりと同じ MOD か = 木の sameAimMod (エンジンの sameAimTarget、G-40)
          const can = l.flatMap((e) => (e.out === "hit" && e.aim ? [e.aim] : []));
          const gone = b.outs.filter((o) => { const c = d.boxes[o]; return c?.out === "hit" && !!c.aim && ![c.aim, ...(c.anyOf ?? [])].some((a) => can.some((x) => sameAimMod(data, x, a))); });
          // 当たりが 1 つも残らない (一覧が狙いを数えられない手) は消さない
          if (gone.length && gone.length < b.outs.filter((o) => d.boxes[o]?.out === "hit").length) {
            drop(d, gone.flatMap((g) => subtree(d, g)));
            b.outs = b.outs.filter((o) => !gone.includes(o));
          }
        }
      }
    }
    for (const o of d.boxes[id]?.outs ?? []) if (!queue.includes(o)) queue.push(o);
  }
  return before - Object.keys(d.boxes).length;
}
