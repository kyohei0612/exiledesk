/**
 * 発現の行き先の一覧 (E-99・S-200、11-06 シミュ部長 sim-light3)。発現は候補から人が選ぶ手 (確率ではなく選択) なので、今の未発現の枠に出うる MOD
 * (revealPool = 打つ処理の drawOffers と同じ置き場) ごとに 1 つ、その MOD で未発現を置き換えた品を返す。乱数で候補を引かない。
 * 段は出うる一番上 (index の一番大きい物 = 上の段)、数値は makeStageMod の決まった種 1 つ。p は選べる物を等しく (割合ではない、木は % を出さない S-76)。
 * 未発現が無ければ品そのまま 1 つ
 */
import { mulberry32, revealPool, makeStageMod, unrevealedOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import type { StepOutcome } from "./outcomes";

const swap = (item: StageItem, from: StageMod, to: StageMod): StageItem =>
  ({ ...item, prefixes: item.prefixes.map((m) => (m === from ? to : m)), suffixes: item.suffixes.map((m) => (m === from ? to : m)) });

export function revealOutcomes(data: PatchData, item: StageItem): StepOutcome[] {
  const hidden = unrevealedOf(item);
  if (!hidden) return [{ p: 1, item, added: [], removed: [] }];
  const pool = revealPool(data, item).flatMap(({ modId, tiers }) => { const mod = data.mods.get(modId); return mod && tiers.length ? [{ mod, tier: tiers[tiers.length - 1]! }] : []; });
  return pool.map(({ mod, tier }) => {
    const m: StageMod = { ...makeStageMod(mod, hidden.side, tier, mulberry32(1)), desecrated: true };
    return { p: 1 / pool.length, item: swap(item, hidden, m), added: [m], removed: [hidden] };
  });
}
