/**
 * _tree-axis-probe.test.ts — 整列の親子の軸のずれを数える台本 (2026-10-22 シミュ部長 8 本目、オーナー「整列でずれるな」)。
 *
 *   pnpm exec vitest run -c scripts/_tree-axis-probe.config.ts
 *
 * 打つ手のある箱ごとに: 子が 1 つ = 子の真ん中と親の真ん中の差、子が複数 = 真ん中の子 (偶数は真ん中の 2 つの中点) と親の差 (線がまっすぐ / 札を中心に左右、どちらも 0 が正しい) と、
 * 一番左と一番右の子の左右の偏り (左右対称なら 0)。行 (y) が親より下にあるかも見る。DUMP=1 で親ごとの行を全部出す
 */
import { it } from "vitest";
import { BOX_W, type TreeDoc } from "../src/services/simulator/tree/tree-model";
import { tidy } from "../src/services/simulator/tree/tree-layout";
import { treeSample } from "../src/services/simulator/tree/tree-samples";

function axis(d: TreeDoc): { one: number[]; many: number[]; sym: number[]; rows: string[] } {
  const mid = (id: string): number => d.boxes[id]!.x + BOX_W / 2;
  const one: number[] = [], many: number[] = [], sym: number[] = [], rows: string[] = [];
  for (const b of Object.values(d.boxes)) {
    if (!b.hand || !b.outs.length) continue;
    const xs = b.outs.map(mid).sort((a, z) => a - z);
    const p = mid(b.id);
    if (xs.length === 1) one.push(Math.abs(xs[0]! - p));
    else {
      const n = xs.length, c = n % 2 ? xs[(n - 1) / 2]! : (xs[n / 2 - 1]! + xs[n / 2]!) / 2;
      many.push(Math.abs(c - p));
      sym.push(Math.abs((xs[0]! + xs[n - 1]!) / 2 - p));
    }
    const left = xs.filter((x) => x < p - 1).length, right = xs.filter((x) => x > p + 1).length;
    rows.push(`${b.id.padEnd(8)} 子 ${xs.length} · 左 ${left} 右 ${right} · 子の x-親 ${xs.map((x) => Math.round(x - p)).join(" ")}`);
  }
  return { one, many, sym, rows };
}
const sum = (a: number[]): string => `${a.length} 件 · ずれ 0 でない ${a.filter((x) => x > 0.5).length} · 最大 ${Math.round(Math.max(0, ...a))}px · 合計 ${Math.round(a.reduce((s, x) => s + x, 0))}px`;

it("見本の木の親子の軸", () => {
  const d = treeSample("gold-ring-suffix")!;
  tidy(d);
  const r = axis(d);
  console.log(`子が 1 つ: ${sum(r.one)}\n子が複数 (真ん中の子と親): ${sum(r.many)}\n子が複数 (端の左右の偏り): ${sum(r.sym)}`);
  if (process.env.DUMP) console.log(r.rows.join("\n"));
});
