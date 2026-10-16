/**
 * roll-text.ts — 固有 MOD・ユニークの効果の「(20-30)」を、ゲームのように振った 1 つの値にする (2026-10-06 POE2Tube 要望 ㉝ の 5)。
 *
 * ゲームのアイテムは振った値を出す (冷気耐性 +24%)。ステージは固有 MOD の数値を持たないので、アイテムの rollSeed
 * (手順の seed、手で打つ画面の seed) から決まった値を振る。同じアイテムなら手を進めても同じ値のまま (固有 MOD は普通の手では変わらない)。
 * 小数の桁は範囲の数字の桁に合わせる。rollSeed が無い時はベースの名前から決める (毎回同じ)
 */
import { mulberry32 } from "../htc/rng";
import type { StageItem } from "./types";
import { displayedValue } from "../htc/quality";

const RANGE = /\((-?\d+(?:\.\d+)?)\s*[-—–]\s*(-?\d+(?:\.\d+)?)\)/g;
const decimals = (s: string): number => (s.includes(".") ? s.split(".")[1]!.length : 0);
function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 行ごとの範囲を振った値に (salt で行ごと・アイテムごとに違う値) */
export function rollLines(item: StageItem, lines: readonly string[], salt: string, scale?: readonly number[]): string[] {
  const rng = mulberry32(((item.rollSeed ?? 0) ^ hashOf(`${item.base}|${salt}`)) >>> 0);
  return lines.map((line, li) =>
    line.replace(RANGE, (_all, a: string, b: string) => {
      const lo = Number(a), hi = Number(b), d = Math.max(decimals(a), decimals(b));
      const p = 10 ** d;
      const steps = Math.round(Math.abs(hi - lo) * p);
      const v = Math.min(lo, hi) + Math.floor(rng() * (steps + 1)) / p;
      // ヴァールの倍率 (ユニーク、要望 ㉞-5) は振った値に掛けて同じ桁で丸める
      const k = scale?.[li] ?? 1;
      return (Math.round(v * k * p) / p).toFixed(d);
    }),
  );
}

/**
 * 暗黙の MOD の行 (2026-10-12 オーナー「暗黙のタグは？」「カタリストで上がるよ、普通は」)。rollLines と同じ乱数で振り、
 * pct[行] (カタリストの品質 %) があれば素の値 × (1 + 品質) を四捨五入 (MOD と同じ displayedValue)。values は行の中の振った値 (伸びた後)
 */
export interface ImplicitLine {
  text: string;
  /** 行の中の値 (カタリストで伸びた後) */
  values: number[];
  /** 伸びる前の値 (上下のボタンの基準) */
  raw: number[];
  /** 範囲 [下, 上, 小数の桁] */
  ranges: Array<[number, number, number]>;
  boosted: boolean;
}
export function rollImplicitLines(item: StageItem, lines: readonly string[], pct: readonly number[] = []): ImplicitLine[] {
  // 神のオーブ・祝福のお告げで振り直した回数を種に混ぜる (0 回は前と同じ値)
  const n = item.implicitRoll ?? 0;
  const rng = mulberry32(((item.rollSeed ?? 0) ^ hashOf(`${item.base}|implicit${n ? `#${n}` : ""}`)) >>> 0);
  return lines.map((line, li) => {
    const values: number[] = [];
    const raw: number[] = [];
    const ranges: Array<[number, number, number]> = [];
    let boosted = false;
    // 手で決めた値 (暗黙の行の上下のボタン、iset の手)。乱数は同じだけ進める (ほかの行の値が変わらないように)
    const fixed = item.implicitFixed?.[li];
    const text = line.replace(RANGE, (_all, a: string, b: string) => {
      const lo = Number(a), hi = Number(b), d = Math.max(decimals(a), decimals(b));
      const p = 10 ** d;
      const steps = Math.round(Math.abs(hi - lo) * p);
      const rolled = Math.min(lo, hi) + Math.floor(rng() * (steps + 1)) / p;
      const k = ranges.length;
      ranges.push([Math.min(lo, hi), Math.max(lo, hi), d]);
      const v = fixed?.[k] != null ? Math.min(Math.max(lo, hi), Math.max(Math.min(lo, hi), fixed[k]!)) : rolled;
      raw.push(v);
      const q = pct[li] ?? 0;
      const shown = q > 0 ? (d === 0 ? displayedValue(v, q) : Math.round(v * (1 + q / 100) * p) / p) : v;
      if (shown !== v) boosted = true;
      values.push(shown);
      return shown.toFixed(d);
    });
    return { text, values, raw, ranges, boosted };
  });
}

/** 暗黙の MOD に振れる幅があるか (神のオーブ・祝福のお告げで振り直せるか) */
export const hasImplicitRange = (lines: readonly string[]): boolean => lines.some((l) => new RegExp(RANGE.source).test(l));
