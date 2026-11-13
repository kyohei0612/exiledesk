/**
 * tree-place.ts — 箱の位置を木から 1 つの計算で決める (S-140〜S-143。10-28 深夜オーナー「そもそも直し方に問題あるやろ枠の立て方の設計図ないんか」「おｋ進めてくれ」)。
 * 毎回、木の形 (親子・結果の順・まとめ) だけから同じ答えを出す:
 *  - 段 (縦): 深さごとに上の枠を揃える (S-141、tree-row-tops の rowLayout)
 *  - 列 (横): 横幅を詰める並べ方 (S-142j 案 6、tree-place-wide の wideX)。上の段から 1 段ずつ置き、上の段は下の段を理由に動かさない
 *  - 合流: まとめ先は親たちの真ん中、ぶつかれば元の親の下 (S-143、centerMerged)
 * 始まりの箱の位置は動かさない (木ごと合わせる)。動かしたら true。
 * 前の置き方 (部分木の帯 S-142b・押し分け S-142c・1 段下までの比べ S-142f・右へだけ S-142h・広げない S-142c・兄弟の順 S-142e) は
 * 本番の treeWideFit (v0.1.725) の下で通らないので 11-14 に外した
 */
import type { TreeDoc } from "./tree-model";
import { centerMerged, drawnKids, endCards, rowLayout, stackEnds } from "./tree-row-tops";
import { outRank } from "./tree-layout";
import { bandsTogether } from "./tree-band";
import { flag } from "../../../web/release-flags";
import { keepOrder, type KeptOrder } from "./tree-place-order";
import { wideOrder, wideX } from "./tree-place-wide";
import { idealPath } from "./tree-ideal-first";
import { unsetBoxes } from "./tree-junk-tidy";

/** 兄弟の間: どちらも箱 1 つだけ / どちらかに下の段がある (戻り・再挑戦の線が箱の横へ 24 出て、ほかの箱から 10 以上離れて通れる、S-145) */
const GAP_LEAF = 24, GAP_DEEP = 72;

export function placeTree(d: TreeDoc, heightOf: (id: string) => number, chipW?: (id: string) => number | undefined, kept?: KeptOrder): boolean {
  if (!d.boxes.start) return false;
  const before = new Map(Object.values(d.boxes).map((b) => [b.id, `${b.x},${b.y}`]));
  // 描く子を結果の順に (当たり → 狙いが消えた → 外れが消えた → 外れ、同じ順は作った順)。
  // 完成への枝 (完成の印の前は組んでいる道、treeIdealFirst) を左端、ほかは結果の順のまま (S-142j ③)
  const reorder = wideOrder(d);
  /** (S-142i) 組んでいる道の箱。組んでいる間 (控えがある時) も、道の箱は兄弟の左端へ移す (動くのは手の無い兄弟だけ) */
  const ip = idealPath(d);
  /** (S-142j) 縦に積んだ箱 → 並べ方で数える 1 つ目の箱 (同じ x に置く) */
  const stacked = new Map<string, string>();
  // 組んでいる間は、もう並んでいる兄弟の順を入れ替えない (S-142g、kept = 画面が持つ控え。無ければ毎回決まりどおり)
  const memo = new Map<string, string[]>();
  // (S-142k、スイッチ treeTidyOnDone) 組んでいる間に手を置いて新しく出た子の枠は、出た瞬間に 狙いどおり (当たり) → 未設定 → 残り (自動の ↩ など決まった物) の順。
  // 開いた時・並べ直しの時 (控えが空) と、もうある箱 (控えのある親) は今の順のまま (11-13 オーナー「狙い通りが一番左やね枝出る内の」「その次未設定って感じで」)
  const fresh = !!kept && kept.size > 0 && flag("treeTidyOnDone"), unset = fresh ? new Set(unsetBoxes(d)) : null;
  const freshOrder = (ks: string[]): string[] => { const g = (k: string): number => (d.boxes[k]?.out === "hit" ? 0 : unset!.has(k) ? 1 : 2); return ks.map((k, i) => ({ k, i })).sort((a, z) => g(a.k) - g(z.k) || a.i - z.i).map((x) => x.k); };
  const kidsOf = (id: string): string[] => {
    let ks = memo.get(id);
    if (ks) return ks;
    const l = drawnKids(d, d.boxes[id]!).map((o, i) => ({ o, i })).sort((a, z) => outRank(d.boxes[a.o]!) - outRank(d.boxes[z.o]!) || a.i - z.i).map((x) => x.o);
    ks = reorder(l);
    if (fresh && !(kept!.get(id) ?? []).some((k) => ks!.includes(k))) ks = freshOrder(ks); // 子が全部新しい (手を置いた・替えた) 時だけ
    if (kept) ks = keepOrder(kept, id, ks);
    if (ip && kept) { const on = ks.filter((k) => ip.path.has(k)); if (on.length) { ks = [...on, ...ks.filter((k) => !ip.path.has(k))]; kept.set(id, [...ks]); } }
    ks = bandsTogether(d, ks); // 帯の枠は帯の頭のすぐ右に (S-65c ⑫、スイッチ treeLaneOwnHand)
    // (S-142j) ↩ で戻るだけの箱が 2 つ以上なら 1 列に縦に積む: 並べ方では一番左の 1 つだけを数え、残りは同じ x に置く
    const ends = new Set(stackEnds(d, d.boxes[id]!));
    if (ends.size) { const head = ks.find((k) => ends.has(k)); if (head) { for (const k of ks) if (k !== head && ends.has(k)) stacked.set(k, head); ks = ks.filter((k) => k === head || !ends.has(k)); } }
    memo.set(id, ks);
    return ks;
  };
  const L = rowLayout(d, heightOf);
  const xs = wideX(d, L, kidsOf, chipW, { leaf: GAP_LEAF, deep: GAP_DEEP }, (id) => [...stacked.values()].includes(id), endCards(d));
  for (const [id, x] of xs) {
    const b = d.boxes[id]!, r = L.rows.get(id);
    b.x = Math.round(x);
    if (id !== "start" && r != null) b.y = L.top[r]! + (L.off.get(id) ?? 0);
  }
  // (S-142j) 縦に積んだ箱を 1 つ目の箱と同じ x、段の上の枠 + 下げ幅に置く
  for (const [k, head] of stacked) { const b = d.boxes[k]!, r = L.rows.get(k); b.x = d.boxes[head]!.x; if (r != null) b.y = L.top[r]! + (L.off.get(k) ?? 0); }
  centerMerged(d);
  return Object.values(d.boxes).some((b) => before.get(b.id) !== `${b.x},${b.y}`);
}
