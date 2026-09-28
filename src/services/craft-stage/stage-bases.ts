/**
 * stage-bases.ts — クラフトステージのベースの数値と、計算機 (HTC) に無いベース (フラスコ・スキルジェム) (2026-09-28、POE2Tube 要望 ⑧)
 *
 * 数値は stage-bases.json (scripts/build-craft-stage-bases.mjs、クライアント原本の base_items.json から)。
 *   - 防具の防御力 / 武器の物理ダメージ・速度・クリティカル / フラスコの回復量 → アイテム枠に出し、品質で変わる数値を見せる
 *   - フラスコ・スキルジェムは計算機の MOD の置き場を持たないので、置き場が空の仮のベース (ItemBase) を作る
 *     (品質のカレンシー・宝飾職人のオーブなど、MOD を足さない物だけが打てる)
 */
import type { ItemBase } from "../../vendor/poe2htc/engine/types";
import stageBases from "./stage-bases.json";
import gemsRaw from "../../i18n/gems-client.json";
import vaal from "../../i18n/vaal-enchants.json";

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
export function uniquesForBase(base: string): Array<{ en: string; ja: string }> {
  return Object.entries(UNIQUES).filter(([, u]) => u.base === base).map(([en, u]) => ({ en, ja: u.ja }));
}
