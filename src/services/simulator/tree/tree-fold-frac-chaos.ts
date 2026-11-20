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
import { flowDepth } from "./tree-flow-once";
import { annulStackOn, type StripFold } from "./tree-strip-fold";

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
      out.set(c.id, { head: c.id, mids, stops, steps, tucked: [], kind: "chaos", ...(annulStackOn() ? { stack: true as const, keep: c.id } : {}) }); // (S-28i) 消去と同じ縦の重ね
    }
  }
}

/** (④) 手の鍵 = カレンシー・お告げ・目標・残したい MOD・触媒・狙い無し、と結果の当たりの ☑ の狙い */
export function handKeyOf(d: TreeDoc, b: TreeBox | undefined): string | null {
  const h = b?.hand;
  if (!h) return null;
  const aims = b!.outs.map((o) => d.boxes[o]).filter((c) => c?.out === "hit" && c.aim).map((c) => c!.aim!.modId).sort();
  return JSON.stringify([h.currency, h.omens, (h.targets ?? []).map((t) => `${t.modId}:${t.vi}:${t.value}`).sort(), (h.keep ?? []).map((a) => a.modId).sort(), h.catalyst, !!h.free, !!h.noUse, aims]);
}
/** 箱から下へ 1 段ずつ、置いた手の組 (手の無い段で止める)。full = 手の鍵で比べる (④)、無ければカレンシーの種類だけ (③) */
function handLevels(d: TreeDoc, id: string, full = false): string[] {
  const lv: string[] = [];
  for (let row = [id], n = 0; row.length && n < 40; n++) {
    const hs = [...new Set(row.map((x) => (full ? handKeyOf(d, d.boxes[x]) : d.boxes[x]?.hand?.currency)).filter((c): c is string => !!c))].sort();
    if (!hs.length) break;
    lv.push(hs.join("+"));
    row = row.flatMap((x) => d.boxes[x]?.outs ?? []);
  }
  return lv;
}
/** 両方に手のある段まで、手の種類の組が全部同じ */
const sameFlow = (a: string[], b: string[]): boolean => a.slice(0, Math.min(a.length, b.length)).every((x, i) => x === b[i]);

/**
 * ④ 兄弟の枠を左の枠の後ろへ重ねる (11-20 オーナー「1A 2A 3B」)。前の ③ (フラクチャーを置いた箱だけの札「同じ流れの枝 n 本」) は ④ に置き換えて消した
 * (11-20 オーナー「兄弟の奴最初に作ったたたみ方消さないと確認できなくね」)。フラクチャーを置いた箱は ③ と同じく親の手を問わない組 "F"。
 * ①② の畳みの中の箱は数えない。チュートリアル中 (stackOff) は畳まない
 */
function sameFolds(d: TreeDoc, out: Map<string, StripFold>): void {
  const cmp = treeOrder(d), inside = new Set([...out.values()].flatMap((f) => f.mids.filter((id) => id !== f.head)));
  const byRow = new Map<string, TreeBox[]>();
  if (!stackOn()) return;
  for (const b of Object.values(d.boxes)) {
    // 手の無い枠も出た時から兄弟 (11-20 夜オーナー「枠が出来た瞬間兄弟だよね」)。完成・↩ の箱は手を置く枠でないので入れない
    if ((!b.hand && (b.done || b.back)) || inside.has(b.id) || out.has(b.id)) continue;
    const frac = !!b.hand && effectOf(b.hand.currency) === "fracture";
    const k = frac ? "F" : siblingKey(d, b);
    if (k === null) continue;
    const r = `${flowDepth(d, b.id)}|${k}`;
    byRow.set(r, [...(byRow.get(r) ?? []), b]);
  }
  // 浅い段から。上で畳んだ列の中の箱は下の段の組に入れない (畳みが入れ子にならない)
  for (const [, row] of [...byRow].sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    const groups: Array<{ lv: string[]; ids: string[] }> = [];
    for (const b of row.filter((x) => !inside.has(x.id)).sort((x, y) => cmp(x.id, y.id))) {
      const lv = handLevels(d, b.id, true);
      // 手の無い枠どうしは 1 つの組 (どれかに手を置くと兄弟へ写る)。手のある組には入れない = 写した先で打てずに手の無いまま残った枠は重なりから出て開く (今のまま)
      const g = groups.find((x) => (x.lv.length === 0) === (lv.length === 0) && sameFlow(x.lv, lv));
      if (g) g.ids.push(b.id); else groups.push({ lv, ids: [b.id] });
    }
    for (const { ids } of groups) {
      if (ids.length < 2) continue;
      const done = (id: string): boolean => subtree(d, id).some((x) => d.boxes[x]?.done === "main");
      // 開くのは一番左の枠。完成の印を持つ列は畳まない (11-20 オーナー「2A」)
      const keep = ids[0]!, cols = ids.filter((id) => id !== keep && !done(id));
      if (!cols.length) continue;
      const mids = cols.flatMap((id) => subtree(d, id));
      for (const m of mids) inside.add(m);
      out.set(cols[0]!, { head: cols[0]!, mids, stops: [], steps: cols.length, tucked: [], kind: "same", cols, keep, stack: true });
    }
  }
}

/** (④) 兄弟の畳みを使うか (スイッチ foldFracChaos の間。チュートリアルのコースの中は畳まない = 画面が setStackOff で渡す) */
let stackOff: () => boolean = () => false;
export const setStackOff = (f: () => boolean): void => { stackOff = f; };
const stackOn = (): boolean => !stackOff();
/**
 * (④) 兄弟の鍵: 親の手 (手の鍵) + 結果の種類 + 狙い + 名前の組 (始まりからの道の当たりの ☑ の狙いと ✦ で固定された狙い)。
 * 側 (P / S) は見ない。S-190d の兄弟枠と同じ見方を描く側だけで組む (保存しない)
 */
function siblingKey(d: TreeDoc, b: TreeBox): string | null {
  const p = d.boxes[b.parent ?? ""], hk = handKeyOf(d, p);
  if (!hk || b.out === "pass" || b.out === "start") return null;
  const names: string[] = [];
  for (let x: TreeBox | undefined = b, n = 0; x && n < 200; x = d.boxes[x.parent ?? ""], n++) if (x.out === "hit" && x.aim) names.push(`${x.aim.fractured ? "✦" : ""}${x.aim.modId}`);
  return JSON.stringify([hk, b.out, b.aim?.modId ?? null, names.sort()]);
}

/**
 * (④、11-20 オーナー「1A」) 畳んだまま左の枠 (または左の枠の下の箱) の手を替える・消す時の、畳んだ兄弟の同じ場所の箱。
 * 同じ場所 = 左の枠から下へ、結果の種類と狙いの並び (同じ種類どうしは木の並びで何番目か) が同じ箱。folds = 今畳んでいる物
 */
export function foldMirrors(d: TreeDoc, id: string, folds: ReadonlyMap<string, StripFold>): string[] {
  const out: string[] = [], cmp = treeOrder(d);
  const step = (x: TreeBox): string => `${x.out}|${x.aim?.modId ?? ""}`;
  for (const f of folds.values()) {
    if (!f.stack || !f.keep) continue;
    // 左の枠から id までの道 (結果の種類と、同じ種類の兄弟の中の何番目か)
    const path: Array<[string, number]> = [];
    let x = d.boxes[id];
    while (x && x.id !== f.keep) {
      const p = d.boxes[x.parent ?? ""];
      if (!p) break;
      const mates = p.outs.map((o) => d.boxes[o]!).filter((c) => !!c && step(c) === step(x!)).sort((a, c) => cmp(a.id, c.id));
      path.unshift([step(x), mates.findIndex((c) => c.id === x!.id)]);
      x = p;
    }
    if (x?.id !== f.keep) continue;
    for (const c of f.cols ?? []) {
      let y: TreeBox | undefined = d.boxes[c];
      for (const [k, i] of path) {
        const mates: TreeBox[] = (y?.outs ?? []).map((o) => d.boxes[o]!).filter((m) => !!m && step(m) === k).sort((a, m) => cmp(a.id, m.id));
        y = mates[i];
        if (!y) break;
      }
      if (y) out.push(y.id);
    }
  }
  return out;
}

/** 足す畳み全部。✦ の枝の中のカオスの続きも畳みを持つ (✦ の札を開いた時に畳んだ形で出る。閉じている間は ✦ の札の中で描かない) */
export function fracChaosFolds(d: TreeDoc, out: Map<string, StripFold>): void {
  fracFolds(d, out);
  chaosFolds(d, out);
  sameFolds(d, out);
}
