/**
 * recipe-card.ts — レシピの短い URL を作る時に一緒に送る X 用のカード絵の値 (2026-10-28 オーナー「レシピのシェア時のカードもみたいなXに流す用のちっさい画像」
 * 「レシピ用に魔改造して欲しいなそのカード絵」、サーバーは server/web/recipe-card.js・設計図 system.md Y-35、口の形は共有メモ recipe-card-api.md)。
 * 送るかはスイッチ recipeCard (今の本番の Worker は JSON の本文を断って長い URL に戻るので、JSON を読む版が本番に出てから開く)。
 * 割合・費用は、同じ木 (routeKeyOf) を 100 人回した結果がある時だけ。MOD の文は今開いている木のベースの時だけ (文は木のベースの MOD 一覧から引く)
 */
import { ref } from "vue";
import type { TreeDoc } from "../../services/simulator/tree/tree-model";
import type { TreeRunResult } from "../../services/simulator/tree/tree-run";
import { baseArtFile } from "../../components/art/base-art";
import { iconOfKey } from "../../state/for-share/craft-stage-shelf";
import { jaTypeName } from "../../i18n/item-names-ja";
import { isEn } from "../../i18n/lang";
import { routeKeyOf } from "./tree/use-tree-check";
import { useTree } from "./tree/use-tree";

/** POST /r/new の card (どれも無くてよい) */
export interface RecipeCard { l: "ja" | "en"; bn?: string; a?: string; m?: Array<[string, 0 | 1]>; p?: number; n?: number; c?: number; o?: string; s?: number }

/** 最後に 100 人回した結果 (木の鍵つき。use-tree-run が回し終えた時に入れる) */
const lastRun = ref<{ key: string; p: number; n: number; c: number } | null>(null);
export function noteCardRun(doc: TreeDoc, r: TreeRunResult): void {
  if (!r.n) return;
  lastRun.value = { key: routeKeyOf(doc), p: (r.finished / r.n) * 100, n: r.n, c: r.perItem };
}

/** その木のカードの値 */
export function recipeCardOf(tree: TreeDoc): RecipeCard {
  const en = isEn.value, t = useTree();
  const run = lastRun.value && lastRun.value.key === routeKeyOf(tree) ? lastRun.value : null;
  const art = baseArtFile(tree.base), orb = iconOfKey("divine", null);
  const mine = t.doc.value.base === tree.base;
  return {
    l: en ? "en" : "ja",
    bn: (en ? tree.base : jaTypeName(tree.base)).slice(0, 40),
    ...(art ? { a: art } : {}),
    ...(mine && tree.memoAims?.length ? { m: tree.memoAims.slice(0, 8).map((a): [string, 0 | 1] => [t.aimShort(a).slice(0, 80), a.fractured ? 1 : 0]) } : {}),
    ...(run ? { p: Math.round(run.p), n: run.n, ...(Number.isFinite(run.c) ? { c: Math.round(run.c * 10) / 10 } : {}) } : {}),
    ...(orb.startsWith("https://web.poecdn.com/") ? { o: orb } : {}),
    s: Object.values(tree.boxes).filter((b) => b.hand).length,
  };
}
