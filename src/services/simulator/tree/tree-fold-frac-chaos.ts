/**
 * tree-fold-frac-chaos.ts — ✦ の枝とカオスの続きを札に畳む (S-28h、スイッチ foldFracChaos。11-19 オーナー「左枠にたたんでいいかも　カオススパムとかも」)。
 * 消去の札 (tree-strip-fold、S-28g ③) と同じ畳み (StripFold) を足すだけ。描く所だけで、木の中身・回す・精査・保存・段の数えは触らない。
 *   ① ✦ の枝: フラクチャーの手の結果に ✦ の当たりが 2 つ以上ある時、開くのは 1 本 (完成の印の箱を持つ枝、無ければ木の並びの 1 本目) だけ。
 *      ほかの ✦ の当たりの箱は札 1 枚 (下の箱は全部畳む・止まった所は無し)。外れ MOD が固定された枝は畳まない
 *   ② カオスの続き: カオスの手の箱の当たりでない結果の箱にまたカオスの手を置いた所から下 (カオスで続く箱) を札 1 枚。一番上のカオスの箱は見せる。
 *      止まった所 (当たりの箱・カオスでない手・未設定・完成) は札の下に並べる。当たりの箱にカオスを置いた続きは畳まない
 */
import { canSpam, effectOf } from "./tree-hands";
import { subtree, type TreeBox, type TreeDoc } from "./tree-model";
import { treeOrder } from "./tree-order";
import type { StripFold } from "./tree-strip-fold";

const isChaos = (b: TreeBox | undefined): boolean => !!b?.hand && canSpam(b.hand.currency) && !b.done;
/** カオスの続きの中の箱 (当たりでない結果で、カオスの手が置かれた物) */
const chaosNext = (d: TreeDoc, b: TreeBox): TreeBox[] => b.outs.map((o) => d.boxes[o]!).filter((c) => !!c && c.out !== "hit" && isChaos(c));

/** ① ✦ の枝の畳み (head = 畳む ✦ の当たりの箱、mids = その下の全部) */
function fracFolds(d: TreeDoc, out: Map<string, StripFold>): void {
  const cmp = treeOrder(d);
  for (const b of Object.values(d.boxes)) {
    if (!b.hand || effectOf(b.hand.currency) !== "fracture") continue;
    const fr = b.outs.map((o) => d.boxes[o]!).filter((c) => !!c && c.out === "hit" && !!c.aim?.fractured).sort((x, y) => cmp(x.id, y.id));
    if (fr.length < 2) continue;
    const keep = fr.find((c) => subtree(d, c.id).some((x) => d.boxes[x]?.done === "main")) ?? fr[0]!;
    for (const c of fr) if (c !== keep && !out.has(c.id)) out.set(c.id, { head: c.id, mids: subtree(d, c.id), stops: [], steps: 0, tucked: [], kind: "frac" });
  }
}

/**
 * ② カオスの続きの畳み。一番上のカオスの箱 (始まり h、当たりの箱なども多い) は見せ、その当たりでない結果にまたカオスを置いた箱 (c) から下の
 * カオスの続きを札 1 枚 (head = c) にする。段の数 n は h を入れて数える
 */
function chaosFolds(d: TreeDoc, out: Map<string, StripFold>): void {
  for (const h of Object.values(d.boxes)) {
    // 始まり = カオスの箱で、親からカオスの続きで来ていない (親がカオスで自分が当たりでない、なら親の続きの中)
    if (!isChaos(h)) continue;
    const p = d.boxes[h.parent ?? ""];
    if (p && isChaos(p) && h.out !== "hit") continue;
    for (const c of chaosNext(d, h)) {
      if (out.has(c.id)) continue;
      const mids: string[] = [], stops: string[] = [];
      let steps = 0;
      const walk = (b: TreeBox, n: number): void => {
        mids.push(b.id); steps = Math.max(steps, n);
        const next = new Set(chaosNext(d, b).map((x) => x.id));
        for (const o of b.outs) { const x = d.boxes[o]; if (!x) continue; if (next.has(o)) walk(x, n + 1); else stops.push(o); }
      };
      walk(c, 2);
      out.set(c.id, { head: c.id, mids, stops, steps, tucked: [], kind: "chaos" });
    }
  }
}

/** 足す畳み全部。✦ の枝の中のカオスの続きも畳みを持つ (✦ の札を開いた時に畳んだ形で出る。閉じている間は ✦ の札の中で描かない) */
export function fracChaosFolds(d: TreeDoc, out: Map<string, StripFold>): void {
  fracFolds(d, out);
  chaosFolds(d, out);
}
