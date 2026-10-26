/**
 * sim-links.ts — クラフト台 (エミュの画面) からシミュ (クラフトの道 = ツリー) へ行く入口 (共通の差し込み口、2026-10-23 オーナー「コードが混ざらないように」)。
 * エミュの画面はここだけを読み、シミュの中 (views/simulator) は読まない。シミュの物はここで後から読む (最初の読み込みに入れない)
 */
import { openTreePage } from "../../web/page";
import { flag } from "../../web/release-flags";
import type { StageItem } from "../../services/craft-stage/types";

/** 今のベースとアイテムレベルで白紙のツリーを開く (前の木は 1 つ戻すで戻せる) */
export async function openTreeWith(base: string, itemLevel: number): Promise<void> {
  if (!flag("sim")) return; // 本番はシミュレーターを出さない (スイッチ sim)
  const { useTree } = await import("../../views/simulator/tree/use-tree");
  useTree().startTreeWith(base, itemLevel);
  openTreePage();
}

/** エミュで持っているアイテム (ベース・アイテムレベル・MOD 全部) をシミュへ渡し、② 完成の MOD のページを開く (スイッチ emuToSim、2026-10-26 夜オーナー) */
export async function openSimWithItem(item: StageItem): Promise<void> {
  if (!flag("sim")) return;
  const { requestEmuItem } = await import("../../views/simulator/tree/tree-paste");
  requestEmuItem(item);
}

/** 共有のレシピの URL (#recipe=、views/simulator/recipe-share.ts) から来た時に、そのレシピを開く */
export function openSharedRecipe(): void {
  if (!flag("sim")) return;
  void import("../../views/simulator/recipe-share").then((m) => m.openSharedRecipe());
}
