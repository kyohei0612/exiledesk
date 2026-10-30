/**
 * tree-attach.ts — 完成形の設定の「付ける」の付け方 4 択 (S-10b、スイッチ attachWay、10-31 オーナー決め 15)。
 * ふつう・フラクチャー・冒涜・エッセンスから選ぶ。フラクチャーは ✦ の印 (S-10)、冒涜・エッセンスは付け方の覚え (Aim.via) だけで木の判定には使わない。
 * 出ない付け方の訳は MOD の出どころ (一覧の行の群れ) から: 冒涜専用は骨だけ、クラフト MOD はエッセンス・合金だけ (E-41・E-62・E-95)
 */
import { ref } from "vue";
import { tr } from "../../../i18n/lang";
import { migrateStart, startRarity, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";

export type AttachWay = "normal" | "fracture" | "desecrated" | "essence";
export const ATTACH_WAYS: readonly AttachWay[] = ["normal", "fracture", "desecrated", "essence"];

/** 付け方の名前 */
export const wayName = (w: AttachWay): string =>
  w === "normal" ? tr("ふつう", "Normal") : w === "fracture" ? tr("フラクチャー", "Fracture") : w === "desecrated" ? tr("冒涜", "Desecrate") : tr("エッセンス", "Essence");

/** その狙いの付け方 (狙いでなければ null) */
export const wayOfAim = (a: Aim | undefined): AttachWay | null => (!a ? null : a.fractured ? "fracture" : a.via ?? "normal");

const isDesecratedGroup = (g: string | undefined): boolean => g === "desecrated" || g === "otherworldly";
const isEssenceGroup = (g: string | undefined): boolean => g === "essence" || g === "perfect_essence";

/** その行の MOD がその付け方で出ない訳 (出るなら null)。group は MOD 一覧の行の群れ */
export function wayBlock(group: string | undefined, w: AttachWay): string | null {
  // 創生の樹など (ベースの special の置き場) はカレンシーでは付かない。フラクチャーの印だけは前の「フラクチャー」ボタンと同じく付けられる
  if (group === "special" && w !== "fracture") return tr("カレンシーでは付かない MOD (創生の樹など)", "Not from currency (Genesis Tree etc.)");
  if (w === "normal") {
    if (isDesecratedGroup(group)) return tr("冒涜専用 MOD は骨でしか付かない", "Desecrated-only mods only roll from a Bone");
    if (isEssenceGroup(group)) return tr("クラフト MOD はエッセンス・合金でしか付かない", "Crafted mods only come from an Essence / Alloy");
    return null;
  }
  if (w === "fracture") return isDesecratedGroup(group) ? tr("冒涜の MOD はフラクチャーできない", "Desecrated mods can't be Fractured") : null;
  if (w === "desecrated") return isEssenceGroup(group) ? tr("クラフト MOD は骨では付かない (骨は冒涜専用と一般 MOD)", "Crafted mods don't roll from a Bone (Bones give desecrated-only and normal mods)") : null;
  return isEssenceGroup(group) ? null : tr("エッセンス・合金で付く MOD ではない", "Not a mod from an Essence / Alloy");
}

/** その段以上をその付け方の狙いにする (段が違えば替える。✦ はフラクチャーの時だけ、via は冒涜・エッセンスの時だけ) */
export function attachIn(d: TreeDoc, modId: string, tier: number, w: AttachWay): void {
  const list = d.memoAims ?? [];
  let g = list.find((a) => a.modId === modId);
  if (!g) { g = { modId, tier }; list.push(g); }
  else if (g.tier !== tier) { g.tier = tier; delete g.values; }
  if (w === "fracture") g.fractured = true; else delete g.fractured;
  if (w === "desecrated" || w === "essence") g.via = w; else delete g.via;
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

/** 4 択を開いている段 (`modId|tier`、一度に 1 つ) */
export const attachOpen = ref<string | null>(null);
