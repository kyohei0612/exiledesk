/**
 * クラフト収支: 貼り付けた装備に使えるエッセンスと、その結果 (完成品の mod 構成) を列挙する
 *
 * ゲーム内の効果文 (クライアント CurrencyItems.Description):
 *   Lesser (tier 0)   : ノーマル → マジック + 保証モッド 1
 *   通常 / Greater    : マジック → レア + 保証モッド 1 (既存 mod はそのまま残る = 決定的)
 *   Perfect           : レアからランダムに 1 mod を取り除き、保証モッドを 1 つ追加 (取り除く mod ごとに結果を列挙)
 * 保証モッドの実値はランダム (ティア内でロール) なので、相場検索では最低ロール以上で絞る。
 */

import essencesJson from "../../i18n/essences.json";
import trade2StatMapping from "../../i18n/trade2-stat-mapping.json";
import { allMods, type Mod } from "../../data/mods";
import type { Trade2StatFilter } from "../../services/trade2/query";
import type { ItemMod, ParsedItem } from "./parse";

export interface EssenceTarget {
  category: string;
  itemClasses: string[];
  modId: string | null;
  outcomes?: Array<{ modId: string | null; weight: number }>;
}
export interface EssenceDef {
  id: string;
  nameEn: string;
  nameJa: string;
  tier: number;
  perfect: boolean;
  targets: EssenceTarget[];
}

const ESSENCES = (essencesJson as { essences: EssenceDef[] }).essences;
const MODS_BY_KEY: Map<string, Mod> = new Map(allMods.map((m) => [m.key, m]));
const TRADE2_STAT_MAPPING = trade2StatMapping as Readonly<Record<string, string>>;

/** 完成品の 1 mod (既存 mod または保証モッド) */
export interface OutcomeMod {
  textEn: string;
  textJa: string;
  affix: "prefix" | "suffix" | "unknown";
  groups: string[];
  /** 相場検索の下限に使う値 (既存 = 実値、保証 = 最低ロール) */
  stats: Array<{ id: string; value: number }>;
  /** この mod がエッセンス由来 */
  guaranteed: boolean;
}

export interface Outcome {
  /** Perfect で取り除かれた mod (通常 / Greater は null) */
  removed: ItemMod | null;
  mods: OutcomeMod[];
  /** 結果のレアリティ */
  rarity: "magic" | "rare";
}

export interface EssencePlan {
  essence: EssenceDef;
  guaranteed: OutcomeMod;
  outcomes: Outcome[];
  /** 使えない理由 (null なら使える) */
  blocked: string | null;
}

const stripLinks = (s: string) => s.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");

/**
 * 保証モッドの最低ロール。stats[].min はクライアント内部値で、クリティカル率や吸収 (permyriad) は
 * 表示値の 100 倍 / 10000 倍で入っている (例 local_critical_strike_chance: 表示 2.11% ↔ 内部 211)。
 * trade2 は表示値で受けるので、テンプレの範囲下限と内部値の比が 10 の冪なら表示値を採用する。
 * (2026-09-08: 探求のエッセンスで 211 以上を投げて 0 件になっていた)
 */
function displayMins(textEn: string): number[] {
  const out: number[] = [];
  const re = /\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(textEn))) out.push(Number(m[1]));
  return out;
}
function statMinForTrade(min: number, display: number | undefined): number {
  if (display === undefined || display === 0 || min === display) return min;
  const ratio = min / display;
  for (const p of [10, 100, 1000, 10000]) if (Math.abs(ratio - p) < 1e-6) return display;
  return min;
}

/** bundle の mod → 保証モッド (最低ロール表記) */
function guaranteedFromMod(m: Mod): OutcomeMod {
  const mins = displayMins(m.text_en);
  return {
    textEn: stripLinks(m.text_en),
    textJa: stripLinks(m.text_ja || m.text_en),
    affix: m.type === "prefix" || m.type === "suffix" ? m.type : "unknown",
    groups: m.groups ?? [],
    stats: (m.stats ?? []).map((s, i) => ({ id: s.id, value: statMinForTrade(s.min ?? 0, mins[i]) })),
    guaranteed: true,
  };
}

function fromItemMod(m: ItemMod): OutcomeMod {
  return { textEn: m.textEn, textJa: m.textJa, affix: m.affix, groups: m.groups, stats: m.stats, guaranteed: false };
}

function countAffix(mods: OutcomeMod[], affix: "prefix" | "suffix"): number {
  return mods.filter((m) => m.affix === affix).length;
}

function conflicts(mods: OutcomeMod[], g: OutcomeMod): boolean {
  return mods.some((m) => m.groups.some((x) => g.groups.includes(x)));
}

/** 装備 (ノーマル / マジック / レア) に対して使えるエッセンスと結果を列挙する */
export function planEssences(item: ParsedItem): EssencePlan[] {
  if (!item.itemClass) return [];
  const identified = item.mods.filter((m): m is ItemMod => m.identified);
  const plans: EssencePlan[] = [];

  for (const e of ESSENCES) {
    const target = e.targets.find((t) => t.itemClasses.includes(item.itemClass as string));
    if (!target) continue;
    // 保証モッドが複数候補からランダムなもの (属性系 / Greater 戦闘 等) は先頭候補で表示し、blocked にする
    const modId = target.modId ?? target.outcomes?.[0]?.modId ?? null;
    if (!modId) continue;
    const mod = MODS_BY_KEY.get(modId);
    if (!mod) continue;
    const guaranteed = guaranteedFromMod(mod);
    // 効果文どおり: Perfect エッセンスと 0.3 の「合金 (Alloy)」はレアから 1 mod 除去 + 保証モッド、
    // それ以外 (Lesser / 通常 / Greater) はマジック → レア + 保証モッド
    const removeAndAdd = e.perfect || /Alloy$/.test(e.nameEn);
    const usable = removeAndAdd ? item.rarity === "rare" : item.rarity === "magic";
    if (!usable) continue;

    const base = identified.map(fromItemMod);
    let blocked: string | null = null;
    if (item.mods.some((m) => !m.identified)) blocked = "同定できない mod があるため結果を確定できません";
    if (target.outcomes && target.outcomes.length > 1) blocked = "保証モッドが複数候補からランダム (未対応)";

    const outcomes: Outcome[] = [];
    if (removeAndAdd) {
      for (const removed of identified) {
        const rest = base.filter((m) => m !== undefined && m.textEn !== removed.textEn);
        if (conflicts(rest, guaranteed)) continue;
        if (guaranteed.affix !== "unknown" && countAffix(rest, guaranteed.affix) >= 3) continue;
        outcomes.push({ removed, mods: [...rest, guaranteed], rarity: "rare" });
      }
      if (outcomes.length === 0 && !blocked) blocked = "どの mod を外しても保証モッドが入りません (同系統 / 枠なし)";
    } else {
      if (conflicts(base, guaranteed)) blocked = blocked ?? "同系統の mod が既に付いています";
      else outcomes.push({ removed: null, mods: [...base, guaranteed], rarity: "rare" });
    }
    plans.push({ essence: e, guaranteed, outcomes, blocked });
  }
  return plans;
}

/**
 * 完成品の mod 構成 → trade2 の stat filter。GGG stat ID → trade2 ID に変換し、
 * 同じ trade2 ID に複数値が乗る ("Adds X to Y" の min/max) ときは平均を下限にする。
 * 変換できない stat は missing に入れる (検索からは外す)。
 */
export function statFiltersForOutcome(mods: OutcomeMod[]): { filters: Trade2StatFilter[]; missing: string[] } {
  const byTrade = new Map<string, number[]>();
  const missing: string[] = [];
  for (const m of mods) {
    let hit = false;
    for (const s of m.stats) {
      const tid = TRADE2_STAT_MAPPING[s.id];
      if (!tid) continue;
      hit = true;
      if (!byTrade.has(tid)) byTrade.set(tid, []);
      byTrade.get(tid)!.push(s.value);
    }
    if (!hit) missing.push(m.textJa || m.textEn);
  }
  const filters: Trade2StatFilter[] = [];
  for (const [id, values] of byTrade) {
    const min = values.reduce((a, b) => a + b, 0) / values.length;
    filters.push({ id, disabled: false, value: { min: Math.floor(min * 100) / 100 } });
  }
  return { filters, missing };
}
