/**
 * tree-row-tags.ts — ツリーの乗せた時のカード (TreeHoverCard) の MOD の行 (オーナー 10-22):
 * このツリーの狙い (当たりの札) に当たらない MOD は行の名前ごと「外れ MOD」(赤、MOD の文は乗せた時の説明。オーナー「もはや MOD の名前を外れ MOD でおk」)。
 * × の印 (前の試し打ちで付けた物) の行は「× 要らない」が先、フラクチャーは付けない
 */
import { type PatchData, type StageItem } from "../../../services/craft-stage/engine";
import { isAimMod } from "../../../services/simulator/tree/tree-play";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { aimOpts, aimsOf, targetsOf } from "../../../services/simulator/tree/tree-sample";
import type { RowTag } from "../../../components/stage/item/stage-item-row-tag";
import { modText, tr } from "../../../i18n/lang";

export function treeRowTags(d: PatchData, doc: TreeDoc, unwanted: readonly string[], it: StageItem): Map<string, RowTag> {
  const out = new Map<string, RowTag>();
  const aims = targetsOf(d, aimsOf(doc)), bad = targetsOf(d, unwanted.map((u) => ({ modId: u, tier: 99 }))), o = aimOpts(d);
  for (const m of [...it.prefixes, ...it.suffixes]) {
    if (m.fractured) continue;
    if (isAimMod(m, bad, o)) out.set(m.modId, { text: tr("× 要らない", "× Unwanted"), tone: "bad" });
    else if (!isAimMod(m, aims, o)) out.set(m.modId, { text: tr("外れ MOD", "Miss"), tone: "bad", replace: true, title: tr(`このツリーの狙いに当たらない MOD: ${modText(m)}`, `Not one of this tree's target mods: ${modText(m)}`) });
  }
  return out;
}
