/**
 * base-catalog.ts — ベースの一覧 (種類の段・素の数値・固有の効果) の共通の中身 (2026-09-29)
 *
 * クラフトステージのベース選び (StageBasePicker) で作った物を、クラフト計算機などでも使うために切り出した
 * (オーナー「ステージのベース選びの画像や MOD の仕組みは革新的だから他のところにも流用したい」)。
 *   - 種類は poe2db と同じ並びの段、キーは計算機のエンジンの行 (Gloves_str など。行ごとに MOD の置き場が違う)
 *   - ルーンフォージ等 (ヴェリシウムで作る物) と、エンジンの行が無いベース (ユニーク専用・[DNT]) は出さない
 *   - フラスコ・スキルジェムは extras: true の時だけ (計算機は MOD の置き場が無いので出さない)
 */
import { htcBaseInfo } from "../htc/patch";
import { classOfBase } from "../htc/bridge";
import { baseStatsOf, FLASK_BASES, GEM_BASES } from "../craft-stage/stage-bases";
import { jaTypeName } from "../trade2/localize";
import type { PatchData } from "../../vendor/poe2htc/engine/types";

/** 能力値の要求 (ゲームの言葉で。2026-10-09 初見レビュー「手袋(dex_int) が読めない」) */
const ATTR_JA: Record<string, string> = { str: "筋力", dex: "器用", int: "知性", str_dex: "筋力・器用", str_int: "筋力・知性", dex_int: "器用・知性" };
const A = (k: string, ja: string): Array<[string, string]> => ["str", "dex", "int", "str_dex", "str_int", "dex_int"].map((x) => [`${k}_${x}`, `${ja} (${ATTR_JA[x]})`]);
const EL = (k: string, ja: string): Array<[string, string]> => [[k, ja], ...([["fire", "火"], ["cold", "冷気"], ["lightning", "雷"], ["chaos", "混沌"], ["physical", "物理"]] as const).map(([x, j]): [string, string] => [`${k}_${x}`, `${ja} (${j})`])];
/** 種類の段 (poe2db のモッドの一覧と同じ並び) */
export const CATALOG_ROWS: Array<{ ja: string; cls: Array<[string, string]> }> = [
  { ja: "片手武器", cls: [...EL("Wands", "ワンド"), ["OneHand_Maces", "片手メイス"], ["Sceptres", "セプター"], ["Spears", "スピア"]] },
  { ja: "両手武器", cls: [["Bows", "弓"], ...EL("Staves", "スタッフ"), ["TwoHand_Maces", "両手メイス"], ["Quarterstaves", "クォータースタッフ"], ["Crossbows", "クロスボウ"], ["Talismans", "タリスマン"]] },
  { ja: "宝飾品", cls: [["Amulets", "アミュレット"], ["Rings", "指輪"], ["Belts", "ベルト"]] },
  { ja: "手袋", cls: A("Gloves", "手袋") },
  { ja: "靴", cls: A("Boots", "靴") },
  { ja: "鎧", cls: A("Body_Armours", "鎧") },
  { ja: "兜", cls: A("Helmets", "兜") },
  { ja: "オフハンド", cls: [["Quivers", "矢筒"], ["Shields_str", "盾 (筋力)"], ["Shields_str_dex", "盾 (筋力・器用)"], ["Shields_str_int", "盾 (筋力・知性)"], ["Bucklers", "バックラー"], ["Foci", "フォーカス"]] },
  { ja: "フラスコ", cls: [["LifeFlask", "ライフフラスコ"], ["ManaFlask", "マナフラスコ"]] },
  { ja: "ジェム", cls: [["SkillGem", "スキルジェム"]] },
];
export const CATALOG_CLS_JA = new Map(CATALOG_ROWS.flatMap((r) => r.cls));
/**
 * 種類の日本語 (ゲームのアイテムクラス名。クライアントの ItemClasses と同じ = スピア・フォーカス・鎧)。
 * 行 (Gloves_str) は属性付きで、属性の無いキー (Gloves・Shields) は属性を外した名前。アプリの種類名はここから取る
 */
export function classJa(cls: string, withAttr = true): string {
  const hit = CATALOG_CLS_JA.get(cls) ?? [...CATALOG_CLS_JA].find(([k]) => k.startsWith(`${cls}_`))?.[1];
  if (!hit) return cls.replace(/_/g, " ");
  return withAttr && CATALOG_CLS_JA.has(cls) ? hit : hit.replace(/\s*\(.*\)$/, "");
}
/** ヴェリシウムで作る (最初から選ぶ物ではない) ベース */
const RUNE_MADE = /^(Runeforged|Runemastered|Runefather's) /;

const num = (v: number | [number, number] | undefined): string => (v === undefined ? "" : Array.isArray(v) ? `${v[0]}-${v[1]}` : String(v));
/** 素の数値を 1 行に (範囲はそのまま) */
export function baseStatLine(en: string): string {
  const b = baseStatsOf(en);
  if (!b) return "";
  const out: string[] = [];
  if (b.armour) out.push(`アーマー ${num(b.armour)}`);
  if (b.evasion) out.push(`回避力 ${num(b.evasion)}`);
  if (b.es) out.push(`エナジーシールド ${num(b.es)}`);
  if (b.block) out.push(`ブロック ${b.block}%`);
  if (b.phys) out.push(`物理 ${b.phys[0]}-${b.phys[1]}`);
  if (b.aps) out.push(`${b.aps.toFixed(2)} 回/秒`);
  if (b.crit && b.phys) out.push(`クリ ${b.crit.toFixed(2)}%`);
  if (b.life) out.push(`ライフ ${b.life}`);
  if (b.mana) out.push(`マナ ${b.mana}`);
  return out.join(" · ");
}

export interface CatalogRow { en: string; ja: string; cls: string; lvl: number; implicit: string; stats: string }

/** 全ベース (extras: フラスコ・スキルジェムも) */
export function baseCatalog(d: PatchData, extras: boolean): CatalogRow[] {
  const out: CatalogRow[] = Object.entries(htcBaseInfo()).flatMap(([en, i]): CatalogRow[] => {
    const row = RUNE_MADE.test(en) ? null : classOfBase(d, en);
    return row ? [{ en, ja: i.ja, cls: row.id, lvl: i.lvl, implicit: (i.implicits ?? []).map((x) => x.ja).join(" / "), stats: baseStatLine(en) }] : [];
  });
  if (extras) {
    for (const f of FLASK_BASES) out.push({ en: f.en, ja: jaTypeName(f.en), cls: f.cls, lvl: f.lvl, implicit: "", stats: baseStatLine(f.en) });
    for (const g of GEM_BASES) out.push({ en: g.en, ja: g.ja, cls: "SkillGem", lvl: 0, implicit: "", stats: "" });
  }
  return out;
}
