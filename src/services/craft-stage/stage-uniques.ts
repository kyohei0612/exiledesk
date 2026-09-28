/**
 * ユニークの効果 (2026-09-28、POE2Tube 要望 ⑨)。行は scripts/build-craft-stage-uniques.mjs が poe2db のユニークのページ (日本語) から作る。
 * 値の幅 "(10—20)" はゲームのアイテムと同じく 1 つの値にする。同じユニークは何度なっても同じ値 (名前から決める。手ごとに変わらない)
 */
import raw from "./stage-uniques.json";

const LINES = raw as Record<string, string[]>;

/** 文字列から 0〜1 の決まった値 (FNV-1a) */
function unit(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 0x100000000;
}

/** ユニークの効果の行 (値は決まった 1 つ)。ページの無いユニークは空 */
export function uniqueLines(en: string): string[] {
  return (LINES[en] ?? []).map((line, i) => {
    let n = 0;
    return line.replace(/\((-?\d+(?:\.\d+)?)—(-?\d+(?:\.\d+)?)\)/g, (_, a: string, b: string) => {
      const lo = Number(a);
      const hi = Number(b);
      const dp = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
      const v = lo + (hi - lo) * unit(`${en}#${i}#${n++}`);
      return dp ? v.toFixed(dp) : String(Math.round(v));
    });
  });
}
