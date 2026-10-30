/**
 * tree-way-mods.ts — 完成形の「途中で消える」クラフト MOD (エッセンス・合金などのエッセンスの MOD、ブリーチも。10-27 夜オーナー、スイッチ goalQuality)。
 * 完成形の MOD 一覧でクラフト MOD を 2 つ目以降も足せる。足した物は完成の狙い (memoAims) に入り、カードの下の切り替えで「途中で消える」にすると
 * TreeDoc.wayMods へ移る (完成の狙い・MOD の枠・完成の判定には数えない。品質で自動で出るブリーチの行と同じ扱い)。戻すと完成の狙いへ戻る。
 * 残る (完成の狙いにある) クラフト MOD はエンジンのクラフト MOD の上限 (craftedLimitOf: 1 つ、アストリッドの創造性で増える) まで。
 * 超えている間は「決めた (ツリーへ)」を押せない (2 つで片方を消えるにすれば、もう片方は残る方に決まる)
 */
import { craftedKindOf, mulberry32, type PatchData, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import { craftedLimitOf } from "../../../services/craft-stage/apply-essence";
import { placeMods } from "../../../services/simulator/sim-engine";
import type { Aim, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";
import type { RowTag } from "../../../components/for-share/item/stage-item-row-tag";

/** 途中で消える物の打つ順 (札の横の ? と、カードの札に乗せた時の説明。10-27 夜オーナー) */
export const WAY_ORDER = (): string => tr("ほかのエッセンスより先に打って品質などを上げ、消してから次のエッセンス (クラフト MOD が付いている間はほかのエッセンスは打てない)", "Use it before the other essences to raise quality etc., remove it, then use the next essence (other essences can't be used while a crafted mod is on the item)");
/** クラフト MOD (エッセンス・合金) か */
export const isCraftAim = (data: PatchData, a: Pick<Aim, "modId">): boolean => !!craftedKindOf(data, a);
/** 途中で消える物にあるか (段は見ない。同じ MOD は 1 つ) */
export const inWay = (doc: TreeDoc, modId: string): boolean => (doc.wayMods ?? []).some((a) => a.modId === modId);
/** 「途中で消える」の切り替え: 完成の狙いから途中で消える物へ / 戻す (フラクチャーの印は外す = 途中で消える物は ✦ にできない) */
export function toggleWay(d: TreeDoc, modId: string): void {
  const way = d.wayMods ?? [], memo = d.memoAims ?? [];
  const w = way.find((a) => a.modId === modId);
  if (w) {
    d.wayMods = way.filter((a) => a.modId !== modId);
    d.memoAims = [...memo, { modId: w.modId, tier: w.tier }];
  } else {
    const m = memo.find((a) => a.modId === modId);
    if (!m) return;
    d.memoAims = memo.filter((a) => a.modId !== modId);
    d.wayMods = [...way, { modId: m.modId, tier: m.tier }];
  }
  if (!d.wayMods.length) delete d.wayMods;
  if (!d.memoAims.length) delete d.memoAims;
}
/** MOD 一覧で途中で消える物を押した = 外す */
export function dropWay(d: TreeDoc, modId: string): void { d.wayMods = (d.wayMods ?? []).filter((a) => a.modId !== modId); if (!d.wayMods.length) delete d.wayMods; }
/** 残るクラフト MOD の上限 (完成形のアイテムのルーンから、エンジンの craftedLimitOf) */
export const craftLimit = (goal: StageItem): number => craftedLimitOf(goal);
/** 決めていない = 完成の狙いに残るクラフト MOD が上限を超えている時の理由 (無ければ null) */
export function wayUndecided(data: PatchData, doc: TreeDoc, goal: StageItem | null): string | null {
  // 上限を溢れた物は束 (どれか n つ) で見せるので決めさせない (S-30b、スイッチ attachWay)
  if (!goal || flag("attachWay")) return null;
  const n = (doc.memoAims ?? []).filter((a) => isCraftAim(data, a)).length, lim = craftLimit(goal);
  return n > lim ? tr(`クラフト MOD を「途中で消える」か残すかに決める (残るのは ${lim} つまで、今 ${n} つ)`, `Decide which crafted mods are "removed on the way" (up to ${lim} can stay, now ${n})`) : null;
}
/** 品質のためのブリーチのエッセンス (途中で消す前提。束に入れず独立、S-30b) */
export const isBreachAim = (a: Aim): boolean => !!a.forQuality || /LocalMaximumQuality/.test(a.modId);
/**
 * 上限を溢れたクラフト MOD の束 (S-30b、スイッチ attachWay、10-31 オーナー「固定で上限は今まで通りで、溢れたら、消えるかどっちかみたいな表記にする？」)。
 * 完成の狙いのクラフト MOD (ブリーチは除く) が上限を超えたら、その全部を「どれか n つ」の束にする。木の判定は替えない (ゲームどおり同時には付かない)
 */
export function craftBundle(data: PatchData, doc: TreeDoc, goal: StageItem | null): { aims: Aim[]; lim: number } | null {
  if (!goal) return null;
  const aims = (doc.memoAims ?? []).filter((a) => isCraftAim(data, a) && !isBreachAim(a)), lim = craftLimit(goal);
  return aims.length > lim ? { aims, lim } : null;
}
/** 束の行の札 */
export const bundleTag = (lim: number): RowTag => ({
  text: tr(`どれか ${lim} つ残る`, `Any ${lim} stay`),
  tone: "info",
  title: tr(`エッセンス・合金の MOD は同時に ${lim} つまで。束のどれかが残り、ほかは途中で付けて消える (ツリーはゲームどおり)`, `Up to ${lim} Essence / Alloy mod(s) at once. One of the group stays, the others are added and removed on the way (the tree follows the game)`),
});
/** 途中で消える物の MOD の行 (カードに足す。エンジンでその MOD だけ付けた形から取る) */
export function wayRows(data: PatchData, doc: TreeDoc, aims: readonly Aim[] = doc.wayMods ?? []): StageMod[] {
  return aims.flatMap((a) => {
    try { const it = placeMods(data, doc.base, doc.itemLevel, [{ modId: a.modId, tier: a.tier }], mulberry32(1)).item; const m = [...it.prefixes, ...it.suffixes].find((x) => x.modId === a.modId); return m ? [m] : []; } catch { return []; }
  });
}
