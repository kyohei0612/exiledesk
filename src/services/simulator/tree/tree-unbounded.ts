/**
 * tree-unbounded.ts — 完成形の品質の判定 (S-31)。
 * 前の「規格外」(ルーンの手でソケットを足す・クラフト MOD が上限ならアストリッドを先に嵌める)・打たずに通す手・どの箱でも完成・打てない時に当たりへ進む は
 * 11-05 オーナー「ツリーに勝手に足しやがって2度とすんなまじで」で外した (木の手はエンジンの applyCurrency を 1 回ずつ打つだけ)
 */
import { catalystOf, inAny, type StageItem } from "../../craft-stage/engine";
import type { TreeDoc } from "./tree-model";
/** 品質がカタリストの品質そのものの部位 (指輪・アミュレット・ジュエル)。木で品質を上げる手 (カタリスト、S-31b) があるのはここだけ */
export const catalystPart = (it: StageItem | null | undefined): boolean => !!it && inAny(it.cls.category, ["ringAmulet", "jewel"]);
/** カタリスト以外の品質の、完成形で選べる上限 (最初に上げてある前提、S-31・オーナー 11-05「50%まで上げれるように」) */
export const PRESET_QUALITY_MAX = 50;
export const qualityOk = (doc: TreeDoc, item: StageItem): boolean => {
  if (!(doc.goalQualityOn && doc.goalQuality)) return true;
  // カタリスト以外の品質は始める前に上げてある物として見ない (11-05 オーナー「最初に品質上げてる前提で通していいよ」、動画 G3pdLFAZxN0 の手袋)
  if (!catalystPart(item)) return true;
  if ((item.quality ?? 0) < doc.goalQuality) return false;
  return !doc.goalQualityTag || catalystOf(item).tag === doc.goalQualityTag;
};
