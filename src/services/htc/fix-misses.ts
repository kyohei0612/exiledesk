/**
 * fix-misses.ts — データの直しのうち、当てる先が見つからずに飛ばした物の控え (E-06、2026-11-12)。
 *
 * 読み込み (patch.ts の applyExtras) は、土台の MOD の表の上に直しを何段も重ねる (重みの上書き・poe2db に合わせる直し・タグ・値・足すタグ)。
 * 直しは MOD の id・部位の行・段の必要レベルで当てるので、ゲームが変わって id や行が変わると当たらなくなる。当たらない直しは今まで通り飛ばす
 * (読み込みは止めない = 画面の動きは変えない) が、ここに 1 件ずつ残す。見るのは台本 scripts/check-data-fixes.mjs (pnpm check:data-fixes)。
 * 画面はここを読まない。
 */
export interface FixMiss {
  /** どの直しか (weight-overrides / poe2db-weights / rune-weights / poe2db-pools / poe2db-tags / poe2db-values / spell-tags) */
  step: string;
  /** 何が当たらなかったか (id・行・段)。控えの鍵になるので、同じ外れはいつも同じ文字 */
  what: string;
}

let misses: FixMiss[] = [];

/** 読み込みの頭で空にする (applyExtras を 2 回通しても重ならない) */
export function resetFixMisses(): void {
  misses = [];
}
export function noteFixMiss(step: string, what: string): void {
  misses.push({ step, what });
}
/** 直前の読み込みで飛ばした直し */
export function fixMisses(): readonly FixMiss[] {
  return misses;
}
