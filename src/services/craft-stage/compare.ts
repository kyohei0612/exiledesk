/**
 * compare.ts — アイテム 2 つの違い (POE2Tube 要望 ⑪-3「装備を入れ替えるかの見方」、2026-09-29)
 *
 * MOD の文面の数値を # にした形 (同じ効果) で揃え、1 つ目の数値の差を出す。片方にしか無い物は「A だけ」「B だけ」。
 * 数値は MOD の values (転がった値)。エンチャント・固有の効果は比べない (MOD だけ)。
 */
import type { StageItem } from "./types";
import { allMods } from "./stage-core";

export interface DiffLine {
  /** 日本語の文面 (数値は #) */
  text: string;
  a: number | null;
  b: number | null;
  /** b - a (片方だけの時はその値、符号はそのまま) */
  delta: number;
  only: "a" | "b" | null;
}

/** 転がった値だけを順に # にする (「1 体ごとに」の 1 などは残す) */
function templateOf(text: string, values: readonly number[]): string {
  let out = text;
  let from = 0;
  for (const v of values) {
    const str = String(Math.abs(v));
    const i = out.indexOf(str, from);
    if (i < 0) continue;
    out = out.slice(0, i) + "#" + out.slice(i + str.length);
    from = i + 1;
  }
  return out;
}

export function diffItems(a: StageItem, b: StageItem): DiffLine[] {
  const pick = (it: StageItem) => {
    const m = new Map<string, { text: string; v: number }>();
    for (const x of allMods(it)) {
      if (x.unrevealed) continue;
      const k = templateOf(x.textEn, x.values);
      const v = x.values[0] ?? 0;
      const cur = m.get(k);
      m.set(k, { text: templateOf(x.textJa, x.values), v: (cur?.v ?? 0) + v });
    }
    return m;
  };
  const A = pick(a);
  const B = pick(b);
  const out: DiffLine[] = [];
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    const x = A.get(k);
    const y = B.get(k);
    if (x && y) out.push({ text: y.text, a: x.v, b: y.v, delta: Math.round((y.v - x.v) * 100) / 100, only: null });
    else if (y) out.push({ text: y.text, a: null, b: y.v, delta: y.v, only: "b" });
    else if (x) out.push({ text: x.text, a: x.v, b: null, delta: -x.v, only: "a" });
  }
  // 両方にあって差の無い物は最後、それ以外は差の大きい順
  return out.sort((p, q) => Number(p.delta === 0 && !p.only) - Number(q.delta === 0 && !q.only) || Math.abs(q.delta) - Math.abs(p.delta));
}
