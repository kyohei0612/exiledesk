/**
 * tree-place.ts — 箱の位置を木から 1 つの計算で決める (S-140〜S-143、スイッチ layoutOne。10-28 深夜オーナー「そもそも直し方に問題あるやろ枠の立て方の設計図ないんか」「おｋ進めてくれ」)。
 * 前は整列 (tidy)・手を足した時 (spread・makeRoom・slideSiblings・pushRight)・段揃え (settleRows)・合流 (centerMerged)・後から滑らせる (slideAll) が別々に動かし、
 * 手を足した時だけ直る・開くと戻る、の継ぎはぎになっていた。ここでは毎回、木の形 (親子・結果の順・まとめ) だけから同じ答えを出す:
 *  - 段 (縦): 深さごとに上の枠を揃える (S-141、tree-row-tops の rowLayout)
 *  - 列 (横): 箱ごとに部分木の帯 (その箱と下の全部の箱が使う横の幅) を取り、子の帯を左から結果の順に並べる。帯の間は どちらも箱 1 つなら 24、
 *    どちらかに下の段があれば 72 (線の通り道)。親は真ん中の子の真上 (偶数は真ん中の 2 つの間)。帯は全部の段を通すので、別の親の子の真上に箱は来ない (S-142)
 *  - 合流: まとめ先は親たちの真ん中、帯がぶつかれば元の親の下 (S-143、centerMerged)
 * 始まりの箱の位置は動かさない (木ごと合わせる)。動かしたら true
 */
import { BOX_W, type TreeDoc } from "./tree-model";
import { centerMerged, drawnKids, rowLayout } from "./tree-row-tops";
import { OUT_ORDER } from "./tree-layout";
import { flag } from "../../../web/release-flags";

/** 帯の間: どちらも箱 1 つだけ / どちらかに下の段がある (戻り・再挑戦の線が箱の横へ 24 出て、ほかの箱から 10 以上離れて通れる、S-145) */
const GAP_LEAF = 24, GAP_DEEP = 72;

export function placeTree(d: TreeDoc, heightOf: (id: string) => number, chipW?: (id: string) => number | undefined): boolean {
  const start = d.boxes.start;
  if (!start) return false;
  const before = new Map(Object.values(d.boxes).map((b) => [b.id, `${b.x},${b.y}`]));
  // 描く子を結果の順に (当たり → 狙いが消えた → 外れが消えた → 外れ、同じ順は作った順)
  const kidsOf = (id: string): string[] => drawnKids(d, d.boxes[id]!).map((o, i) => ({ o, i })).sort((a, z) => OUT_ORDER[d.boxes[a.o]!.out] - OUT_ORDER[d.boxes[z.o]!.out] || a.i - z.i).map((x) => x.o);
  /** 子の箱の x (親の箱の x からの差) */
  const rel = new Map<string, number>();
  /** 部分木の帯 [左, 右] (その箱の x からの差) */
  const strip = (id: string, seen: Set<string>): [number, number] => {
    seen.add(id);
    const ks = kidsOf(id).filter((k) => !seen.has(k));
    // 手の札が箱より広い時は札の幅も帯に入れる (札の名前を切らない幅)
    const w = ks.length ? chipW?.(id) ?? 0 : 0;
    const own: [number, number] = [Math.min(0, BOX_W / 2 - w / 2), Math.max(BOX_W, BOX_W / 2 + w / 2)];
    if (!ks.length) return own;
    const ss = ks.map((k) => strip(k, seen));
    const offs: number[] = [];
    let cur = 0;
    ks.forEach((k, i) => {
      if (i) cur += kidsOf(ks[i - 1]!).length || kidsOf(k).length ? GAP_DEEP : GAP_LEAF;
      offs.push(cur - ss[i]![0]);
      cur += ss[i]![1] - ss[i]![0];
    });
    const n = ks.length, h = Math.floor(n / 2);
    const px = n % 2 ? offs[h]! : (offs[h - 1]! + offs[h]!) / 2;
    ks.forEach((k, i) => rel.set(k, offs[i]! - px));
    return [Math.min(own[0], -px), Math.max(own[1], cur - px)];
  };
  /**
   * スイッチ rowPack (S-142b): 帯を段ごとの左右の端 (箱の x からの差、[k] = k 段下) で取り、兄弟の部分木を同じ段どうしでぶつからない一番左へ寄せる。
   * 上の段が空いている所へほかの枝が入る。縦の線・枝分かれの横線は自分の部分木の段の範囲の中なので、ほかの枝の箱は乗らない
   */
  const rows = (id: string, seen: Set<string>): Array<[number, number]> => {
    seen.add(id);
    const ks = kidsOf(id).filter((k) => !seen.has(k));
    const w = ks.length ? chipW?.(id) ?? 0 : 0;
    const own: [number, number] = [Math.min(0, BOX_W / 2 - w / 2), Math.max(BOX_W, BOX_W / 2 + w / 2)];
    if (!ks.length) return [own];
    const cs = ks.map((k) => rows(k, seen));
    const offs: number[] = [], acc: Array<[number, number]> = [];
    ks.forEach((k, i) => {
      const c = cs[i]!;
      let off = 0;
      if (i) {
        const gap = kidsOf(ks[i - 1]!).length || kidsOf(k).length ? GAP_DEEP : GAP_LEAF;
        off = -Infinity;
        for (let r = 0; r < Math.min(acc.length, c.length); r++) off = Math.max(off, acc[r]![1] + gap - c[r]![0]);
        // 兄弟は左から結果の順 (前の兄弟の箱より左へは置かない)
        off = Math.max(off, offs[i - 1]! + BOX_W + gap);
      }
      offs.push(off);
      c.forEach(([l, r], j) => { const a = acc[j]; acc[j] = a ? [Math.min(a[0], l + off), Math.max(a[1], r + off)] : [l + off, r + off]; });
    });
    const n = ks.length, h = Math.floor(n / 2);
    const px = n % 2 ? offs[h]! : (offs[h - 1]! + offs[h]!) / 2;
    ks.forEach((k, i) => rel.set(k, offs[i]! - px));
    return [[Math.min(own[0], offs[0]! - px), Math.max(own[1], offs[n - 1]! + BOX_W - px)], ...acc.map(([l, r]): [number, number] => [l - px, r - px])];
  };
  if (flag("rowPack")) rows("start", new Set());
  else strip("start", new Set());
  const L = rowLayout(d, heightOf);
  const put = (id: string, x: number): void => {
    const b = d.boxes[id]!, r = L.rows.get(id);
    b.x = Math.round(x);
    if (id !== "start" && r != null) b.y = L.top[r]!;
    for (const k of kidsOf(id)) if (rel.has(k)) put(k, x + rel.get(k)!);
  };
  put("start", start.x);
  centerMerged(d);
  return Object.values(d.boxes).some((b) => before.get(b.id) !== `${b.x},${b.y}`);
}
