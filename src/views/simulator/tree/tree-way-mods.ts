/**
 * tree-way-mods.ts — 完成形のクラフト MOD (エッセンス・合金などのエッセンスの MOD、ブリーチも) と冒涜の狙いの束 (S-30b)。
 * 完成形の MOD 一覧でクラフト MOD を 2 つ目以降も足せる。足した物は全部完成の狙い (memoAims)。エンジンのクラフト MOD の上限 (craftedLimitOf) を超えた分は
 * 「どれか n つ残る」の束で自動でまとめる。前の行ごとの「途中で消える / 残る」(S-30、TreeDoc.wayMods) は 11-07 に撤回
 * (オーナー「エッセンスは途中で消えるとかべつにいらんかな」。前の保存の印の MOD は開く時に tree-migrate が完成形から外す)
 */
import { craftedKindOf, isDesecratedSource, mulberry32, type PatchData, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { craftedLimitOf } from "../../../services/craft-stage/apply-essence";
import { placeMods } from "../../../services/simulator/sim-engine";
import type { Aim, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import type { RowTag } from "../../../components/for-share/item/stage-item-row-tag";

/** クラフト MOD (エッセンス・合金) か */
export const isCraftAim = (data: PatchData, a: Pick<Aim, "modId">): boolean => !!craftedKindOf(data, a);
/** 残るクラフト MOD の上限 (完成形のアイテムのルーンから、エンジンの craftedLimitOf) */
export const craftLimit = (goal: StageItem): number => craftedLimitOf(goal);
/**
 * 上限を溢れたクラフト MOD の束 (S-30b、10-31 オーナー「固定で上限は今まで通りで、溢れたら、消えるかどっちかみたいな表記にする？」)。
 * 完成の狙いのクラフト MOD (ブリーチも同じ、前の例外は 11-07 に撤回) が上限を超えたら、その全部を「どれか n つ」の束にする。木の判定は替えない (ゲームどおり同時には付かない)
 */
export function craftBundle(data: PatchData, doc: TreeDoc, goal: StageItem | null): { aims: Aim[]; lim: number } | null {
  if (!goal) return null;
  const aims = (doc.memoAims ?? []).filter((a) => isCraftAim(data, a)), lim = craftLimit(goal);
  return aims.length > lim ? { aims, lim } : null;
}
/**
 * 冒涜の束 (S-30b、10-31 オーナー「A」= エッセンスの束と同じ形)。冒涜の MOD はアイテムに 1 つまでなので、
 * 冒涜で付く狙い (冒涜専用 MOD と「冒涜」で付けた狙い) が 2 つ以上なら全部を「どれか 1 つ」の束にする。骨の発現の窓・木の判定は替えない (S-32)
 */
export function desecratedBundle(data: PatchData, doc: TreeDoc): Aim[] | null {
  const aims = (doc.memoAims ?? []).filter((a) => isDesecratedAim(data, a));
  return aims.length > 1 ? aims : null;
}
/** 冒涜で付く狙い (「冒涜」で付けた狙いと冒涜専用 MOD) */
export const isDesecratedAim = (data: PatchData, a: Aim): boolean => a.via === "desecrated" || isDesecratedSource(data.mods.get(a.modId)?.source);
/** 冒涜の束の行の札 */
export const desecratedTag = (): RowTag => ({
  text: tr("どれか 1 つ", "Any 1"),
  tone: "info",
  title: tr("冒涜の MOD はアイテムに 1 つまで。束のどれか 1 つが付く (ツリーの骨の手はベースに付く MOD 全部から選べる)", "Only 1 desecrated mod per item. One of the group is added (Bones in the tree can pick from every mod the base can have)"),
});
/** 束の行の札 */
export const bundleTag = (lim: number): RowTag => ({
  text: tr(`どれか ${lim} つ残る`, `Any ${lim} stay`),
  tone: "info",
  title: tr(`エッセンス・合金の MOD は同時に ${lim} つまで。束のどれかが残り、ほかは途中で付けて消える (ツリーはゲームどおり)`, `Up to ${lim} Essence / Alloy mod(s) at once. One of the group stays, the others are added and removed on the way (the tree follows the game)`),
});
/** 完成形のカードに足す狙いの行 (束・枠の外の狙い。エンジンでその MOD だけ付けた形から取る) */
export function aimRows(data: PatchData, doc: TreeDoc, aims: readonly Aim[]): StageMod[] {
  return aims.flatMap((a) => {
    try { const it = placeMods(data, doc.base, doc.itemLevel, [{ modId: a.modId, tier: a.tier }], mulberry32(1)).item; const m = [...it.prefixes, ...it.suffixes].find((x) => x.modId === a.modId); return m ? [m] : []; } catch { return []; }
  });
}
