/**
 * _tree-bounds-probe.test.ts — 見本の木の外枠 (幅・高さ・段の数・通り抜けの数) と、1280・1920・2560 幅で全体表示が選ぶ段を出す台本 (2026-10-22 シミュ部長 7 本目)。
 *
 *   pnpm exec vitest run -c scripts/_tree-bounds-probe.config.ts
 *
 * 全体表示の段は use-tree-flow の fit と同じ式 (余白 12・右下 250、ページの zoom を打ち消した後の枠の大きさは手で渡す。枠の高さはヘッダーの分を引いた目安)。
 */
import { it } from "vitest";
import { boundsOf } from "../src/services/simulator/tree/tree-model";
import { treeSample } from "../src/services/simulator/tree/tree-samples";

const LEVELS = [0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5];
const level = (bw: number, bh: number, w: number, h: number): number => {
  const fz = Math.min((w - 24) / bw, (h - 24) / bh);
  return [...LEVELS].reverse().find((l) => l <= Math.min(1, fz) + 1e-6) ?? 0.2;
};

it("見本の木の外枠", () => {
  const doc = treeSample("gold-ring-suffix")!;
  const b = boundsOf(doc);
  const bs = Object.values(doc.boxes);
  const depths = new Set(bs.map((x) => x.y)).size;
  const pass = bs.filter((x) => x.out === "pass").length;
  console.log(`箱 ${bs.length} (通り抜け ${pass}) · 段 ${depths} · 幅 ${b.w} · 高さ ${b.h}`);
  // 枠の大きさ (ページの zoom を打ち消した CSS px の目安): 1920x911 の枠 ≒ 1920x780、1280x720 ≒ 1280x600、2560x1305 ≒ 2560x1150
  for (const [w, h] of [[1280, 600], [1920, 780], [2560, 1150]] as const) {
    const fw = Math.min((w - 24) / b.w, 9), fh = (h - 24) / b.h;
    console.log(`${w}x${h}: 幅で ${(fw * 100).toFixed(1)}% · 高さで ${(fh * 100).toFixed(1)}% → 段 ${level(b.w, b.h, w, h) * 100}% (右下を空けて ${level(b.w, b.h, w - 250, h) * 100}%)`);
  }
});
