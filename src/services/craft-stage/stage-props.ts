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
import type { StageItem } from "./types";

export interface PropRow { key: string; label: string; value: string; up: boolean }

/** アイテムに付いている stat の合計 (MOD とルーン) */
function sums(item: StageItem): Map<string, number> {
  const m = new Map<string, number>();
  const add = (id: string, v: number) => m.set(id, (m.get(id) ?? 0) + v);
  if (item.identified !== false) for (const md of [...item.prefixes, ...item.suffixes]) (md.stats ?? []).forEach((id, i) => add(id, md.values[i] ?? 0));
  for (const a of item.augments ?? []) for (const s of a.stats) add(s.id, s.value);
  return m;
}
const ELEMENTS = [
  { key: "fire", label: "火ダメージ" },
  { key: "cold", label: "冷気ダメージ" },
  { key: "lightning", label: "雷ダメージ" },
  { key: "chaos", label: "混沌ダメージ" },
] as const;
const DEF = [
  { key: "armour", label: "アーマー", flat: "local_base_physical_damage_reduction_rating", inc: ["local_physical_damage_reduction_rating_+%", "local_armour_and_evasion_+%", "local_armour_and_energy_shield_+%", "local_armour_and_evasion_and_energy_shield_+%"] },
  { key: "evasion", label: "回避力", flat: "local_base_evasion_rating", inc: ["local_evasion_rating_+%", "local_armour_and_evasion_+%", "local_evasion_and_energy_shield_+%", "local_armour_and_evasion_and_energy_shield_+%"] },
  { key: "es", label: "エナジーシールド", flat: "local_energy_shield", inc: ["local_energy_shield_+%", "local_armour_and_energy_shield_+%", "local_evasion_and_energy_shield_+%", "local_armour_and_evasion_and_energy_shield_+%"] },
] as const;
const lohi = (v: number | [number, number]): [number, number] => (Array.isArray(v) ? v : [v, v]);

/** アイテムの上の数値 (素の数値の無いベースは空) */
export function propRows(item: StageItem): PropRow[] {
  const b = baseStatsOf(item.base);
  if (!b) return [];
  const s = sums(item);
  const g = (id: string): number => s.get(id) ?? 0;
  const q = 1 + item.quality / 100;
  const rows: PropRow[] = [];
  if (b.phys) {
    const inc = 1 + g("local_physical_damage_+%") / 100;
    const [a, c] = b.phys;
    const lo = Math.round((a + g("local_minimum_added_physical_damage")) * inc * q);
    const hi = Math.round((c + g("local_maximum_added_physical_damage")) * inc * q);
    rows.push({ key: "phys", label: "物理ダメージ", value: `${lo}〜${hi}`, up: lo !== a || hi !== c });
  }
  for (const e of ELEMENTS) {
    const lo = g(`local_minimum_added_${e.key}_damage`);
    const hi = g(`local_maximum_added_${e.key}_damage`);
    if (lo || hi) rows.push({ key: e.key, label: e.label, value: `${lo}〜${hi}`, up: true });
  }
  if (b.crit) {
    const v = b.crit + g("local_critical_strike_chance");
    rows.push({ key: "crit", label: "クリティカルヒット率", value: `${v.toFixed(2)}%`, up: v !== b.crit });
  }
  if (b.aps) {
    const v = b.aps * (1 + g("local_attack_speed_+%") / 100);
    rows.push({ key: "aps", label: "アタック/秒", value: v.toFixed(2), up: Math.abs(v - b.aps) > 1e-9 });
  }
  for (const d of DEF) {
    const base = b[d.key];
    if (base == null) continue;
    const inc = 1 + d.inc.reduce((a, id) => a + g(id), 0) / 100;
    const [a, c] = lohi(base);
    const lo = Math.round((a + g(d.flat)) * inc * q);
    const hi = Math.round((c + g(d.flat)) * inc * q);
    rows.push({ key: d.key, label: d.label, value: lo === hi ? String(lo) : `${lo}〜${hi}`, up: lo !== a || hi !== c });
  }
  if (b.block) rows.push({ key: "block", label: "ブロック率", value: `${Math.round(b.block * (1 + g("local_block_chance_+%") / 100))}%`, up: !!g("local_block_chance_+%") });
  // フラスコ (品質で回復量)
  if (b.life) rows.push({ key: "life", label: "ライフ回復", value: String(Math.round(b.life * q)), up: item.quality > 0 });
  if (b.mana) rows.push({ key: "mana", label: "マナ回復", value: String(Math.round(b.mana * q)), up: item.quality > 0 });
  if (b.duration && (b.life || b.mana)) rows.push({ key: "duration", label: "回復時間", value: `${(b.duration / 10).toFixed(1)} 秒`, up: false });
  return rows;
}
