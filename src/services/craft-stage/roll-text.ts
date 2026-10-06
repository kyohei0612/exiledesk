/**
 * roll-text.ts — 固有 MOD・ユニークの効果の「(20-30)」を、ゲームのように振った 1 つの値にする (2026-10-06 POE2Tube 要望 ㉝ の 5)。
 *
 * ゲームのアイテムは振った値を出す (冷気耐性 +24%)。ステージは固有 MOD の数値を持たないので、アイテムの rollSeed
 * (手順の seed、手で打つ画面の seed) から決まった値を振る。同じアイテムなら手を進めても同じ値のまま (固有 MOD は普通の手では変わらない)。
 * 小数の桁は範囲の数字の桁に合わせる。rollSeed が無い時はベースの名前から決める (毎回同じ)
 */
import { mulberry32 } from "../htc/rng";
import type { StageItem } from "./types";

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
