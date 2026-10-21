/**
 * _tree-lines-probe.test.ts — ツリーの線と箱の重なりを形だけで数える台本 (2026-10-21 シミュ部長)。
 *
 *   pnpm exec vitest run -c scripts/_tree-lines-probe.config.ts
 *
 * 見る物: 整列した木 (見本 gold-ring-suffix と台本の木) で、戻りの弧 (tree-lines.ts の backRoute) が自分と戻り先以外の箱を通る数、
 * 箱を足すたび (どの芽にも高貴・横に当たり) の箱の重なりの数。画面ではない (画面は tree-mouse.mjs)
 */
import { it } from "vitest";
import { addHit, BOX_H, BOX_W, setHand, tidy, type TreeBox, type TreeDoc } from "../src/services/simulator/tree/tree-model";
import { treeSample } from "../src/services/simulator/tree/tree-samples";
import { handAnchor, routeBacks, type BackReq, type Seg } from "../src/views/simulator/tree/tree-lines";
import { MATCH, matchTargets } from "../src/services/simulator/tree/tree-run";

const A = (m: string, t: number) => ({ modId: `Rings/${m}`, tier: t });
const mk = (id: string, out: TreeBox["out"], parent: string | null, extra: Partial<TreeBox> = {}): TreeBox => ({ id, x: 0, y: 0, out, aim: null, hand: null, outs: [], back: null, done: null, parent, ...extra });
const H = (currency: string) => ({ currency, omens: [], catalyst: null, quality: 0, repeat: null });
function seed(): TreeDoc {
  const b: Record<string, TreeBox> = {
    start: mk("start", "start", null, { hand: H("chaos"), outs: ["b1", "b2", "b3", "b4", "b5", "b6"] }),
    b1: mk("b1", "hit", "start", { aim: A("ItemFoundRarityIncrease", 1), hand: H("exalt"), outs: ["c1", "c2", "c3"] }),
    b2: mk("b2", "hit", "start", { aim: A("IncreasedCastSpeed", 2), back: "start" }),
    b3: mk("b3", "hit", "start", { aim: A("AllResistances", 2) }),
    b4: mk("b4", "hit", "start", { aim: A("FireResistance", 2), done: "main" }),
    b5: mk("b5", "lost", "start", { back: "start" }),
    b6: mk("b6", "junk", "start", { hand: H("annul"), outs: ["f1", "f2"] }),
    c1: mk("c1", "hit", "b1", { aim: A("IncreasedCastSpeed", 2), done: "main" }),
    c2: mk("c2", "hit", "b1", { aim: A("AllResistances", 2), back: "b1" }),
    c3: mk("c3", "junk", "b1", { hand: H("annul"), outs: ["e1", "e2"] }),
    e1: mk("e1", "junkGone", "c3", { back: "b1" }), e2: mk("e2", "lost", "c3", { back: "start" }),
    f1: mk("f1", "junkGone", "b6", { back: "start" }), f2: mk("f2", "lost", "b6", { back: "start" }),
  };
  return { schema: "exiledesk-tree/0", base: "Gold Ring", itemLevel: 82, fracture: A("Special_genesis_tree_caster_SpellDamage", 2), seq: 20, boxes: b };
}
/** 道の角の点 (M・L・Q の終わり) を結んだ折れ線 */
const pts = (d: string): Array<[number, number]> => [...d.replace(/A \S+ \S+ 0 0 [01] /g, "L ").matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
function crosses(d: string, b: TreeBox): boolean {
  const p = pts(d);
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1]!, [x1, y1] = p[i]!;
    for (let t = 0; t <= 1; t += 0.02) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (x > b.x && x < b.x + BOX_W && y > b.y && y < b.y + BOX_H) return true; }
  }
  return false;
}
/** 進む線の真っ直ぐな所 (SimTreePage の edges と同じ作り。横の棒の段ずらしは見ない) */
function fwdSegs(d: TreeDoc): Seg[] {
  return Object.values(d.boxes).filter((b) => b.hand && b.outs.length).flatMap((b) => {
    const px = b.x + BOX_W / 2, py = b.y + BOX_H, kids = b.outs.map((o) => d.boxes[o]!), busY = Math.min(...kids.map((k) => k.y)) - 18;
    return [{ x0: px, y0: py, x1: px, y1: busY }, ...kids.flatMap((k) => [{ x0: px, y0: busY, x1: k.x + BOX_W / 2, y1: busY }, { x0: k.x + BOX_W / 2, y0: busY, x1: k.x + BOX_W / 2, y1: k.y }])];
  });
}
function arcs(d: TreeDoc): { n: number; bad: string[]; same: number; onBus: number; hops: number } {
  const bs = Object.values(d.boxes), bad: string[] = [];
  // 形の合う箱へ は行きうる箱を全部 (画面と同じ)。札の幅は 200px で見る (画面は測った幅)
  const reqs: Array<BackReq & { a: string; z: string }> = [];
  for (const b of bs) {
    const tos = b.back === MATCH ? matchTargets(d, b.id).flatMap((x) => (x.to ? [d.boxes[x.to]!] : [])) : b.back && d.boxes[b.back] ? [d.boxes[b.back]!] : [];
    for (const to of tos) reqs.push({ id: `${b.id}>${to.id}`, a: b.id, z: to.id, from: b, to, end: handAnchor(to, to.hand && to.outs.length ? 200 : null) });
  }
  const fwd = fwdSegs(d);
  const paths = routeBacks(reqs, bs, fwd);
  // 線どうしが同じ所を走る数 (平行で 3px 未満・20px 以上重なる)、戻りの横が進む線の横の棒と同じ高さ (6px 未満) を走る数
  const segsOf = (path: string): Array<[number, number, number, number]> => { const p = pts(path); return p.slice(1).map((q, i) => [p[i]![0], p[i]![1], q[0], q[1]]); };
  const all = reqs.map((r) => ({ r, s: segsOf(paths.get(r.id)!) }));
  let same = 0, onBus = 0;
  const ov = (a0: number, a1: number, b0: number, b1: number): number => Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) for (const [x0, y0, x1, y1] of all[i]!.s) for (const [u0, v0, u1, v1] of all[j]!.s) {
    if (y0 === y1 && v0 === v1 && Math.abs(y0 - v0) < 3 && ov(x0, x1, u0, u1) > 20) same++;
    if (x0 === x1 && u0 === u1 && Math.abs(x0 - u0) < 3 && ov(y0, y1, v0, v1) > 20) same++;
  }
  for (const { s } of all) for (const [x0, y0, x1, y1] of s) for (const f of fwd) if (y0 === y1 && f.y0 === f.y1 && Math.abs(y0 - f.y0) < 6 && ov(x0, x1, f.x0, f.x1) > 20) onBus++;
  const hops = [...paths.values()].reduce((a, p) => a + (p.match(/ A /g)?.length ?? 0), 0);
  for (const r of reqs) {
    const path = paths.get(r.id)!;
    for (const o of bs) if (o.id !== r.a && o.id !== r.z && crosses(path, o)) bad.push(`${r.id} が ${o.id} を通る`);
    if (crosses(path, r.to)) bad.push(`${r.id} が戻り先を通る`);
  }
  return { n: reqs.length, bad, same, onBus, hops };
}
function overlaps(d: TreeDoc): string[] {
  const bs = Object.values(d.boxes), out: string[] = [];
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i]!, b = bs[j]!;
    if (Math.abs(a.x - b.x) < BOX_W && Math.abs(a.y - b.y) < BOX_H) out.push(`${a.id}×${b.id}`);
  }
  return out;
}

it("線と箱の重なり", () => {
  for (const [name, d] of [["台本の木", seed()], ["見本 gold-ring-suffix", treeSample("gold-ring-suffix")!]] as const) {
    tidy(d);
    const a = arcs(d);
    console.log(`■ ${name}: 箱 ${Object.keys(d.boxes).length}・戻りの線 ${a.n} 本・箱を通る ${a.bad.length}${a.bad.length ? ` (${a.bad.join(", ")})` : ""}・線どうしが同じ所 ${a.same}・進む線の棒と同じ高さ ${a.onBus}・跨ぐ ${a.hops}・箱の重なり ${overlaps(d).length}`);
  }
  // 足すたびの重なり: 台本の木 (整列済み) の芽に高貴を置き、当たりを横に足す
  const d = seed();
  tidy(d);
  const log: string[] = [];
  for (const id of ["b3", "b4"]) {
    if (id === "b4") d.boxes.b4!.done = null;
    setHand(d, id, H("exalt"), "add");
    log.push(`${id} に高貴 → 重なり ${overlaps(d).length}`);
    const kid = d.boxes[id]!.outs[0]!;
    addHit(d, id, kid);
    log.push(`${id} の下に当たりを足す → 重なり ${overlaps(d).length}`);
  }
  addHit(d, "start", "b3");
  log.push(`始まりの下に当たりを足す → 重なり ${overlaps(d).length}`);
  console.log(log.join("\n"));
  const a = arcs(d);
  console.log(`足した後の戻りの弧: 箱を通る ${a.bad.length}`);
});
