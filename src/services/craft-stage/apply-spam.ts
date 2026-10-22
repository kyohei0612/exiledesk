/**
 * apply-spam.ts — スパムシミュの当たった形をクラフト台に置く 1 手 (2026-10-22 オーナー「当たった状態でクラフト台に戻る」「工程にスパムの 1 行、費用も入れる」)。
 * 鍵 spam:{…} に道・等級・費用 (高貴建て)・手数と、置く MOD (Force の形) とレアリティを入れる。打つと MOD を丸ごと置き換える
 * (暗黙・品質・ソケット・ルーンは打つ前のアイテムのまま)。乱数を使わないので、再生 (手順 JSON) でも同じ形に飛ぶ。1 つ戻すでこの行ごと消える
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { startFrom } from "./run-plan";
import type { Force } from "./stage-core";
import type { StageApply, StageItem } from "./types";
import { tr } from "../../i18n/lang";

export const SPAM = "spam:";
export const isSpam = (key: string): boolean => key.startsWith(SPAM);
/** 鍵の中身。avg = 道のカードから (費用は 100 人の平均) / 運試しから (その 1 人の費用) */
export interface SpamStep { route: string; grade: string; cost: number; n: number; avg: boolean; rarity: StageItem["rarity"]; mods: Force[] }

export function spamKey(s: SpamStep): string {
  return SPAM + JSON.stringify(s);
}
export function parseSpam(key: string): SpamStep | null {
  if (!isSpam(key)) return null;
  try {
    const s = JSON.parse(key.slice(SPAM.length)) as SpamStep;
    return Array.isArray(s.mods) && typeof s.cost === "number" ? s : null;
  } catch { return null; }
}
/** 置く MOD (アイテムの明示 MOD を始めの MOD の形に。値・フラクチャー・冒涜の印も) */
export const forcesOf = (it: StageItem): Force[] => [...it.prefixes, ...it.suffixes].map((m) => ({ mod: m.modId, tier: m.tierName, values: m.values, ...(m.fractured ? { fractured: true } : {}), ...(m.desecrated ? { desecrated: true } : {}) }));

export function applySpam(data: PatchData, item: StageItem, key: string): StageApply {
  const s = parseSpam(key);
  if (!s) return { applied: false, item, added: [], removed: [], reason: tr("スパムの手の形が違う", "Invalid spam step") };
  let built: StageItem;
  try { built = startFrom(data, item.base, item.itemLevel, { mods: s.mods, rarity: s.rarity }, 0); }
  catch (e) { return { applied: false, item, added: [], removed: [], reason: e instanceof Error ? e.message : String(e) }; }
  const before = [...item.prefixes, ...item.suffixes];
  const after = [...built.prefixes, ...built.suffixes];
  return { applied: true, item: { ...item, rarity: s.rarity, prefixes: built.prefixes, suffixes: built.suffixes }, added: after, removed: before };
}

const ROUTE_JA: Record<string, [string, string]> = { augment: ["増強スパム", "Augment spam"], chaos: ["カオススパム", "Chaos spam"], exalt: ["高貴スパム", "Exalt spam"] };
const GRADE_JA: Record<string, [string, string]> = { base: ["無印", "Regular"], greater: ["上級", "Greater"], perfect: ["完全", "Perfect"] };
/** 工程の 1 行の名前 (例「カオススパム・無印 (100 人の平均、この 1 人は 17 手)」) */
export function spamName(s: SpamStep, en: boolean): string {
  const r = ROUTE_JA[s.route] ?? [s.route, s.route], g = GRADE_JA[s.grade] ?? [s.grade, s.grade];
  return en
    ? `${r[1]} (${g[1]}) — ${s.avg ? `average of 100, this one hit on use ${s.n}` : `luck test, ${s.n} uses`}`
    : `${r[0]}・${g[0]} (${s.avg ? `100 人の平均、この 1 人は ${s.n} 手` : `運試し ${s.n} 手`})`;
}
