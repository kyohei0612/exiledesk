/**
 * 上位プレイヤー MOD 一覧で選んだ MOD → クラフト計算機の「ベースから選ぶ」の中身 (2026-09-29)
 *
 * オーナー「MOD の方はクラフト追加ボタンとクラフトへボタン追加してあげて、選んだ MOD をそのままクラフトできるようにルート組んであげて」。
 *
 * 一覧の MOD は poe.ninja の英語の文面 (`+# to maximum Life`) と、段の表 (T1 が先頭) しか持たない。
 * 計算機のエンジンの MOD (Rings の IncreasedLife の何段目) に繋ぐのは、忍者ビルドコピーのレアと同じく
 * **ゲームのコピーの形に並べて計算機の貼り付けの解析 (parseJaItem → targetsFor) に通す**。
 * 数値は選んだ段の幅の真ん中を入れるので、解析はその段を読む。
 */
import { loadHtcPatch, htcBaseInfo } from "../htc/patch";
import { parseJaItem, targetsFor } from "../htc/paste";
import { stripMarkers } from "../htc/paste-parse";
import type { ModEntry } from "./types";

/** 計算機に渡す 1 つの MOD (エンジンの MOD と段) */
export interface CraftPick {
  modId: string;
  /** エンジンの `mod.tiers` の添字 (大きいほど良い段) */
  tierIndex: number;
}
/** 計算機に渡す中身 */
export interface CraftPlan {
  /** ベースの英語名 */
  baseType: string;
  itemLevel: number;
  picks: CraftPick[];
  /** 計算機で作れなかった MOD の文面 (画面で断る) */
  skipped: string[];
}
/** 一覧で選んだ MOD と段 (ModEntry.tiers の添字、T1 = 0。-1 = 制限なし) */
export interface ChosenMod {
  mod: ModEntry;
  tierIdx: number;
}

/** 普段のアイテムレベル。段がこれより上を要る時だけ上げる */
const DEFAULT_ILVL = 82;

/** 段の幅の真ん中 (整数の段は整数に) */
function mid(lo: number, hi: number): number {
  const v = (lo + hi) / 2;
  return Number.isInteger(lo) && Number.isInteger(hi) ? Math.round(v) : Math.round(v * 10) / 10;
}

/**
 * 選んだ段の数値を埋めた 1 行。段が無い MOD は一覧の数値のまま。
 * 制限なし (-1) は一番下の段 (その MOD が付いていれば良い)
 */
function lineOf({ mod, tierIdx }: ChosenMod): string {
  const tiers = mod.tiers ?? [];
  const t = tierIdx >= 0 ? tiers[tierIdx] : tiers[tiers.length - 1];
  const nums = t ? t.mins.map((lo, k) => mid(lo, t.maxs[k] ?? lo)) : mod.values;
  let k = 0;
  // 注記 (`[Cold]` `[Strength|Strength]`) は外す。残すと解析が当たらない
  return stripMarkers(mod.rawTemplate).replace(/#/g, () => String(nums[k++] ?? nums[0] ?? 0));
}

/** 計算機のベース表にある物か (一覧のベースは poe.ninja の英語名) */
export function isCraftableBase(baseType: string): boolean {
  return !!htcBaseInfo()[baseType];
}

/** 計算機のデータを読む (ベースの表を引く前に 1 回) */
export async function prepareCraftData(): Promise<void> {
  await loadHtcPatch();
}

/** 選んだ MOD → 計算機の中身 */
export async function craftPlanFor(baseType: string, chosen: readonly ChosenMod[]): Promise<CraftPlan> {
  const data = await loadHtcPatch();
  const level = Math.max(DEFAULT_ILVL, ...chosen.map(({ mod, tierIdx }) => mod.tiers?.[tierIdx]?.level ?? 0));
  const NL = String.fromCharCode(10);
  const lines = chosen.map(lineOf);
  const text = ["Rarity: Rare", "Craft Target", baseType, "--------", `Item Level: ${level}`, "--------", ...lines].join(NL);
  const got = targetsFor(data, parseJaItem(text));
  return {
    baseType,
    itemLevel: level,
    picks: got.targets.map((t) => ({ modId: t.modId, tierIndex: t.minTierIndex ?? 0 })),
    skipped: [...got.skipped, ...got.dropOnly.map((d) => d.text)].filter((s, i, a) => a.indexOf(s) === i),
  };
}
