/**
 * stage-props.ts — 武器・防具の上の数値 (プロパティ) にローカル MOD・ルーン・品質を反映する (2026-09-29、POE2Tube 要望 ⑰-2)
 *
 * ゲームのツールチップと同じく、そのアイテムの数値を変える MOD (local_…) を上の行に足し、変わった数値は青で出す。
 *   - 物理ダメージ = (素 + 追加の物理) × (1 + 物理ダメージ増加%) × (1 + 品質%)  … 品質は 1% ごとに 1% more (poe2db の Quality、今までの表示と同じ)
 *   - 火 / 冷気 / 雷 / 混沌ダメージ = 追加の分 (別の行)
 *   - アタック/秒 = 素 × (1 + 攻撃速度増加%)、クリティカルヒット率 = 素 + 追加 (local_critical_strike_chance は ÷100 済みの %)
 *   - アーマー / 回避力 / ES = (素 + 固定値) × (1 + 増加% の合計 (「アーマーと回避力」などの両方に効く物も)) × (1 + 品質%)
 *     (ES の式は規格外の賭けの ladder.ts がゲーム内の実測で確かめた形と同じ)
 * 足し方の細かい丸め (ゲームは切り捨てか四捨五入か) は出典が無いので四捨五入。数値の正は PoB (要望 ⑰-3 の DPS は PoB で計算する)。
 */
import { baseStatsOf } from "./stage-bases";
import { displayValue } from "../mods/stat-scale";
import type { StageItem } from "./types";
import { lang } from "../../i18n/lang";

export interface PropRow { key: string; label: string; value: string; up: boolean }

/** アイテムに付いている stat の合計 (MOD とルーン) */
function sums(item: StageItem): Map<string, number> {
  const m = new Map<string, number>();
  const add = (id: string, v: number) => m.set(id, (m.get(id) ?? 0) + v);
  if (item.identified !== false) for (const md of [...item.prefixes, ...item.suffixes]) (md.stats ?? []).forEach((id, i) => add(id, md.values[i] ?? 0));
  // ルーンの stat はクライアントの生の値 (リーチ 300 = 3%)。MOD の values は画面の単位なので揃える (services/mods/stat-scale.ts)
  for (const a of item.augments ?? []) for (const s of a.stats) add(s.id, displayValue(s.id, s.value));
  return m;
}
const ELEMENTS = [
  { key: "fire", label: "火ダメージ", en: "Fire Damage" },
  { key: "cold", label: "冷気ダメージ", en: "Cold Damage" },
  { key: "lightning", label: "雷ダメージ", en: "Lightning Damage" },
  { key: "chaos", label: "混沌ダメージ", en: "Chaos Damage" },
] as const;
const DEF = [
  { key: "armour", label: "アーマー", en: "Armour", flat: "local_base_physical_damage_reduction_rating", inc: ["local_physical_damage_reduction_rating_+%", "local_armour_and_evasion_+%", "local_armour_and_energy_shield_+%", "local_armour_and_evasion_and_energy_shield_+%"] },
  { key: "evasion", label: "回避力", en: "Evasion Rating", flat: "local_base_evasion_rating", inc: ["local_evasion_rating_+%", "local_armour_and_evasion_+%", "local_evasion_and_energy_shield_+%", "local_armour_and_evasion_and_energy_shield_+%"] },
  { key: "es", label: "エナジーシールド", en: "Energy Shield", flat: "local_energy_shield", inc: ["local_energy_shield_+%", "local_armour_and_energy_shield_+%", "local_evasion_and_energy_shield_+%", "local_armour_and_evasion_and_energy_shield_+%"] },
] as const;
const lohi = (v: number | [number, number]): [number, number] => (Array.isArray(v) ? v : [v, v]);

/** アイテムの上の数値 (素の数値の無いベースは空)。ja = 画面の言語に関係なく日本語 (手順の JSON 用) */
export function propRows(item: StageItem, ja = false): PropRow[] {
  const b = baseStatsOf(item.base);
  if (!b) return [];
  // 英語の画面では英語の札、範囲は 6-9 (2026-10-10 英語版)
  const en = !ja && lang.value === "en";
  const L = (j: string, e: string): string => (en ? e : j);
  const R = (lo: number, hi: number): string => (en ? `${lo}-${hi}` : `${lo}〜${hi}`);
  const s = sums(item);
  const g = (id: string): number => s.get(id) ?? 0;
  const q = 1 + item.quality / 100;
  const rows: PropRow[] = [];
  if (b.phys) {
    const inc = 1 + g("local_physical_damage_+%") / 100;
    const [a, c] = b.phys;
    const lo = Math.round((a + g("local_minimum_added_physical_damage")) * inc * q);
    const hi = Math.round((c + g("local_maximum_added_physical_damage")) * inc * q);
    rows.push({ key: "phys", label: L("物理ダメージ", "Physical Damage"), value: R(lo, hi), up: lo !== a || hi !== c });
  }
  for (const e of ELEMENTS) {
    const lo = g(`local_minimum_added_${e.key}_damage`);
    const hi = g(`local_maximum_added_${e.key}_damage`);
    if (lo || hi) rows.push({ key: e.key, label: L(e.label, e.en), value: R(lo, hi), up: true });
  }
  if (b.crit) {
    const v = b.crit + g("local_critical_strike_chance");
    rows.push({ key: "crit", label: L("クリティカルヒット率", "Critical Hit Chance"), value: `${v.toFixed(2)}%`, up: v !== b.crit });
  }
  if (b.aps) {
    const v = b.aps * (1 + g("local_attack_speed_+%") / 100);
    rows.push({ key: "aps", label: L("アタック/秒", "Attacks per Second"), value: v.toFixed(2), up: Math.abs(v - b.aps) > 1e-9 });
  }
  for (const d of DEF) {
    const base = b[d.key];
    if (base == null) continue;
    const inc = 1 + d.inc.reduce((a, id) => a + g(id), 0) / 100;
    const [a, c] = lohi(base);
    const lo = Math.round((a + g(d.flat)) * inc * q);
    const hi = Math.round((c + g(d.flat)) * inc * q);
    rows.push({ key: d.key, label: L(d.label, d.en), value: lo === hi ? String(lo) : R(lo, hi), up: lo !== a || hi !== c });
  }
  if (b.block) rows.push({ key: "block", label: L("ブロック率", "Block chance"), value: `${Math.round(b.block * (1 + g("local_block_chance_+%") / 100))}%`, up: !!g("local_block_chance_+%") });
  // フラスコ (品質で回復量)
  // 英語はゲーム / poe2db と同じ 1 行 (「Recovers 50 Life over 3 Seconds」、2026-10-10)。見出しは空
  if (en && b.duration && (b.life || b.mana)) {
    const sec = +(b.duration / 10).toFixed(1);
    for (const [k, v, n] of [["life", b.life, "Life"], ["mana", b.mana, "Mana"]] as const) if (v) rows.push({ key: k, label: "", value: `Recovers ${Math.round(v * q)} ${n} over ${sec} Seconds`, up: item.quality > 0 });
    return rows;
  }
  if (b.life) rows.push({ key: "life", label: L("ライフ回復", "Life Recovery"), value: String(Math.round(b.life * q)), up: item.quality > 0 });
  if (b.mana) rows.push({ key: "mana", label: L("マナ回復", "Mana Recovery"), value: String(Math.round(b.mana * q)), up: item.quality > 0 });
  if (b.duration && (b.life || b.mana)) rows.push({ key: "duration", label: L("回復時間", "Duration"), value: L(`${(b.duration / 10).toFixed(1)} 秒`, `${(b.duration / 10).toFixed(1)}s`), up: false });
  return rows;
}

/** 武器・防具の数値 (propRows と同じ式で数字のまま)。DPS = 1 発の平均 × アタック/秒 (2026-10-03、計算機の完成品の数値) */
export interface ItemNumbers {
  physDps: number | null;
  eleDps: number;
  aps: number | null;
  crit: number | null;
  armour: number | null;
  evasion: number | null;
  es: number | null;
}
export function numbersOf(item: StageItem): ItemNumbers | null {
  const b = baseStatsOf(item.base);
  if (!b) return null;
  const s = sums(item);
  const g = (id: string): number => s.get(id) ?? 0;
  const q = 1 + item.quality / 100;
  const aps = b.aps ? b.aps * (1 + g("local_attack_speed_+%") / 100) : null;
  let physDps: number | null = null;
  if (b.phys && aps) {
    const inc = 1 + g("local_physical_damage_+%") / 100;
    const lo = (b.phys[0] + g("local_minimum_added_physical_damage")) * inc * q;
    const hi = (b.phys[1] + g("local_maximum_added_physical_damage")) * inc * q;
    physDps = ((lo + hi) / 2) * aps;
  }
  const eleDps = aps ? ELEMENTS.reduce((a, e) => a + ((g(`local_minimum_added_${e.key}_damage`) + g(`local_maximum_added_${e.key}_damage`)) / 2) * aps, 0) : 0;
  const def = (k: (typeof DEF)[number]): number | null => {
    const base = b[k.key];
    if (base == null) return null;
    const [a, c] = lohi(base);
    return ((a + c) / 2 + g(k.flat)) * (1 + k.inc.reduce((x, id) => x + g(id), 0) / 100) * q;
  };
  return {
    physDps, eleDps, aps, crit: b.crit ? b.crit + g("local_critical_strike_chance") : null,
    armour: def(DEF[0]), evasion: def(DEF[1]), es: def(DEF[2]),
  };
}