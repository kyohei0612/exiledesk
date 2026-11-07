/**
 * tree-miss.ts — 外れの式 1 本 (G-1 の S-2、11-07)。外れ = 当たりに数える札 (呼ぶ側が渡す: ☑ の完成形の狙い・☑ の置き石・その箱の当たりの札) の
 * どれにも当たらない MOD。当たりはエンジンの aimHits の sameText (段は札の段以上・同じ系統で文も同じ別の modId も当たり・エッセンスの MOD は別物、未発現は当たらない)。
 * modId の一致では見ない (前は箱の体・止まりの文・手の窓の札などが modId だけで見て、同じ文の別 modId を狙いと外れの両方に数えた)。
 * 外れは枠として 1 種類 (11-07 深夜オーナー「ハズレMODは全部ハズレMODだよ。枠として」): 何の MOD でも・どこから付いても同じ。完成形に無いエッセンスの MOD も
 * 付いた時から外れ (札だけは MOD の文のまま = tree-row-tags の missTag)。✦ (フラクチャー) を外れの数に入れるかは呼ぶ側 (体では ✦ は別の欄)
 */
import { aimHits, tierIndexOf, type AimHitOpts, type AimTarget, type PatchData, type StageMod } from "../../craft-stage/engine";
import type { Aim, TreeDoc } from "./tree-model";
import { placedAims } from "./tree-veil";

/** 外れの式の相手 = 当たりに数える札を段の番号にした物 (1 回作って MOD ごとに使う) */
export interface MissAims { readonly targets: readonly AimTarget[]; readonly opts: AimHitOpts }
/** 当たりに数える札 (段の名前の T) から */
export const missAims = (data: PatchData, aims: readonly Aim[]): MissAims =>
  ({ targets: aims.map((a) => ({ modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) })), opts: { data, sameText: true } });
/**
 * ☑ (aimed、完成形の狙いと置き石の modId) で当たりに数える札。aimed が無い時は完成形の狙い全部 (置き石は入れない)。
 * stones = false で ☑ の置き石も入れない (前の世代の形の鍵の体。置き石を数えていなかった)
 */
export function aimedMiss(data: PatchData, doc: TreeDoc, aimed?: ReadonlySet<string> | null, o: { stones?: boolean } = {}): MissAims {
  const goals = doc.memoAims ?? [];
  if (!aimed) return missAims(data, goals);
  return missAims(data, [...goals, ...(o.stones === false ? [] : placedAims(doc))].filter((a) => aimed.has(a.modId)));
}
/** 外れ = 当たりに数える札のどれにも当たらない MOD */
export const isMissMod = (m: StageMod, x: MissAims): boolean => !x.targets.some((t) => aimHits(m, t, x.opts));
