/**
 * hand-effect.ts — カタリストを品質が最大になるまで打つ (シミュの要望、sim-own-logic.md の B5)。核の applyCurrency は 1 回 = 1 個 (品質の上がり方は乱数) で、
 * 「最大まで何個」を数える手は核に無いので engine-sim/ に置く (2026-10-23 オーナー: 元からある物の言い換えは外し、新しい物だけ残す)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { applyCurrency } from "../apply-currency";
import { catalystOf, maxQualityOf } from "../stage-core";
import type { StageApply, StageItem } from "../types";
import { tr } from "../../../i18n/lang";

/** カタリストの種類 (タグ)。catalyst_<タグ>・jcatalyst_<タグ> (spec/run-spec と同じ取り方) */
export const catalystTagOf = (key: string): string => key.slice(key.indexOf("_") + 1);
/** そのカタリストの種類で品質が最大か (指輪・アミュレットなどは別の欄のカタリストの品質、catalystOf) */
export function catalystFull(item: StageItem, key: string): boolean {
  const c = catalystOf(item);
  return c.tag === catalystTagOf(key) && c.pct >= maxQualityOf(item);
}
/** カタリストを打つ上限 (見張り。品質の上限より十分大きい) */
const CAT_MAX = 200;
/**
 * カタリストを品質が最大になるまで打つ (1 回 = 1 個、oneCatalyst)。別の種類が入っていれば 0 から (エンジンどおり)。count = 打った個数 (費用はこの分)。
 * 1 個も打てなければ count 0 と、その理由 (もう最大なら「品質はもう最大」)
 */
export function fillCatalyst(data: PatchData, item: StageItem, key: string, rng: () => number): StageApply & { count: number } {
  let it = item, count = 0, last: StageApply = { applied: false, item, added: [], removed: [] };
  for (let i = 0; i < CAT_MAX && !catalystFull(it, key); i++) {
    last = applyCurrency(data, it, key, rng, [], { oneCatalyst: true });
    if (!last.applied) break;
    it = last.item;
    count++;
  }
  return count ? { ...last, applied: true, item: it, count } : { ...last, count: 0, ...(last.applied || last.reason ? {} : { reason: tr("品質はもう最大", "Quality is already at max") }) };
}
