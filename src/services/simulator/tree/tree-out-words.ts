/**
 * tree-out-words.ts — 木の箱の結果の種類の名前 (日本語・英語) の表 1 つ (整理 ③-6、11-16。前は木の画面・100 人回しの止まり・最終チェック・畳みの札に 5 つあり、英語が場所ごとに違った)。
 * 英語は木の画面の箱の題 (tree-names の OUT_LOOK) に揃えた (11-16 オーナー「おけ」、ブラック 124 経由)。スマホの全体図の略した名前 (「外れ消」など) はわざと短いので別
 */
import type { TreeBox } from "./tree-model";

export const OUT_WORDS: Record<TreeBox["out"], readonly [ja: string, en: string]> = {
  start: ["スタート", "Start"],
  hit: ["当たり", "Hit"],
  junk: ["外れ", "Miss"],
  junkGone: ["外れが消えた", "Miss removed"],
  lost: ["狙いが消えた", "Target lost"],
  any: ["打った後", "After"],
  pass: ["品質を上げた後", "Quality raised"],
  branch: ["分かれ目の先", "Branch"],
  blocked: ["エッセンスと同じ MOD", "Same mod as the essence"],
};
