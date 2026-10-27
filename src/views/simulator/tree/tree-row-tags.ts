/**
 * tree-row-tags.ts — ツリーの乗せた時のカード (TreeHoverCard) の MOD の行 (オーナー 10-22):
 * このツリーの狙い (当たりの札) に当たらない MOD は行の名前ごと「外れ MOD」(赤、MOD の文は乗せた時の説明。オーナー「もはや MOD の名前を外れ MOD でおk」)。
 * × の印 (前の試し打ちで付けた物) の行は「× 要らない」が先、フラクチャーは付けない。
 * box = その見本の箱。同じ側の「どれか」の当たりの箱 (anyOf) なら、一覧に当たる MOD の行を「A か B」で出す (10-26 オーナー「アイテム枠の中には狙いモッド2種を１MODの中においてどっちかみたいな話でいいんじゃない前みたく」)
 */
import { type PatchData, type StageItem } from "../../../services/craft-stage/engine";
import { isAimMod } from "../../../services/simulator/tree/tree-aim";
import type { Aim, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";
import { aimOpts, aimsOf, targetsOf } from "../../../services/simulator/tree/tree-sample";
import type { RowTag } from "../../../components/for-share/item/stage-item-row-tag";
import { modText, tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";

export function treeRowTags(d: PatchData, doc: TreeDoc, unwanted: readonly string[], it: StageItem, box?: { anyOf?: Aim[]; out?: string } | null): Map<string, RowTag> {
  // 狙い無しの手の「打った後」の箱は当たり・外れに分けないので「外れ MOD」と書かない (MOD の名前のまま。10-27 夕モンキー 4、スイッチ goalShape)
  const noJunk = flag("goalShape") && box?.out === "any";
  const out = new Map<string, RowTag>();
  const any = box?.anyOf && box.anyOf.length > 1 ? box.anyOf : null;
  const anyT = any ? targetsOf(d, any) : [];
  const anyText = any ? any.map(useTree().aimShort).join(tr(" か ", " or ")) : "";
  // 完成の狙い (完成形の MOD) も狙いに数える (スイッチ goalShape、10-27 夕モンキー 1: エッセンスで付いた完成形の MOD が「外れ MOD」と出た)
  const aims = targetsOf(d, flag("goalShape") ? [...aimsOf(doc), ...(doc.memoAims ?? [])] : aimsOf(doc)), bad = targetsOf(d, unwanted.map((u) => ({ modId: u, tier: 99 }))), o = aimOpts(d);
  for (const m of [...it.prefixes, ...it.suffixes]) {
    if (m.fractured) continue;
    if (any && isAimMod(m, anyT, o)) out.set(m.modId, { text: anyText, tone: "info", replace: true, title: tr(`どれか 1 つが付けば当たり (この見本は ${modText(m)})`, `Any one of these is a hit (this sample has ${modText(m)})`) });
    else if (isAimMod(m, bad, o)) out.set(m.modId, { text: tr("× 要らない", "× Unwanted"), tone: "bad" });
    else if (!noJunk && !isAimMod(m, aims, o)) out.set(m.modId, { text: tr("外れ MOD", "Miss"), tone: "bad", replace: true, title: tr(`このツリーの狙いに当たらない MOD: ${modText(m)}`, `Not one of this tree's target mods: ${modText(m)}`) });
  }
  return out;
}
