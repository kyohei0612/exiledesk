/**
 * tree-model-start.ts — 木の始めの形のうち ✦ の印・スタートのレアリティ・新しい木 (tree-model.ts が 500 行を超えたので分けた、11-16 整理 ③)。
 * 始まりの品 startOf と前の版の移し migrateStart は tree-model に残す。呼ぶ所は tree-model から (出し直している)
 */
import { startOf, TREE_SCHEMA_N, type Aim, type TreeDoc, type TreeRarity } from "./tree-model";

/** フラクチャーの印 (完成の狙いのうち ✦ の候補。どれか 1 つが固定されればよい、10-23 オーナー) */
export const fractureMarks = (d: TreeDoc): Aim[] => (d.memoAims ?? []).filter((a) => a.fractured);
/** 印があってもフラクチャー前から (start.from four) は白 (ノーマル) から始める (10-24 夜オーナー「後者選んだ場合必ず白からはじまる」)。true = ✦ の付いたレアから */
/** ✦ が 2 つ以上で、フラクチャーから始められない (白ベースからだけ。10-28 オーナー「単発のみフラクチャースタートできるようにさせるか」) */
export const multiFracWhite = (d: TreeDoc): boolean => fractureMarks(d).length > 1;
export const startsFractured = (d: TreeDoc): boolean => fractureMarks(d).length > 0 && d.start?.from !== "four";
/**
 * 印ありのスタートの外れの数 (10-25 オーナー「フラクチャーから開始ってのはそのフラクチャーしかない状態で始めて欲しい、外れは自分で付ける」で 3 → 0。
 * 前は ✦ 1 + 外れ 3 = フラクチャーのオーブを打てる MOD 4 つのレア、10-23)。＋で足した MOD はそのまま付く
 */
export const START_JUNK = 0;
/**
 * スタートのレアリティ (10-23 オーナー「切り替えのボタンは置かず印で決まる」): 印あり = レア (✦ + 外れ)、
 * 印なし = ＋ で足した MOD が無ければノーマル (白)、あればレア (完成形がマジックならマジック)
 */
export function startRarity(d: TreeDoc): TreeRarity {
  if (startsFractured(d)) return "rare";
  if (fractureMarks(d).length) return "normal";
  if (!startOf(d).mods.length) return "normal";
  return d.goal?.rarity === "magic" ? "magic" : "rare";
}
export function newTree(base: string, itemLevel: number): TreeDoc {
  return {
    schema: `exiledesk-tree/${TREE_SCHEMA_N}`, base, itemLevel, ilvlFit: true, start: { rarity: "rare", mods: [] }, seq: 0,
    boxes: { start: { id: "start", x: 0, y: 0, out: "start", aim: null, hand: null, outs: [], back: null, done: null, parent: null } },
  };
}
