/**
 * tree-layout.ts — ツリーの整列 (tidy) と段の札の高さ (bandsOf)。tree-model.ts から分けた (2026-10-24、500 行の決まり。中身は前のまま)
 */
import { aimKey, BOX_W, GAP_Y, type TreeBox, type TreeDoc } from "./tree-model";

/** 整列で兄弟を並べる順 (当たり → 狙いが消えた → 外れが消えた → 外れ。外れは一番右) */
const OUT_ORDER: Record<TreeBox["out"], number> = { start: 0, hit: 0, any: 0, pass: 0, branch: 0, lost: 1, junkGone: 2, junk: 3 };
/** 整列の兄弟の間 (横の＋が 14px はみ出す分 + 戻りの線の縦の通り道 4 本分、オーナー 10-22「整列で箱の間に通り道の分のすき間」) */
const TIDY_GAP = 64;
/** 親から 2 行以上下の子へ降りる縦の線の、輪郭に入れる幅 (箱の真ん中から左右) */
const STEM = 20;
/** 段の高さに収める物: "all" = 間の箱を全部 / "path" = 次の当たりへ続く道だけ (戻るだけの箱は次の段の高さまで下がってよい) */
const BAND: "all" | "path" = "path";
/**
 * 箱の行 (y = 行 × GAP_Y。10-22 オーナー「2 つ目までしか完成していないのに、3 つ目まで完成している箱と同じ段にいる。整列させるなら MOD の段を合わせて。
 * 当たりの場合だけ気にすればいい」): 当たりの箱は道で揃った狙いの数 n の段 (全部の枝で同じ高さ)、ほかの箱 (外れ・消えた・打った後・品質の後) は
 * 直前の当たり (か始まり) の何手下かで、その段と次の段の間に置く。段 n の高さ = 1 + その段の間の箱の一番深い手数 (BAND)。
 * 狙いが消えた後の当たりなど、揃った数が親の段以下の時は親の段の次 (高さは揃わない)
 */
function rowsOf(d: TreeDoc, kids: (id: string) => string[]): Map<string, number> {
  const band = new Map<string, number>(), sub = new Map<string, number>(), held = new Map<string, Set<string>>();
  const walk = (id: string, parent: string | null): void => {
    const b = d.boxes[id]!;
    const h = new Set(parent ? held.get(parent)! : []);
    if (b.out === "hit" && b.aim) h.add(aimKey(b.aim));
    held.set(id, h);
    if (!parent) { band.set(id, 0); sub.set(id, 0); }
    else if (b.out === "hit") { band.set(id, Math.max(h.size, band.get(parent)! + 1)); sub.set(id, 0); }
    else { band.set(id, band.get(parent)!); sub.set(id, sub.get(parent)! + 1); }
    for (const k of kids(id)) walk(k, id);
  };
  walk("start", null);
  // 段ごとの高さ (BAND = "path" の時は、次の段の当たりの親だけ数える)
  const deep = new Map<number, number>();
  for (const [id, n] of band) {
    const b = d.boxes[id]!;
    if (BAND === "path" && !b.outs.some((k) => d.boxes[k]!.out === "hit")) continue;
    deep.set(n, Math.max(deep.get(n) ?? 0, sub.get(id)!));
  }
  const top: number[] = [0];
  const max = Math.max(...band.values());
  for (let n = 1; n <= max; n++) top[n] = top[n - 1]! + 1 + (deep.get(n - 1) ?? 0);
  return new Map([...band].map(([id, n]) => [id, top[n]! + sub.get(id)!]));
}
/**
 * 整列 (2026-10-22 オーナー「ごちゃっとなってるのを整列。2 段目を合わせる、矢印が重ならない」):
 * 行 (rowsOf: 当たりの箱は揃った狙いの数の段) ごとに横一列、兄弟は親の下に OUT_ORDER の順。行ごとの輪郭で寄せるので箱は重ならない。
 * 始まりの箱は x = 0 のまま。線は直角の木の線、戻りの矢印は既定では引かない (画面の側、SimTreePage の edges・backLine。10-22 整列の定義)。
 * chipW = 箱の下の手の札の幅 (ツリーの座標、名前を切らない幅。画面で測って渡す)。札も行の輪郭に入れて、同じ高さに並ぶ札どうしも TIDY_GAP 空ける
 * (10-25 オーナー「ここが詰まるな」= ルーンの合金と無限のパーフェクトエッセンスの札が並んで名前が切れた。前は箱だけで寄せていた)
 */
export function tidy(d: TreeDoc, chipW?: (id: string) => number | undefined): void {
  const kids = (id: string): string[] => {
    const b = d.boxes[id]!;
    b.outs = b.outs.map((o, i) => ({ o, i })).sort((a, z) => OUT_ORDER[d.boxes[a.o]!.out] - OUT_ORDER[d.boxes[z.o]!.out] || a.i - z.i).map((x) => x.o);
    return b.outs;
  };
  const row = rowsOf(d, kids);
  /**
   * 部分木の輪郭 (行ごとの左端・右端、部分木の頭の箱の x からの差)。兄弟は左から、同じ行で TIDY_GAP 空く所まで寄せる
   * (部分木の幅ごと足すと、深い枝の横の浅い枝の下が空いたまま木が広がった。10-22 見本で全体表示が 25%)。
   * 親から 2 行以上下の子は、間の行に縦の線の幅 (STEM) も入れる (線が隣の箱を通らない)
   */
  type Contour = Map<number, [number, number]>;
  const put = (c: Contour, r: number, l: number, rr: number): void => { const v = c.get(r); c.set(r, v ? [Math.min(v[0], l), Math.max(v[1], rr)] : [l, rr]); };
  const rel = new Map<string, number>();
  const layout = (id: string): Contour => {
    const ks = kids(id), me = row.get(id)!;
    const acc: Contour = new Map();
    const offs: number[] = [], cs: Contour[] = [];
    for (const k of ks) {
      const c = layout(k);
      for (let r = me + 1; r < row.get(k)!; r++) put(c, r, BOX_W / 2 - STEM, BOX_W / 2 + STEM);
      cs.push(c);
      let off = 0;
      if (offs.length) {
        off = -Infinity;
        for (const [r, [l]] of c) { const a = acc.get(r); if (a) off = Math.max(off, a[1] + TIDY_GAP - l); }
        if (off === -Infinity) off = 0;
      }
      offs.push(off);
      for (const [r, [l, rr]] of c) put(acc, r, l + off, rr + off);
    }
    // 親の軸 = 真ん中の子 (偶数は真ん中の 2 つの中点)。子が 1 つなら親・札・子が 1 本の縦の線、3 つなら真ん中の子へまっすぐ (オーナー 10-22「整列でずれるな」。
    // 前は一番左と一番右の子の真ん中で、幅の違う兄弟だと真ん中の子が 163px までずれた)。端までの長さが左右で違えば、短い側の兄弟を組ごと外へ押して左右対称に (外へ押すだけなので重ならない、行はそのまま)
    const n = ks.length, half = Math.floor(n / 2);
    const px = !n ? 0 : n % 2 ? offs[half]! : (offs[half - 1]! + offs[half]!) / 2;
    if (n > 1) {
      const l = px - offs[0]!, r = offs[n - 1]! - px;
      if (l < r) for (let i = 0; i < half; i++) offs[i]! -= r - l;
      else if (r < l) for (let i = n - half; i < n; i++) offs[i]! += l - r;
      acc.clear();
      cs.forEach((c, i) => { for (const [rw, [cl, cr]] of c) put(acc, rw, cl + offs[i]!, cr + offs[i]!); });
    }
    ks.forEach((k, i) => rel.set(k, offs[i]! - px));
    const out: Contour = new Map([[me, [0, BOX_W]]]);
    // 手の札 (箱の下の真ん中、行の間 = me + 0.5)
    const w = ks.length ? chipW?.(id) : undefined;
    if (w) put(out, me + 0.5, BOX_W / 2 - w / 2, BOX_W / 2 + w / 2);
    for (const [r, [l, rr]] of acc) put(out, r, l - px, rr - px);
    return out;
  };
  const place = (id: string, x: number): void => {
    const b = d.boxes[id]!;
    b.x = Math.round(x);
    b.y = row.get(id)! * GAP_Y;
    for (const k of b.outs) place(k, x + rel.get(k)!);
  };
  layout("start");
  place("start", 0);
  // 始まりの箱は x = 0 に戻す (木ごとずらす)
  const dx = -d.boxes.start!.x;
  for (const b of Object.values(d.boxes)) b.x += dx;
}

/**
 * 段の目印 (10-22 オーナー「段ごとに 1 つ揃った / 2 つ揃った…」): 当たりの箱の揃った狙いの数 n → その段の y (箱の上の辺)。
 * 手で動かして同じ数の当たりの箱の高さが揃っていない段は出さない (整列の後だけ出る)。
 * 0 (狙いをまだ選んでいない当たりの箱だけ) は出さない (白に変成を足すと「0 つ揃った」と出て迷わせた、10-23 モンキー 3 回目)
 */
export function bandsOf(d: TreeDoc): { n: number; y: number }[] {
  const ys = new Map<number, Set<number>>();
  for (const b of Object.values(d.boxes)) {
    if (b.out !== "hit") continue;
    const held = new Set<string>();
    for (let x: TreeBox | undefined = b; x; x = x.parent ? d.boxes[x.parent] : undefined) if (x.out === "hit" && x.aim) held.add(aimKey(x.aim));
    ys.set(held.size, (ys.get(held.size) ?? new Set()).add(b.y));
  }
  return [...ys].filter(([n, s]) => n > 0 && s.size === 1).map(([n, s]) => ({ n, y: [...s][0]! })).sort((a, z) => a.n - z.n);
}
