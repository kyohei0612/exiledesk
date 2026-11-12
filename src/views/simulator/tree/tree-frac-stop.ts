/**
 * tree-frac-stop.ts — 確定フラクチャー (デイリーの「ベースから」の木) が置けない時のポップアップ (S-43a、スイッチ treeSureFracNeedMod)。
 * 手の窓でフラクチャーを置こうとした時 (カードを押す・「使う」) に、選んだ MOD がこの品で固定されえないなら置かずに小さい窓で断る。
 * 訳は 2 通り (tree-sure-frac の sureFracWhy): 冒涜で付いた MOD として品にある / 品に無い。窓は TreeFracStop.vue (TreeOverlays に 1 つ)
 */
import { ref } from "vue";
import type { PatchData, StageItem } from "../../../services/craft-stage/engine";
import type { Hand, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { sureFracWhy } from "../../../services/simulator/tree/tree-sure-frac";

/** 出している訳 (null = 出していない) */
export const fracStop = ref<"desecrated" | "none" | null>(null);

/** 置こうとした時に通す口: 置けないなら窓を出して true (呼ぶ側は置かない)、置けるなら false */
export function stopSureFrac(data: PatchData, doc: TreeDoc, item: StageItem, h: Hand | null | undefined): boolean {
  const why = sureFracWhy(data, doc, item, h);
  if (why) fracStop.value = why;
  return !!why;
}
