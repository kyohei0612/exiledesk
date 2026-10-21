/**
 * _tree-merge-probe.test.ts — 戻りの矢印だけの箱から行き先へ流れ込む線 (tree-merge.ts) の数 (2026-10-22 シミュ部長。札は 10-22 にやめて全部箱)。
 *
 *   pnpm exec vitest run -c scripts/_tree-merge-probe.config.ts
 *
 * 見本 gold-ring-suffix を整列して、箱の数・進む線・戻りの線 (本数と束ねた後の本数)・跨ぐ所・木の外側を回る線・箱を通る線を数える。
 * 形だけ (画面ではない)。打つ手の札の幅は 200px で見る (画面は測った幅)
 */
import { it } from "vitest";
import { BOX_H, BOX_W, tidy, type TreeDoc } from "../src/services/simulator/tree/tree-model";
import { treeSample } from "../src/services/simulator/tree/tree-samples";
import { routeBacks, type Pos, type Seg } from "../src/views/simulator/tree/tree-lines";
import { mergeReqs } from "../src/views/simulator/tree/tree-merge";

const pts = (d: string): Array<[number, number]> => [...d.replace(/A \S+ \S+ 0 0 [01] /g, "L ").matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
function through(d: string, b: Pos): boolean {
  const p = pts(d), w = b.w ?? BOX_W, h = b.h ?? BOX_H;
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1]!, [x1, y1] = p[i]!;
    for (let t = 0; t <= 1; t += 0.02) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (x > b.x + 1 && x < b.x + w - 1 && y > b.y + 1 && y < b.y + h - 1) return true; }
  }
  return false;
}
function measure(d: TreeDoc): Record<string, number> {
  tidy(d);
  const pos = (id: string): Required<Pos> => ({ x: d.boxes[id]!.x, y: d.boxes[id]!.y, w: BOX_W, h: BOX_H });
  const all = Object.keys(d.boxes).map(pos);
  const chip = (id: string): number | null => (d.boxes[id]!.hand && d.boxes[id]!.outs.length ? 200 : null);
  const fwd: Seg[] = Object.values(d.boxes).filter((b) => b.hand && b.outs.length).flatMap((b) => {
    const px = b.x + BOX_W / 2, py = b.y + BOX_H, kids = b.outs.map(pos), busY = Math.min(...kids.map((k) => k.y)) - 18;
    return [{ x0: px, y0: py, x1: px, y1: busY }, ...kids.flatMap((k) => { const cx = k.x + (k.w ?? BOX_W) / 2; return [{ x0: px, y0: busY, x1: cx, y1: busY }, { x0: cx, y0: busY, x1: cx, y1: k.y }]; })];
  });
  const { reqs, lines: ml } = mergeReqs(d, pos, chip);
  const fwdMerge = ml.filter((l) => l.kind === "fwd").length;
  const paths = routeBacks(reqs, all, fwd, { bundle: true });
  const minX = Math.min(...all.map((b) => b.x)), maxX = Math.max(...all.map((b) => b.x + (b.w ?? BOX_W)));
  let hops = 0, outer = 0, thru = 0;
  const seen = new Set<string>(), seenFwd = new Set<string>();
  // 案 A の既定で出る線 = 行き先が 1 か所の当たりの箱 (TreeMergeLayer の single)
  const fwdIds = new Set(ml.filter((l) => l.kind === "fwd" && ml.filter((x) => x.from === l.from).length === 1).map((l) => l.id));
  for (const r of reqs) {
    const p = paths.get(r.id)!;
    hops += p.match(/ A /g)?.length ?? 0;
    for (const m of p.matchAll(/ A \S+ \S+ 0 0 [01] (\S+) (\S+)/g)) { const k = `${Math.round(Number(m[1]))}|${Math.round(Number(m[2]))}`; seen.add(k); if (fwdIds.has(r.id)) seenFwd.add(k); }
    if (pts(p).some(([x]) => x < minX - 2 || x > maxX + 2)) outer++;
    for (const id of Object.keys(d.boxes)) { const b = pos(id); if (b === r.from || id === r.id.split(">")[1] || id === r.id.split(">")[0]) continue; if (through(p, b)) thru++; }
  }
  const trunks = new Set(reqs.map((r) => `${r.end.x}|${r.end.y}`)).size;
  const kidsLines = Object.values(d.boxes).reduce((a, b) => a + (b.hand ? b.outs.length : 0), 0);
  return {
    箱: Object.keys(d.boxes).length, 進む線: kidsLines, 戻りの線: reqs.length - fwdMerge, 合流の進む線: fwdMerge,
    入る所: trunks, 跨ぐ: hops, 跨ぐ見た目: seen.size, 跨ぐ案A既定: seenFwd.size, 外周: outer, 箱を通る: thru, 幅: Math.round(maxX - minX),
    高さ: Math.round(Math.max(...all.map((b) => b.y + (b.h ?? BOX_H))) - Math.min(...all.map((b) => b.y))),
  };
}

it("gold-ring-suffix", () => {
  console.log(JSON.stringify(measure(treeSample("gold-ring-suffix")!)));
});
