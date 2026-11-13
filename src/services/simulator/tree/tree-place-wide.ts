/**
 * tree-place-wide.ts — 木の横幅を詰める並べ方 (案 6、S-142j、スイッチ treeWideFit)。
 * 11-13 オーナー「このツリーの空きぐらいスッカスカやん」「どっちかっていうと横の幅かな」「わざわざ下に合わせなくても」「えだは最低1縦ライン枠分空ける」
 * 「段は左端固定が良いな理想」「案３が近いかな」「左端設定結構好きなんだけど理想形を左に置く形」「一旦その案で行ってみるか」。
 *  - 箱は上の段から 1 段ずつ置き、上の段は下の段を理由に動かさない (下に手を足しても上の箱は動かない)
 *  - 子は親の真下から右へ (S-142h のまま)。子が 2 つ以上の箱の右だけ 1 列 (箱 1 つ + 72 × 2) 空ける (その列に下の子が入る)
 *  - 子が別の親の箱の真下に来る・同じ段の前の箱とぶつかる時は、下の子の方を右へずらす
 *  - ↩ で戻るだけの箱が 2 つ以上ある組は段の中で縦に積む (tree-row-tops の stackEnds、置くのは tree-place)
 *  - 兄弟の順は 完成への枝を左端、ほかは結果の順 (S-142d、成功が左)。未設定を寄せない・続く枝を先にしない (S-142e の 2 つは使わない)
 */
import { BOX_W, type TreeDoc } from "./tree-model";
import type { RowLayout } from "./tree-row-tops";
import { idealOn, idealPath } from "./tree-ideal-first";
import { flag } from "../../../web/release-flags";

type Row = [number, number];

/** 箱の x (始まりの箱は今の x)。kidsOf は並べ順の決まった描く子 (縦に積んだ 2 つ目からは除いた物) */
export function wideX(d: TreeDoc, L: RowLayout, kidsOf: (id: string) => string[], chipW: ((id: string) => number | undefined) | undefined, gaps: { leaf: number; deep: number; reserve?: boolean }, stackHead: (id: string) => boolean = () => false, linkDown: ReadonlySet<string> = new Set()): Map<string, number> {
  const x = new Map<string, number>([["start", d.boxes.start!.x]]);
  const leafFree = idealOn();
  const seen = new Set<string>(["start"]), kids = new Map<string, string[]>(), up = new Map<string, string>();
  const walk = (id: string): void => { const ks = kidsOf(id).filter((k) => !seen.has(k)); for (const k of ks) { seen.add(k); up.set(k, id); } kids.set(id, ks); ks.forEach(walk); };
  walk("start");
  /** 箱と、下に子があればその手の札の横の幅 (箱の左の端から) */
  const ext = (id: string): Row => { const w = kids.get(id)!.length ? chipW?.(id) ?? 0 : 0; return [Math.min(0, BOX_W / 2 - w / 2), Math.max(BOX_W, BOX_W / 2 + w / 2)]; };
  const byRow: string[][] = [];
  for (const id of seen) { const r = L.rows.get(id); if (r != null) (byRow[r] ??= []).push(id); }
  /** 下に子がある、または縦に積んだ列の頭 (列の左の脇を下の箱への線が通る) */
  // 同じ枠へ直に線の親は線が下の段まで下りる (hitsSide)。↩ の畳みだけの親は描く子が無い = 線が下りない
  const deep = (id: string): boolean => kids.get(id)!.length > 0 || stackHead(id) || linkDown.has(id);
  /** 兄弟の間: 子が 2 つ以上の兄弟の右は 1 列分空ける / どちらかが deep 72 / どちらも箱 1 つ 24 */
  // (S-142j ③、スイッチ hitsSide) 1 列の取り置きはしない = 孫は下の段で右へずらすだけ (下の段は上の段に縦で重なって良い。11-14 オーナー「縦で重なる分は良しとしてるはずだが」)
  const sibGap = (a: string, b: string): number => (gaps.reserve !== false && kids.get(a)!.length >= 2 ? gaps.deep * 2 + BOX_W : deep(a) || deep(b) ? gaps.deep : gaps.leaf);
  for (let r = 1; r < byRow.length; r++) {
    const above = (byRow[r - 1] ?? []).filter((id) => x.has(id));
    const ps = [...new Set((byRow[r] ?? []).map((id) => up.get(id)!))].filter((p) => x.has(p)).sort((a, z) => x.get(a)! - x.get(z)!);
    let edge = -Infinity, prev: string | null = null;
    // 本物の箱を親の真下から左詰め (11-14 オーナー「上の段より左側にいかない事ね親の話で」= 子は親の箱より左にしない)
    for (const p of ps) {
      const ks = kids.get(p)!.filter((c) => L.rows.get(c) === r);
      ks.forEach((k, i) => {
        const e = ext(k), sib = i ? ks[i - 1]! : null;
        // 置ける一番左: 親の真下 (1 つ目) / 前の兄弟の右 / 同じ段の前の箱の右
        let kx = sib ? x.get(sib)! + BOX_W + sibGap(sib, k) : x.get(p)!;
        if (prev) kx = Math.max(kx, edge + (deep(prev) || deep(k) ? gaps.deep : gaps.leaf) - e[0]);
        // 別の親の箱の真下なら、その箱の右へずらす (上は動かさない)。
        // (S-142i、スイッチ treeIdealFirst) 下に子の無い箱は真下をふさがない = 灰色の兄弟の真下を道の子に使う。完成を押して灰色が外れても並びは跳ねず、
        // 後からその箱に手を置いた時は、その子が右へ出る (上は動かさない)
        // (スイッチ kidsUnderOwn、開発版だけ) 別の親の真下でもずらさない = ぶつかるのは同じ段の前の箱とだけ (11-14 オーナー「何その親の下は置かないみたいなルール撤廃でしょ」)
        for (let moved = !flag("kidsUnderOwn"); moved; ) {
          moved = false;
          for (const a of above) {
            // (S-142j ③、スイッチ hitsSide) 子が ↩ の畳みだけの箱も真下を塞がない (線は手の札で止まる。11-14 オーナー「下に来るはず」)
            if (a === p || (leafFree && !kids.get(a)?.length && !linkDown.has(a))) continue;
            const ax = x.get(a)!;
            if (kx < ax + BOX_W + gaps.leaf && kx + BOX_W + gaps.leaf > ax) { kx = ax + BOX_W + gaps.leaf; moved = true; }
          }
        }
        x.set(k, kx);
        edge = kx + e[1]; prev = k;
      });
    }
  }
  return x;
}

/**
 * 兄弟の順: 完成の箱を下に持つ枝を左端、ほかは渡された順 (結果の順) のまま。
 * 完成の印がまだ無い間は、組んでいる道 (tree-ideal-first、スイッチ treeIdealFirst) を完成への枝の代わりに左端に置く
 */
export function wideOrder(d: TreeDoc): (kids: string[]) => string[] {
  const memo = new Map<string, boolean>();
  const hasDone = (id: string): boolean => {
    let v = memo.get(id);
    if (v === undefined) { memo.set(id, false); v = d.boxes[id]?.done === "main" || (d.boxes[id]?.outs ?? []).some((o) => !!d.boxes[o] && hasDone(o)); memo.set(id, v); }
    return v;
  };
  const ip = idealPath(d), first = (k: string): boolean => (ip ? ip.path.has(k) : hasDone(k));
  return (kids) => [...kids.filter(first), ...kids.filter((k) => !first(k))];
}
