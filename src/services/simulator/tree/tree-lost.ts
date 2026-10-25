/**
 * tree-lost.ts — 箱に狙いを持って着く人がいるか (木の形だけで見る。2026-10-24 モンキー初めての人の回 6: スタートに付いていない狙いでも
 * カオスに「狙いが消えた」の箱ができ、何が消えるのか分からなかった)。消せる狙い (✦ でない当たりの箱の札) を 1 つも持たずに着くなら、
 * 狙いが消えた結果は起きないので箱を作らない (tree-model の setHand)。後で戻りの線が足されて持って着く人ができたら足し直す (healLost)。
 * 数え方は tree-run の heldSets と同じ: 道の当たりの箱で 1 つ増え、狙いが消えた箱を通ると 1 つ減る (エッセンスの消えたは付いた MOD が残る)
 */
import { effectOf } from "./tree-hands";
import type { TreeDoc } from "./tree-model";

const keyOf = (a: { modId: string; tier: number }): string => `${a.modId}/${a.tier}`;

/** この箱の道で持っている狙いの数 (多い方の組。始まりの ✦ は当たりの箱ではないので数えない) */
function heldOnPath(d: TreeDoc, id: string): number {
  const path: string[] = [];
  for (let x: string | null = id; x; x = d.boxes[x]?.parent ?? null) path.unshift(x);
  const seen = new Set<string>();
  let n = 0;
  for (const x of path) {
    const c = d.boxes[x];
    // フラクチャーの手の当たりは ✦ (消えない) なので数えない
    const fr = c?.parent ? d.boxes[c.parent]?.hand : null;
    if (c?.out === "hit" && c.aim && !seen.has(keyOf(c.aim)) && !(fr && effectOf(fr.currency) === "fracture")) { seen.add(keyOf(c.aim)); n++; }
    else if (c?.out === "lost") {
      n = Math.max(0, n - 1);
      // エッセンスの「狙いが消えた」は、エッセンスで付いた MOD (同じ手の当たりの箱の札) が付いている
      const p = c.parent ? d.boxes[c.parent] : undefined;
      const ess = p?.hand && effectOf(p.hand.currency) === "essence" ? p.outs.map((o) => d.boxes[o]).find((o) => o?.out === "hit" && o.aim)?.aim : undefined;
      if (ess && !seen.has(keyOf(ess))) { seen.add(keyOf(ess)); n++; }
    }
  }
  return n;
}

/** この箱に、消せる狙いを持って着く人がいうるか (自分の道と、この箱へ戻る箱の道) */
export function mayHoldAim(d: TreeDoc, id: string): boolean {
  if (heldOnPath(d, id) > 0) return true;
  return Object.values(d.boxes).some((b) => b.back === id && heldOnPath(d, b.id) > 0);
}

/** この箱に持って着きうる狙い (自分の道と、この箱へ戻る箱の道の当たりの箱の札。✦ のフラクチャーの当たりは消えないので入れない)。起こりうる結果の箱 (tree-sample の possibleOutsOf) が見本に足して打つ */
export function aimsMayHold(d: TreeDoc, id: string): Array<{ modId: string; tier: number }> {
  const out = new Map<string, { modId: string; tier: number }>();
  const walk = (from: string): void => {
    for (let x: string | null = from; x; x = d.boxes[x]?.parent ?? null) {
      const c = d.boxes[x];
      const fr = c?.parent ? d.boxes[c.parent]?.hand : null;
      if (c?.out === "hit" && c.aim && !(fr && effectOf(fr.currency) === "fracture")) out.set(keyOf(c.aim), { modId: c.aim.modId, tier: c.aim.tier });
    }
  };
  walk(id);
  for (const b of Object.values(d.boxes)) if (b.back === id) walk(b.id);
  return [...out.values()];
}
