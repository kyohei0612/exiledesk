/**
 * item-text-implicit.ts — 貼った文のベースの暗黙の値を、エンジンの暗黙の行の番号ごとの値 (StageItem.implicitFixed) にする (S-08k、11-16)。
 * シミュの貼り付けで完成形の暗黙を貼った値のまま出すため (前は種から振り直して「11%」が「9%」になった。猿 21)。
 * 行は htcBaseInfo の implicits と、数を抜いた文で照らす。値の数がその行の幅 (lo-hi) の数と同じで、幅の外の数が無い行だけ。合わない行は振りのまま
 */
import { htcBaseInfo } from "../../htc/patch";
import type { ItemTextResult } from "./item-text-types";

const RANGE = /\((-?\d+(?:\.\d+)?)\s*[-—–]\s*(-?\d+(?:\.\d+)?)\)/g;
const bare = (t: string): string => t.replace(/\s*\((rune|enchant|implicit)\)\s*$/i, "").replace(/[0-9.()+\-%\s]+/g, "");

export function pastedImplicitFixed(r: Pick<ItemTextResult, "base" | "implicits">): Record<number, number[]> | null {
  const lines = r.base ? htcBaseInfo()[r.base.en]?.implicits ?? [] : [];
  const own = r.implicits.filter((im) => im.from === "base" && im.values.length);
  const out: Record<number, number[]> = {};
  const used = new Set<number>();
  lines.forEach((l, li) => {
    const k = own.findIndex((im, i) => !used.has(i) && (bare(im.text) === bare(l.en) || bare(im.text) === bare(l.ja)));
    if (k < 0) return;
    const ranges = [...l.en.matchAll(RANGE)];
    const others = l.en.replace(RANGE, "").match(/\d+(?:\.\d+)?/g)?.length ?? 0;
    if (!ranges.length || others || own[k]!.values.length !== ranges.length) return;
    used.add(k);
    // 貼り付けの読みは「減少」を負で返す。幅が正の行は正の向きに揃える (use-tree の明示の MOD の差し替えと同じ考え)
    out[li] = own[k]!.values.map((v, i) => (Number(ranges[i]![1]) >= 0 ? Math.abs(v) : v));
  });
  return Object.keys(out).length ? out : null;
}
