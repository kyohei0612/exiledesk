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
import { backRoute } from "../src/views/simulator/tree/tree-lines";

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
const pts = (d: string): Array<[number, number]> => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
function crosses(d: string, b: TreeBox): boolean {
  const p = pts(d);
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1]!, [x1, y1] = p[i]!;
    for (let t = 0; t <= 1; t += 0.02) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (x > b.x && x < b.x + BOX_W && y > b.y && y < b.y + BOX_H) return true; }
  }
  return false;
}
function arcs(d: TreeDoc): { n: number; bad: string[] } {
  const bs = Object.values(d.boxes), bad: string[] = [];
  let n = 0;
  for (const b of bs) {
    const to = b.back ? d.boxes[b.back] : null;
    if (!to) continue;
    n++;
    const others = bs.filter((x) => x.id !== b.id && x.id !== to.id);
    const path = backRoute(b, to, others);
    for (const o of others) if (crosses(path, o)) bad.push(`${b.id}→${to.id} が ${o.id} を通る`);
  }
  return { n, bad };
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
    console.log(`■ ${name}: 箱 ${Object.keys(d.boxes).length}・戻りの弧 ${a.n} 本・箱を通る ${a.bad.length}${a.bad.length ? ` (${a.bad.join(", ")})` : ""}・箱の重なり ${overlaps(d).length}`);
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
