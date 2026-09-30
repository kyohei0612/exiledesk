/**
 * legacy-rune.ts — 「○○の遺産」(Legacy of ○○) の値段 (2026-09-30 オーナー「○○の遺産ってアルダーの遺産だよね」「アルダーの遺産でいいよ、これは値付け」)
 *
 * 遺産のルーンは「アルダーの遺産」をコラプトしていないユニーク ○○ のオーグメントソケットに入れて作る (ユニークは壊れる、ゲームの説明文)。
 * 相場 (poe2scout) には 63 種類とも値段が無い (0) ので、値段はアルダーの遺産の値段を使う。
 * 相場に値段が無い = 今のゲームに無い、の決まり ([[client-data-removed-items]]) の例外: アルダーの遺産があれば作れる
 */
export const LEGACY_SOURCE = "Aldur's Legacy";

/** 遺産のルーンか (英語名) */
export const isLegacyRune = (nameEn: string): boolean => /^Legacy of /.test(nameEn);
