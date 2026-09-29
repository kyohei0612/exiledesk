/**
 * compare.ts — アイテム 2 つの違い (POE2Tube 要望 ⑪-3「装備を入れ替えるかの見方」、2026-09-29)
 *
 * MOD の文面の数値を # にした形 (同じ効果) で揃え、数値ごとの差を出す。片方にしか無い物は「A だけ」「B だけ」。
 * 数値は MOD の values (転がった値)。エンチャント・固有の効果は比べない (MOD だけ)。
 * 要望 ⑭「数値 (+2から3 等) は必ず見えるように」: 数値が 2 つある MOD (「#から#の物理ダメージ」) は両方の差を持つ。
 */
import type { StageItem } from "./types";
import { allMods } from "./stage-core";

export interface DiffLine {
  /** 日本語の文面 (数値は #) */
  text: string;
  /** 数値ごとの差 (B − A。片方だけの時はその値、A だけなら負) */
  deltas: number[];
  /** 並べる・色を決める差 (1 つ目) */
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

const round = (v: number): number => Math.round(v * 100) / 100;

export function diffItems(a: StageItem, b: StageItem): DiffLine[] {
  const pick = (it: StageItem) => {
    const m = new Map<string, { text: string; v: number[] }>();
    for (const x of allMods(it)) {
      if (x.unrevealed) continue;
      const k = templateOf(x.textEn, x.values);
      const cur = m.get(k);
      const v = x.values.map((n, i) => (cur?.v[i] ?? 0) + n);
      m.set(k, { text: templateOf(x.textJa, x.values), v });
    }
    return m;
  };
  const A = pick(a);
  const B = pick(b);
  const out: DiffLine[] = [];
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    const x = A.get(k);
    const y = B.get(k);
    let deltas: number[];
    let only: DiffLine["only"] = null;
    if (x && y) deltas = y.v.map((n, i) => round(n - (x.v[i] ?? 0)));
    else if (y) (deltas = y.v.map(round)), (only = "b");
    else deltas = x!.v.map((n) => round(-n)), (only = "a");
    out.push({ text: (y ?? x)!.text, deltas, delta: deltas[0] ?? 0, only });
  }
  // 両方にあって差の無い物は最後、それ以外は差の大きい順
  return out.sort((p, q) => Number(p.delta === 0 && !p.only) - Number(q.delta === 0 && !q.only) || Math.abs(q.delta) - Math.abs(p.delta));
}
