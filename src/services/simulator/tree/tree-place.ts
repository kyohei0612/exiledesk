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
import { centerMerged, drawnKids, rowLayout, type RowLayout } from "./tree-row-tops";
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
  const L = rowLayout(d, heightOf);
  const xs = flag("rowNear") ? near(d, L, kidsOf, chipW) : null;
  if (xs) {
    for (const [id, x] of xs) {
      const b = d.boxes[id]!, r = L.rows.get(id);
      b.x = Math.round(x);
      if (id !== "start" && r != null) b.y = L.top[r]!;
    }
    centerMerged(d);
    return Object.values(d.boxes).some((b) => before.get(b.id) !== `${b.x},${b.y}`);
  }
  if (flag("rowPack")) rows("start", new Set());
  else strip("start", new Set());
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

/** 横線とほかの親の縦の線の間 (これ未満は横切るとみなす) */
const CROSS_X = 12;

/**
 * スイッチ rowNear (S-142c): 上の段から 1 段ずつ置く。兄弟の間はその段の箱だけで決め (下の段は見ない)、ほかの親の子の組とぶつかる時はその段の組だけを押し分ける
 * (組の順は変えず、ぶつかった組を 1 つにして親の真下からのずれの平均を 0 に)。上の段は広げないので、親の真下から外れる組が出る。
 * 枝分かれの横線がほかの親の縦の線を横切る時だけ、その 2 つの親の間 (その段) を広げてやり直す。決まらなければ null (前の置き方)
 */
function near(d: TreeDoc, L: RowLayout, kidsOf: (id: string) => string[], chipW?: (id: string) => number | undefined): Map<string, number> | null {
  const start = d.boxes.start!;
  const kids = new Map<string, string[]>(), up = new Map<string, string>(), seen = new Set<string>(["start"]);
  const walk = (id: string): void => {
    const ks = kidsOf(id).filter((k) => !seen.has(k));
    for (const k of ks) { seen.add(k); up.set(k, id); }
    kids.set(id, ks);
    ks.forEach(walk);
  };
  walk("start");
  const ext = (id: string): [number, number] => { const w = kids.get(id)!.length ? chipW?.(id) ?? 0 : 0; return [Math.min(0, BOX_W / 2 - w / 2), Math.max(BOX_W, BOX_W / 2 + w / 2)]; };
  const gap = (a: string, b: string): number => (kids.get(a)!.length || kids.get(b)!.length ? GAP_DEEP : GAP_LEAF);
  const byRow: string[][] = [];
  for (const id of seen) { const r = L.rows.get(id); if (id !== "start" && r) (byRow[r] ??= []).push(id); }
  /** 箱の左に足す幅 (同じ段の左の箱との間、兄弟でも別の組でも)。横切りを直す時だけ増える */
  const extra = new Map<string, number>();
  type Group = { ks: string[]; offs: number[]; want: number; l: number; r: number };
  for (let round = 0; round < 80; round++) {
    const x = new Map<string, number>([["start", start.x]]);
    const cx = (id: string): number => x.get(id)! + BOX_W / 2;
    const spans: Array<{ p: string; ks: string[] }> = [];
    for (let r = 1; r < byRow.length; r++) {
      const ps = [...new Set((byRow[r] ?? []).map((id) => up.get(id)!))].filter((p) => x.has(p)).sort((a, z) => x.get(a)! - x.get(z)!);
      // 組ごとに、親の真下を真ん中にした置き場 (want = 一番左の子の x、offs = 一番左の子からの差)
      const gs: Group[] = ps.map((p) => {
        const ks = kids.get(p)!.filter((k) => L.rows.get(k) === r), offs: number[] = [];
        let cur = 0;
        ks.forEach((k, i) => { if (i) cur += ext(ks[i - 1]!)[1] + gap(ks[i - 1]!, k) + (extra.get(k) ?? 0) - ext(k)[0]; offs.push(cur); });
        const n = ks.length, h = Math.floor(n / 2), px = n % 2 ? offs[h]! : (offs[h - 1]! + offs[h]!) / 2;
        spans.push({ p, ks });
        return { ks, offs, want: x.get(p)! - px, l: ext(ks[0]!)[0], r: offs[n - 1]! + ext(ks[n - 1]!)[1] };
      });
      // ぶつかる組を 1 つにまとめ、まとめた組のずれの平均を 0 に (左から順に、前の組とぶつかる間まとめ続ける)
      const st: Array<{ gs: Group[]; at: number[]; left: number }> = [];
      for (const g of gs) {
        let b = { gs: [g], at: [0], left: g.want };
        while (st.length) {
          const a = st[st.length - 1]!, la = a.gs[a.gs.length - 1]!, g0 = b.gs[0]!;
          const gp = gap(la.ks[la.ks.length - 1]!, g0.ks[0]!) + (extra.get(g0.ks[0]!) ?? 0), edge = a.at[a.at.length - 1]! + la.r + gp;
          if (a.left + edge <= b.left + g0.l) break;
          st.pop();
          const gs2 = [...a.gs, ...b.gs], at2 = [...a.at, ...b.at.map((o) => o + edge - g0.l)];
          b = { gs: gs2, at: at2, left: gs2.reduce((s, g2, i) => s + g2.want - at2[i]!, 0) / gs2.length };
        }
        st.push(b);
      }
      for (const b of st) b.gs.forEach((g, i) => g.ks.forEach((k, j) => x.set(k, b.left + b.at[i]! + g.offs[j]!)));
    }
    if ([...seen].some((id) => !x.has(id) && L.rows.has(id))) return null;
    // 横線 (子が 2 つ以上) がほかの親の縦の線 (同じ段の間の、親と子の真ん中) を横切るか
    let hit: { p: string; q: string; need: number } | null = null;
    for (const s of spans) {
      if (s.ks.length < 2 || hit) continue;
      const vs = [cx(s.p), ...s.ks.map(cx)], l = Math.min(...vs), rr = Math.max(...vs), row = L.rows.get(s.ks[0]!);
      for (const o of spans) {
        if (o.p === s.p || L.rows.get(o.ks[0]!) !== row) continue;
        for (const v of [cx(o.p), ...o.ks.map(cx)]) {
          if (v <= l - CROSS_X || v >= rr + CROSS_X) continue;
          hit = { p: s.p, q: o.p, need: Math.ceil(v > cx(s.p) ? rr + CROSS_X - v : v + CROSS_X - l) };
          break;
        }
        if (hit) break;
      }
    }
    if (!hit) return x;
    // 横切った 2 つの親が同じ段なら、その段の 2 つの間 (右の親の左) だけを広げる。段が違えば (畳んだ直線) 2 つの枝が分かれる所の右の兄弟の左
    let right: string | undefined;
    if (L.rows.get(hit.p) === L.rows.get(hit.q)) right = cx(hit.p) > cx(hit.q) ? hit.p : hit.q;
    else {
      const chain = (id: string): string[] => { const c = [id]; for (let u = up.get(id); u; u = up.get(u)) c.push(u); return c; };
      const cp = chain(hit.p), cq = chain(hit.q), sq = new Set(cq), i = cp.findIndex((a) => sq.has(a));
      if (i < 1) return null;
      const top = cp[i]!, a = cp[i - 1]!, b = cq[cq.indexOf(top) - 1]!, sib = kids.get(top)!;
      right = sib.indexOf(a) > sib.indexOf(b) ? a : b;
    }
    extra.set(right, (extra.get(right) ?? 0) + Math.max(GAP_LEAF, hit.need));
  }
  return null;
}
