/**
 * tree-attach.ts — 完成形の設定の「付ける」の付け方 3 択 (S-10b、スイッチ attachWay、10-31 オーナー決め 15)。
 * ふつう・フラクチャー・冒涜から選ぶ。フラクチャーは ✦ の印 (S-10)、冒涜は付け方の覚え (Aim.via) だけで木の判定には使わない。
 * エッセンスは付け方に出さない (エッセンスで付く MOD は「ふつう」で付ける。オーナー「エッセンスは関係ないね…付け方に表示はしなくていい」)。
 * 出ない付け方の訳は MOD の出どころ (一覧の行の群れ) から: 冒涜専用は骨だけ、クラフト MOD は骨・フラクチャーの外 (E-41・E-62・E-95)
 */
import { tr } from "../../../i18n/lang";
import { migrateStart, startRarity, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";

export type AttachWay = "normal" | "fracture" | "desecrated";
export const ATTACH_WAYS: readonly AttachWay[] = ["normal", "fracture", "desecrated"];

/** 付け方の名前 */
export const wayName = (w: AttachWay): string =>
  w === "normal" ? tr("ふつう", "Normal") : w === "fracture" ? tr("フラクチャー", "Fracture") : tr("冒涜", "Desecrate");

/** その狙いの付け方 (狙いでなければ null) */
export const wayOfAim = (a: Aim | undefined): AttachWay | null => (!a ? null : a.fractured ? "fracture" : a.via === "desecrated" ? "desecrated" : "normal");

const isDesecratedGroup = (g: string | undefined): boolean => g === "desecrated" || g === "otherworldly";
const isEssenceGroup = (g: string | undefined): boolean => g === "essence" || g === "perfect_essence";

/** その行の MOD がその付け方で出ない訳 (出るなら null)。group は MOD 一覧の行の群れ */
export function wayBlock(group: string | undefined, w: AttachWay): string | null {
  // 創生の樹など (ベースの special の置き場) はカレンシーでは付かない。フラクチャーの印だけは前の「フラクチャー」ボタンと同じく付けられる
  if (group === "special" && w !== "fracture") return tr("カレンシーでは付かない MOD (創生の樹など)", "Not from currency (Genesis Tree etc.)");
  if (w === "normal") {
    if (isDesecratedGroup(group)) return tr("冒涜専用 MOD は骨でしか付かない", "Desecrated-only mods only roll from a Bone");
    return null;
  }
  if (w === "fracture") return isDesecratedGroup(group) ? tr("冒涜の MOD はフラクチャーできない", "Desecrated mods can't be Fractured") : null;
  return isEssenceGroup(group) ? tr("クラフト MOD は骨では付かない (骨は冒涜専用と一般 MOD)", "Crafted mods don't roll from a Bone (Bones give desecrated-only and normal mods)") : null;
}

/** その段以上をその付け方の狙いにする (段が違えば替える。✦ はフラクチャーの時だけ、via は冒涜の時だけ) */
export function attachIn(d: TreeDoc, modId: string, tier: number, w: AttachWay): void {
  const list = d.memoAims ?? [];
  let g = list.find((a) => a.modId === modId);
  if (!g) { g = { modId, tier }; list.push(g); }
  else if (g.tier !== tier) { g.tier = tier; delete g.values; }
  if (w === "fracture") g.fractured = true; else delete g.fractured;
  if (w === "desecrated") g.via = w; else delete g.via;
  d.memoAims = list;
  migrateStart(d);
  // ✦ の MOD はスタートの＋の MOD から外す (use-tree の toggleFracture と同じ)
  d.start!.mods = d.start!.mods.filter((m) => !list.some((a) => a.fractured && a.modId === m.modId));
  d.start!.rarity = startRarity(d);
}

/** 狙いから外す */
export function detachIn(d: TreeDoc, modId: string): void {
  const next = (d.memoAims ?? []).filter((a) => a.modId !== modId);
  if (next.length) d.memoAims = next; else delete d.memoAims;
  migrateStart(d);
  d.start!.rarity = startRarity(d);
}

