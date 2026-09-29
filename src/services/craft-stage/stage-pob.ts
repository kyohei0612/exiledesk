/**
 * stage-pob.ts — クラフトステージのアイテムを PoB で計算するための形 (2026-09-29、POE2Tube 要望 ⑰-3 / ⑰-4)
 *
 * kyohei「スキルの DPS やダメージ表記がないと分かりづらい、複雑な計算だから PoB の計算機で」。
 * 計算は同梱のヘッドレス PoB (src-tauri/examples/stage_pob.rs、cargo の CLI)。撮影はブラウザで開くので画面から PoB は呼べない →
 * scripts/craft-stage-run.mjs が手順 → 結果 JSON を作る時に計算して結果 JSON の `pob` に入れ、動画モードは URL の `stage-pob=` でその値を出すだけ。
 *
 * 手順 JSON の追加キー `pob` (POE2Tube と取り決め):
 *   { class: "Ranger", level: 20, skill: "Lightning Arrow", supports?: ["…"], gem_level?: 6,
 *     config?: { resistancePenalty: 0 | -10 … -60, enemyIsBoss: "None" | "Boss" | "Pinnacle" | "Uber", enemyLevel?: number } }
 *   パッシブ・他の装備は無し (素のキャラ) で、手ごとのアイテムだけ入れ替える。gem_level が無ければキャラのレベルで使える一番高いジェムレベル。
 * 結果 JSON の `pob`: { version, character, config (実際に使った設定を全部), config_ja, steps: [手 0 (白) … 最後] ごとの { dps, hit, aps, crit, armour, evasion, es, resists } }
 */
import type { StageItem } from "./types";
import { htcBaseInfo } from "../htc/patch";

/** PoB の既定 (ConfigOptions.lua の defaultIndex)。手順で指定が無い物はこれを明示して渡し、結果にも書き戻す */
export const POB_DEFAULT_CONFIG = { resistancePenalty: -60, enemyIsBoss: "Pinnacle" } as const;
/** 設定の言葉 (解説用。PoB の画面の言葉を日本語に) */
export const PENALTY_JA: Record<number, string> = { 0: "アクト 1 (0%)", [-10]: "アクト 2 (-10%)", [-20]: "アクト 3 (-20%)", [-30]: "アクト 4 (-30%)", [-40]: "アクト 5 (-40%)", [-50]: "アクト 6 (-50%)", [-60]: "エンドゲーム (-60%)" };
export const BOSS_JA: Record<string, string> = { None: "普通の敵", Boss: "ボス", Pinnacle: "ガーディアン・ピナクルボス", Uber: "ユーバーピナクルボス" };

export interface PobPlan {
  class: string;
  level: number;
  skill: string;
  supports?: string[];
  gem_level?: number;
  config?: Record<string, number | string>;
}
/** 1 つの状態の PoB の値 */
export interface PobStat {
  dps: number;
  hit: number;
  aps: number;
  crit: number;
  armour: number;
  evasion: number;
  es: number;
  life: number;
  /** 耐性: value = 上限とペナルティの後 (実際の値)、total = 上限前の合計 (ペナルティ込み) */
  resists: Record<"fire" | "cold" | "lightning" | "chaos", { value: number; total: number }>;
}
export interface PobBlock {
  version: string;
  character: { class: string; level: number; skill: string; skill_ja: string | null; gem_level: number; supports: string[] };
  config: Record<string, number | string>;
  config_ja: string;
  steps: PobStat[];
}

/** 使う設定 (既定 + 手順の指定) と、その言葉 */
export function pobConfigOf(p: PobPlan): { config: Record<string, number | string>; ja: string } {
  const config: Record<string, number | string> = { ...POB_DEFAULT_CONFIG, ...(p.config ?? {}) };
  const parts = [BOSS_JA[String(config.enemyIsBoss)] ?? String(config.enemyIsBoss), PENALTY_JA[Number(config.resistancePenalty)] ?? `耐性 ${config.resistancePenalty}%`];
  if (config.enemyLevel != null) parts.push(`敵のレベル ${config.enemyLevel}`);
  return { config, ja: `${parts[0]}・${parts[1]} のペナルティ${parts[2] ? `・${parts[2]}` : ""}` };
}

/** PoB の装備の枠 (計算機の部位 → PoB の Slot 名) */
export function pobSlotOf(category: string): string | null {
  if (/^(Bows|Crossbows|OneHand_|TwoHand_|Quarterstaves|Spears|Talismans|Wands|Staves|Sceptres)/.test(category)) return "Weapon 1";
  if (/^(Shields|Bucklers|Foci|Quivers)/.test(category)) return "Weapon 2";
  if (category.startsWith("Body_Armours")) return "Body Armour";
  if (category.startsWith("Helmets")) return "Helmet";
  if (category.startsWith("Gloves")) return "Gloves";
  if (category.startsWith("Boots")) return "Boots";
  if (category === "Rings") return "Ring 1";
  if (category === "Amulets") return "Amulet";
  if (category === "Belts") return "Belt";
  return null;
}

const RARITY = { normal: "Normal", magic: "Magic", rare: "Rare", unique: "Unique" } as const;
/**
 * PoB のアイテムの文面 (Classes/Item.lua の BuildRaw と同じ並び)。ルーンは `Rune:` と `{rune}` の行、
 * ベースの固有は英語の文面 (計算機のベースの表)。壊れた・解呪した・ユニーク (MOD の表が無い) は null (装備しない)
 */
export function pobItemText(it: StageItem): string | null {
  if (it.destroyed || it.disposed || it.rarity === "unique") return null;
  const NL = String.fromCharCode(10);
  const implicits = (htcBaseInfo()[it.base]?.implicits ?? []).map((i) => (i as { en?: string }).en).filter((x): x is string => !!x);
  const runes = it.augments ?? [];
  const lines = [`Rarity: ${RARITY[it.rarity]}`, it.rarity === "rare" ? "Stage Item" : it.base, it.base, "--------", `Item Level: ${it.itemLevel}`];
  if (it.quality > 0) lines.push(`Quality: ${it.quality}`);
  if (it.sockets) {
    lines.push(`Sockets: ${Array.from({ length: it.sockets }, () => "S").join(" ")}`);
    for (let i = 0; i < it.sockets; i++) lines.push(`Rune: ${runes[i]?.en ?? "None"}`);
  }
  lines.push("--------", `Implicits: ${runes.length + implicits.length}`);
  for (const r of runes) lines.push(`{rune}${r.textEn}`);
  lines.push(...implicits);
  if (it.identified !== false) for (const m of [...it.prefixes, ...it.suffixes]) if (!m.unrevealed) lines.push(m.textEn);
  if (it.corrupted) lines.push("Corrupted");
  return lines.join(NL);
}

const n = (o: Record<string, number>, k: string): number => (typeof o[k] === "number" ? o[k]! : 0);
/** stage_pob の 1 手の出力 → 結果 JSON の形 */
export function pobStatOf(o: Record<string, number>): PobStat {
  const r = (e: string) => ({ value: n(o, `${e}Resist`), total: n(o, `${e}ResistTotal`) });
  return {
    dps: n(o, "TotalDPS") || n(o, "CombinedDPS"),
    hit: n(o, "AverageDamage"),
    aps: n(o, "Speed"),
    crit: n(o, "CritChance"),
    armour: n(o, "Armour"),
    evasion: n(o, "Evasion"),
    es: n(o, "EnergyShield"),
    life: n(o, "Life"),
    resists: { fire: r("Fire"), cold: r("Cold"), lightning: r("Lightning"), chaos: r("Chaos") },
  };
}

/** DPS の短い書き方 (123 / 1.2K / 3.4M) */
export function dpsText(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return v >= 100 ? String(Math.round(v)) : v.toFixed(1);
}
