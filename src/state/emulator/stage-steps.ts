/**
 * stage-steps.ts — エミュレーターの小さな決まり (新品のソケット・打った手を手順 JSON の 1 手に)。state/craft-stage.ts から分けた (2026-10-16、500 行の決まり)
 */
import type { StageItem } from "../../services/craft-stage/types";
import type { CraftStagePlan } from "../../services/craft-stage/contract";
import type { PlayedStep } from "../../services/craft-stage/run-plan";
import { baseSocketsOf } from "../../services/craft-stage/stage-runes";

/** 手順 JSON の 1 手 (plan の steps の 1 つ) */
export type PlanStep = CraftStagePlan["steps"][number];
/**
 * 手で打つ画面の新品は、規格外のソケット数 (熟練工で付けられる数 +1) で始める (2026-10-04 オーナー「オーブ刺すのめんどいから、ソケットも初めからデフォでマックス」)。
 * 手順 JSON の再生 (動画) は手順どおりなので開けない
 */
export const fullSockets = (it: StageItem): StageItem => {
  // 規格外 (ドロップで熟練工の上限 +1。胴・両手 3 / ほか 2) で始める (2026-10-05 オーナー「デフォでもう規格外でソケットしていい、ドロップで落ちるソケットをデフォで 2 個以上」)
  const want = baseSocketsOf(it.base, it.cls.category);
  return want > (it.sockets ?? 0) ? { ...it, sockets: want } : it;
};
/** 打った手 1 つを手順 JSON の 1 手に。カタリストは手で打つと 1 個 +1〜2%、再生は 1 手 = 1 個 (+1%)。上げた分の回数で書く (2026-10-10 点検: 再生で品質が違った) */
export function planStepOf(s: PlayedStep): PlanStep {
  const times = s.out.currency.startsWith("catalyst_") || s.out.currency.startsWith("jcatalyst_") ? Math.max(1, (s.after.quality ?? 0) - (s.before.qualityTag === s.after.qualityTag ? s.before.quality ?? 0 : 0)) : 1;
  return { currency: s.out.currency, omen: s.out.omen ?? null, times, note: null, ...(s.out.seed != null ? { seed: s.out.seed } : {}) } as PlanStep;
}
