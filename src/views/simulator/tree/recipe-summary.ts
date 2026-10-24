/**
 * recipe-summary.ts — 保存した木 (レシピ) を一覧で見分ける要約 (2026-10-23 オーナー「レシピの一覧を視覚的に管理しやすく」)。
 * ツリーの帯の「レシピ ▾」の小窓 (TreeRecipeBar) とレシピの一覧のページ (StageRecipesPage) で同じ物を出す:
 * ベースの絵 (エミュのベース選びと同じ baseArt)・ベースの名前・完成の狙いの数と主な狙い 1 つ (印があれば印の物)・フラクチャーの印の数・空の木か
 */
import { baseArt, freshItem, modListFor, tierRankLabel } from "../../../services/craft-stage/engine";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { craftStage as s } from "../../../state/craft-stage";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";

/** ベースごとの MOD の行 (狙いの文を引く。データが替わったら作り直す) */
const rowsByBase = new Map<string, ReturnType<typeof modListFor>>();
let rowsOf: unknown = null;
function rowsFor(base: string, itemLevel: number): ReturnType<typeof modListFor> {
  const data = s.data.value;
  if (!data) return [];
  if (rowsOf !== data) { rowsByBase.clear(); rowsOf = data; }
  let rows = rowsByBase.get(base);
  if (!rows) {
    try { rows = modListFor(data, freshItem(data, base, itemLevel, "rare")); } catch { rows = []; }
    rowsByBase.set(base, rows);
  }
  return rows;
}

export interface RecipeSummary {
  /** ベースの絵 (空の木・絵の無いベースは null) */
  art: string | null;
  base: string;
  /** 完成の狙いの数・フラクチャーの印の数 */
  aims: number;
  marks: number;
  /** 主な狙い 1 つ (印の物が先。「T2 以上 最大マナ (…)」の形、無ければ空) */
  first: string;
  /** 空の木 (ベースを選んでいない・狙いも箱も無い) */
  empty: boolean;
}

export function recipeSummary(tree: TreeDoc): RecipeSummary {
  const aims = tree.memoAims ?? [];
  const empty = !tree.baseChosen && !aims.length && Object.keys(tree.boxes).length <= 1;
  const a = aims.find((x) => x.fractured) ?? aims[0];
  let first = "";
  if (a) {
    const r = rowsFor(tree.base, tree.itemLevel).find((x) => x.id === a.modId || x.tiers.some((t) => t.modId === a.modId));
    // その段の数値の入った文 (use-tree の startModLabel と同じ引き方。行の template は「回避力 #」の形で数値が無い)
    const t = r?.tiers.filter((x) => (x.modId ?? r.id) === a.modId)[a.tier - 1];
    first = `${a.fractured ? "✦ " : ""}${tierRankLabel(a.tier)} ${t?.text ?? r?.text ?? tr("(このベースに無い MOD)", "(mod not on this base)")}`;
  }
  return { art: empty ? null : baseArt(tree.base), base: tr(jaTypeName(tree.base), tree.base), aims: aims.length, marks: aims.filter((x) => x.fractured).length, first, empty };
}
