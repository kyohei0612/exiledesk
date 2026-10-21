/**
 * tree-row-tags.ts — ツリーのアイテムのカード (試し打ち TreeTrial・ホバーのカード TreeHoverCard) の MOD の行の札 (オーナー 10-22):
 * このツリーの狙い (当たりの札) に当たらない MOD に「外れ MOD」(赤、外れの箱と同じ系統)。× の印の行は「× 要らない」が先、フラクチャーは付けない。
 * &ui=next の時は行の名前ごと「外れ MOD」にする (MOD の文は出さない。オーナー 10-22「もはや MOD の名前を外れ MOD でおk」)
 */
import type { PatchData, StageItem } from "../../../services/craft-stage/engine";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { aimHeld, aimsOf } from "../../../services/simulator/tree/tree-sample";
import type { RowTag } from "../../craft-stage/stage-item-row-tag";
import { modText, tr } from "../../../i18n/lang";
import { TREE_NEXT } from "./tree-merge";

export function treeRowTags(d: PatchData, doc: TreeDoc, unwanted: readonly string[], it: StageItem): Map<string, RowTag> {
  const out = new Map<string, RowTag>();
  const aims = aimsOf(doc);
  for (const m of [...it.prefixes, ...it.suffixes]) {
    if (m.fractured) continue;
    const one = { ...it, prefixes: [m], suffixes: [] };
    if (unwanted.some((u) => aimHeld(d, one, { modId: u, tier: 99 }))) out.set(m.modId, { text: tr("× 要らない", "× Unwanted"), tone: "bad" });
    // &ui=next は行の名前ごと「外れ MOD」(MOD の文は乗せた時の説明に残す)
    else if (!aims.some((a) => aimHeld(d, one, a))) out.set(m.modId, TREE_NEXT
      ? { text: tr("外れ MOD", "Miss"), tone: "bad", replace: true, title: tr(`このツリーの狙いに当たらない MOD: ${modText(m)}`, `Not one of this tree's target mods: ${modText(m)}`) }
      : { text: tr("外れ MOD", "Miss"), tone: "bad", title: tr("このツリーの狙い (当たりの札) に当たらない MOD", "Not one of this tree's target mods") });
  }
  return out;
}
