/**
 * stage-bases.ts — クラフトステージのベースの数値と、計算機 (HTC) に無いベース (フラスコ・スキルジェム) (2026-09-28、POE2Tube 要望 ⑧)
 *
 * 数値は stage-bases.json (scripts/build-craft-stage-bases.mjs、クライアント原本の base_items.json から)。
 *   - 防具の防御力 / 武器の物理ダメージ・速度・クリティカル / フラスコの回復量 → アイテム枠に出し、品質で変わる数値を見せる
 *   - フラスコ・スキルジェムは計算機の MOD の置き場を持たないので、置き場が空の仮のベース (ItemBase) を作る
 *     (品質のカレンシー・宝飾職人のオーブなど、MOD を足さない物だけが打てる)
 */
import type { ItemBase } from "../../vendor/poe2htc/engine/types";
import type { StageItem } from "./types";
// ルーンの要求レベルは表を直接読む (stage-runes → apply-act → stage-bases の輪にしないため)
import runesRaw from "./stage-runes.json";
const RUNES = (runesRaw as unknown as { runes: Record<string, { level?: number }> }).runes;
import stageBases from "./stage-bases.json";
import basesPob from "./stage-bases-pob.json";
import gemsRaw from "../../i18n/gems-client.json";
import vaal from "../../i18n/vaal-enchants.json";
import { lang } from "../../i18n/lang";

export interface BaseStats {
  cls: string;
  lvl?: number;
  armour?: number | [number, number];
  evasion?: number | [number, number];
  es?: number | [number, number];
  block?: number;
  phys?: [number, number];
  aps?: number;
  crit?: number;
  life?: number;
  mana?: number;
  duration?: number;
  charges?: [number, number];
}
const BASES = (stageBases as unknown as { bases: Record<string, BaseStats> }).bases;
const GEMS = (gemsRaw as Array<{ en: string; ja: string; kind: string }>).filter((g) => g.kind === "skill");

/**
 * 装備に必要なレベル・能力値 (要望 ⑱-3)。PoB の Data/Bases の req (scripts/build-stage-runes.mjs → stage-bases-pob.json)。
 * 要求レベルはドロップレベルと同じ値 (PoB で確認: 三日月のクォータースタッフ 20 / スパイククラブ 16)。要求の無いベースは null
 */
export interface BaseReq { level?: number; str?: number; dex?: number; int?: number }
const REQS = (basesPob as unknown as { reqs: Record<string, BaseReq> }).reqs;
export const reqOf = (base: string): BaseReq | null => REQS[base] ?? null;
/**
 * アイテムの要求レベル = max(ベースの要求レベル、付いている各 MOD の floor(MOD レベル × 0.8)、差したルーン・ソウルコアの要求レベル)。
 * エッセンスでも普通の MOD でも同じ (PoB Classes/Item.lua の 0.8、公式フォーラム 3849633 の 8 → 36 = 46 × 0.8。POE2Tube の答え 2026-10-06、要望 ㉟-2)。
 * 未発現の冒涜 MOD は MOD レベル 1。ルーンは 0.8 を掛けない (SoulCores.RequiredLevel)
 */
export function reqOfItem(item: StageItem): BaseReq | null {
  const r = reqOf(item.base);
  const mods = [...item.prefixes, ...item.suffixes].map((m) => Math.floor((m.unrevealed ? 1 : m.modLevel) * 0.8));
  const runes = (item.augments ?? []).map((a) => RUNES[a.en]?.level ?? 0);
  const need = Math.max(0, ...mods, ...runes);
  if (!need || (r?.level ?? 0) >= need) return r;
  return { ...(r ?? {}), level: need } as BaseReq;
}
/** 要求の言葉 (「要求 Lv 20・器用さ 30・知性 14」)。無ければ "" */
export function reqText(base: string | StageItem): string {
  const r = typeof base === "string" ? reqOf(base) : reqOfItem(base);
  if (!r) return "";
  if (lang.value === "en") {
    const en = [r.level ? `Level ${r.level}` : "", r.str ? `${r.str} Str` : "", r.dex ? `${r.dex} Dex` : "", r.int ? `${r.int} Int` : ""].filter(Boolean);
    return en.length ? `Requires ${en.join(", ")}` : "";
  }
  const parts = [r.level ? `Lv ${r.level}` : "", r.str ? `筋力 ${r.str}` : "", r.dex ? `器用さ ${r.dex}` : "", r.int ? `知性 ${r.int}` : ""].filter(Boolean);
  return parts.length ? `要求 ${parts.join("・")}` : "";
}

/** ベースの数値 (無ければ null) */
export const baseStatsOf = (base: string): BaseStats | null => BASES[base] ?? null;

/** 仮のベースの種類 (計算機の category の代わり) */
export type ExtraCategory = "LifeFlask" | "ManaFlask" | "SkillGem";
const EMPTY = { prefixes: [] as string[], suffixes: [] as string[] };

/** フラスコの一覧 (ライフ → マナ、ドロップレベル順) */
export const FLASK_BASES: Array<{ en: string; cls: ExtraCategory; lvl: number }> = Object.entries(BASES)
  .filter(([, v]) => v.cls === "LifeFlask" || v.cls === "ManaFlask")
  .map(([en, v]) => ({ en, cls: v.cls as ExtraCategory, lvl: v.lvl ?? 1 }))
  .sort((a, b) => a.cls.localeCompare(b.cls) || a.lvl - b.lvl);
/** スキルジェムの一覧 (日本語名つき) */
export const GEM_BASES: Array<{ en: string; ja: string }> = GEMS.map((g) => ({ en: g.en, ja: g.ja })).sort((a, b) => a.ja.localeCompare(b.ja, "ja"));

/** 計算機に無いベースの仮の ItemBase (フラスコ・スキルジェム)。どれでもなければ null */
export function extraBaseFor(base: string): { cls: ItemBase; ja?: string } | null {
  const b = BASES[base];
  if (b && (b.cls === "LifeFlask" || b.cls === "ManaFlask")) return { cls: synth(base, b.cls) };
  const g = GEMS.find((x) => x.en === base);
  if (g) return { cls: synth(base, "SkillGem"), ja: g.ja };
  return null;
}
function synth(base: string, category: ExtraCategory): ItemBase {
  return {
    id: category,
    name: base,
    bases: [base],
    category,
    pools: { normal: EMPTY, desecrated: EMPTY, essence: EMPTY },
    limits: { prefixes: 0, suffixes: 0, crafted: 0 },
  } as unknown as ItemBase;
}
export const isFlask = (category: string): boolean => category === "LifeFlask" || category === "ManaFlask";
export const isGem = (category: string): boolean => category === "SkillGem";

/** そのベースのユニーク (可能性のオーブでなる物)。src/i18n/vaal-enchants.json の uniques (trade2 のユニーク名 → ベース) */
const UNIQUES = (vaal as unknown as { uniques: Record<string, { ja: string; base: string }> }).uniques;
/** 同じ種類 (trade2 のクラス) のユニーク (ヴァール培養のオーブ: 「同じアイテムクラスのランダムなユニーク」)。そのユニーク自身は除く */
export function uniquesOfSameClass(en: string): Array<{ en: string; ja: string }> {
  const cls = (UNIQUES[en] as { cls?: string } | undefined)?.cls;
  if (!cls) return [];
  return Object.entries(UNIQUES).filter(([n, u]) => n !== en && (u as { cls?: string }).cls === cls).map(([n, u]) => ({ en: n, ja: u.ja }));
}
/** そのベースと同じ種類 (trade2 のクラス) のユニーク全部 (古代人のお告げ:「同じアイテムクラスのランダムなユニーク」) */
export function uniquesOfClassForBase(base: string): Array<{ en: string; ja: string }> {
  const cls = Object.values(UNIQUES).find((u) => u.base === base && (u as { cls?: string }).cls) as { cls?: string } | undefined;
  if (!cls?.cls) return uniquesForBase(base);
  return Object.entries(UNIQUES).filter(([, u]) => (u as { cls?: string }).cls === cls.cls).map(([en, u]) => ({ en, ja: u.ja }));
}
/** そのユニークのベース (英語名)。無ければ null */
export const uniqueBaseOf = (en: string): string | null => UNIQUES[en]?.base ?? null;
export function uniquesForBase(base: string): Array<{ en: string; ja: string }> {
  return Object.entries(UNIQUES).filter(([, u]) => u.base === base).map(([en, u]) => ({ en, ja: u.ja }));
}
