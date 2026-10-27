/**
 * tree-row-tags.ts — ツリーの乗せた時のカード (TreeHoverCard) の MOD の行 (オーナー 10-22):
 * このツリーの狙い (当たりの札) に当たらない MOD は行の名前ごと「外れ MOD」(赤、MOD の文は乗せた時の説明。オーナー「もはや MOD の名前を外れ MOD でおk」)。
 * × の印 (前の試し打ちで付けた物) の行は「× 要らない」が先、フラクチャーは付けない。
 * box = その見本の箱。同じ側の「どれか」の当たりの箱 (anyOf) なら、一覧に当たる MOD の行を「A か B」で出す (10-26 オーナー「アイテム枠の中には狙いモッド2種を１MODの中においてどっちかみたいな話でいいんじゃない前みたく」)
 */
import { type PatchData, type StageItem } from "../../../services/craft-stage/engine";
import { isAimMod } from "../../../services/simulator/tree/tree-aim";
import type { Aim, Hand, OutKind, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { heldSets } from "../../../services/simulator/tree/tree-shape";
/** 外れの側の箱 (道で付いた狙いだけを狙いに数える) */
const MISS_OUTS: readonly OutKind[] = ["junk", "lost", "junkGone", "any"];
import { effectOf } from "../../../services/simulator/tree/tree-hands";
import { useTree } from "./use-tree";
import { aimOpts, aimsOf, targetsOf } from "../../../services/simulator/tree/tree-sample";
import type { RowTag } from "../../../components/for-share/item/stage-item-row-tag";
import { modText, tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf";

/** 箱 boxId の見本 it の札 (手の窓のカード・消去の残したい MOD の欄で同じ物) */
export const boxTagsOf = (d: PatchData, doc: TreeDoc, boxId: string, it: StageItem): Map<string, RowTag> => { const b = doc.boxes[boxId]; return treeRowTags(d, doc, b?.unwanted ?? [], it, { anyOf: b?.anyOf, id: boxId, out: b?.out }); };
/** 全部消えてよい消去の手の箱 (消去の直線の箱。☑ が無い = 消えうる MOD は全部外れ MOD) */
const stripHand = (h: Hand | null | undefined): boolean => !!h && effectOf(h.currency) === "remove" && !!h.keep && !h.keep.length;
export function treeRowTags(d: PatchData, doc: TreeDoc, unwanted: readonly string[], it: StageItem, box?: { id?: string; out?: OutKind | "start"; anyOf?: Aim[]; hand?: Hand | null } | null): Map<string, RowTag> {
  const out = new Map<string, RowTag>();
  // 消去の直線の箱 (全部消えてよい消去の手の箱) は、フラクチャー以外の MOD を全部「外れ MOD」で出す (手の窓で消去を持った時と同じ考え。10-27 夜オーナー、スイッチ heldTags)
  // 直線の途中の箱だけ (消去を打ち始める元の箱は普段の札。子に消去の手を足すと親の ES・未発現まで「外れ MOD」に変わった、10-28 モンキー 1。未発現の枠も替えない。スイッチ boneLater)
  const chainBox = !flag("boneLater") || (!!box?.id && stripHand(doc.boxes[doc.boxes[box.id]?.parent ?? ""]?.hand));
  // スイッチ boxShape: 箱の表示はその箱の見本と、その箱を作った手 (親の手) だけから (この箱に置いた手 = 子を作る手では変えない。10-28 オーナー OK の対策 2)。
  // 全部消えてよい消去で作られた箱 (直線の途中と終わり) が「外れ MOD」
  const strip = flag("boxShape") ? chainBox && !!box?.id && flag("boneLater") : stripHand(box?.hand) && chainBox;
  if (flag("heldTags") && strip) {
    for (const m of [...it.prefixes, ...it.suffixes]) if (!m.fractured && !(m.unrevealed && flag("boneLater"))) out.set(m.modId, { text: tr("外れ MOD", "Miss"), tone: "bad", replace: true, title: tr(`全部消えてよい${nameOfKey("annul", null)}で消えうる MOD: ${modText(m)}`, `May be removed by the clear-all ${nameOfKey("annul", null)}: ${modText(m)}`) });
    return out;
  }
  const any = box?.anyOf && box.anyOf.length > 1 ? box.anyOf : null;
  const anyT = any ? targetsOf(d, any) : [];
  const anyText = any ? any.map(useTree().aimShort).join(tr(" か ", " or ")) : "";
  // 完成の狙い (完成形の MOD) も狙いに数える (スイッチ goalShape、10-27 夕モンキー 1: エッセンスで付いた完成形の MOD が「外れ MOD」と出た)
  // 外れの箱 (外れ・狙いが消えた・外れが消えた・打った後) は、その箱まで来た道で付いている狙いだけを狙いに数える。☑ の無い MOD はそのカレンシーでは外れ扱いなので、
  // ☑ していない完成形の MOD が付いていても「外れ MOD」(10-27 夜オーナー、モンキー 2 回目 7。スイッチ junkByCheck)
  const missBox = flag("junkByCheck") && !!box?.id && !!box.out && box.out !== "start" && MISS_OUTS.includes(box.out);
  const held = missBox ? [...new Map(heldSets(doc, box!.id!).flat().map((k) => { const [modId, tier] = k.split("|"); return [modId!, { modId: modId!, tier: Number(tier) }] as const; })).values()] : [];
  // 始まりから付いている完成の狙いも狙い (道の当たりの札には無い。外れが固定された箱で始まりの ES が「外れ MOD」と出た、10-28。スイッチ boxShape)
  if (missBox && flag("boxShape")) for (const m of doc.start?.mods ?? []) if ((doc.memoAims ?? []).some((g) => g.modId === m.modId) && !held.some((h) => h.modId === m.modId)) held.push({ modId: m.modId, tier: 99 });
  // 当たりの箱の札の MOD は、その箱では狙い (発現で選んだ置き石も。以降の箱では外れ MOD。スイッチ boneLater)
  const ownAim = flag("boneLater") && box?.id && box.out === "hit" ? doc.boxes[box.id]?.aim : null;
  const aims = targetsOf(d, [...(missBox ? held : flag("goalShape") ? [...aimsOf(doc), ...(doc.memoAims ?? [])] : aimsOf(doc)), ...(ownAim ? [ownAim] : [])]), bad = targetsOf(d, unwanted.map((u) => ({ modId: u, tier: 99 }))), o = aimOpts(d);
  for (const m of [...it.prefixes, ...it.suffixes]) {
    // 未発現の枠は元の文 (未発現の冒涜 MOD) のまま (スイッチ boneLater)
    if (m.fractured || (m.unrevealed && flag("boneLater"))) continue;
    if (any && isAimMod(m, anyT, o)) out.set(m.modId, { text: anyText, tone: "info", replace: true, title: tr(`どれか 1 つが付けば当たり (この見本は ${modText(m)})`, `Any one of these is a hit (this sample has ${modText(m)})`) });
    else if (isAimMod(m, bad, o)) out.set(m.modId, { text: tr("× 要らない", "× Unwanted"), tone: "bad" });
    else if (!isAimMod(m, aims, o)) out.set(m.modId, { text: tr("外れ MOD", "Miss"), tone: "bad", replace: true, title: tr(`このツリーの狙いに当たらない MOD: ${modText(m)}`, `Not one of this tree's target mods: ${modText(m)}`) });
  }
  return out;
}
