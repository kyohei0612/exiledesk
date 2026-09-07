/**
 * クラフト収支: 上位プレイヤー基準 (2026-09-08)
 *
 * 発見 V2 のディスクキャッシュ (poe.ninja 上位キャラのレア装備) から、貼り付けた装備と同じ種別の
 * レアだけを集めて「上位が実際に付けている mod の採用率 / 最頻ティア」を出す。
 *   - buildTopProfile : キャッシュ + 装備種別 (+ アセンダンシー) → 採用率プロファイル
 *   - diagnoseItem    : 貼り付け装備の各 mod が上位でどれだけ使われているか / 足りない主流 mod
 *   - guaranteedPct   : エッセンス結果の保証モッドの上位採用率 (候補の並べ替えに使う)
 *   - targetMods      : 上位の典型構成 (採用率上位の prefix 3 + suffix 3) → trade2 検索用
 * 純関数のみ。ネットワーク / 状態は useTopProfile.ts。
 */

import type { CachedRareItem, CraftV2Cache, ModEntry, ModTierRow } from "../../services/craft-v2/types";
import { usageTierFromValues } from "../../services/craft-v2/finalize";
import { baseClassOf } from "../../services/trade2/category";
import { extractNumbers, normalizeModTemplate, normalizeModTextKey, stripRichTextMarkers } from "../../services/mods/normalize";
import { heuristicAffix, lookupGroups, lookupModTextJa, lookupTiers, modBundleIndex } from "../../services/mods/dictionaries";
import { getModStatIds } from "../../data/mod-translations";
import trade2StatMapping from "../../i18n/trade2-stat-mapping.json";
import type { Trade2StatFilter } from "../../services/trade2/query";
import type { OutcomeMod } from "./essence-plan";
import type { ItemMod, ParsedItem } from "./parse";

const TRADE2_STAT_MAPPING = trade2StatMapping as Readonly<Record<string, string>>;

/**
 * ティア表 (mod-tier-and-group.json) はクライアント内部値で、クリティカル率 (×100) や吸収 (×10000) は
 * 表示値と桁が違う。表示値の中央値がどの倍率でティア範囲に収まるかで倍率を決める。
 */
function tierScale(tiers: ModTierRow[], values: number[]): number {
  if (!tiers.length || !values.length) return 1;
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const lo = tiers[tiers.length - 1].min;
  const hi = tiers[0].max;
  for (const s of [1, 100, 10000]) if (median * s >= lo / 2 && median * s <= hi * 2) return s;
  return 1;
}

export interface TopProfileMod {
  /** normalizeModTextKey (マーカー除去 + 小文字) で同一視するキー */
  key: string;
  /** 英語テンプレ (`#` プレースホルダ、poe.ninja 表記のまま) */
  template: string;
  textJa: string;
  affix: "P" | "S";
  /** この mod を付けていた装備数 */
  count: number;
  /** count / sampleItems */
  pct: number;
  usageTier?: number;
  tiers: ModTierRow[];
  /** 表示値 × scale = ティア表の内部値 (1 / 100 / 10000) */
  scale: number;
  groups: string[];
}

export interface TopProfile {
  /** 英語アセンダンシー名。全体なら null */
  classEn: string | null;
  itemClass: string;
  sampleItems: number;
  mods: TopProfileMod[];
}

/** 「主流」とみなす採用率の下限 */
export const MAINSTREAM_PCT = 0.2;

function itemsOfClass(cache: CraftV2Cache, itemClass: string, classEn: string | null): CachedRareItem[] {
  const out: CachedRareItem[] = [];
  for (const asc of cache.ascendancies) {
    if (classEn && asc.class !== classEn) continue;
    for (const ch of asc.characters) {
      for (const it of ch.rare_items) {
        if (!it.base_type) continue;
        if (baseClassOf(it.base_type)?.cls !== itemClass) continue;
        out.push(it);
      }
    }
  }
  return out;
}

/** キャッシュ内で、この装備種別のレアを何本持つかをアセンダンシー別に数える (セレクタ用) */
export function countItemsByAscendancy(cache: CraftV2Cache, itemClass: string): Array<{ classEn: string; count: number }> {
  return cache.ascendancies
    .map((a) => ({ classEn: a.class, count: itemsOfClass({ ...cache, ascendancies: [a] }, itemClass, null).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function buildTopProfile(cache: CraftV2Cache, itemClass: string, classEn: string | null): TopProfile {
  const items = itemsOfClass(cache, itemClass, classEn);
  interface Bucket {
    template: string;
    count: number;
    values: number[];
  }
  const buckets = new Map<string, Bucket>();
  for (const it of items) {
    const seen = new Set<string>();
    for (const line of it.explicit_mods) {
      const key = normalizeModTextKey(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let b = buckets.get(key);
      if (!b) {
        b = { template: normalizeModTemplate(line), count: 0, values: [] };
        buckets.set(key, b);
      }
      b.count += 1;
      const nums = extractNumbers(line);
      if (nums.length) b.values.push(nums[0]);
    }
  }
  const mods: TopProfileMod[] = [];
  for (const [key, b] of buckets) {
    const idx = modBundleIndex.get(b.template);
    const tiers = lookupTiers(b.template);
    const scale = tierScale(tiers, b.values);
    const jaTpl = idx?.textJaTemplate ?? lookupModTextJa(b.template) ?? null;
    mods.push({
      key,
      template: b.template,
      textJa: stripRichTextMarkers(jaTpl ?? b.template),
      affix: idx ? idx.affix : heuristicAffix(b.template),
      count: b.count,
      pct: items.length ? b.count / items.length : 0,
      usageTier: tiers.length ? usageTierFromValues(tiers, b.values.map((v) => v * scale)) : undefined,
      tiers,
      scale,
      groups: lookupGroups(b.template),
    });
  }
  mods.sort((a, b) => b.count - a.count);
  return { classEn, itemClass, sampleItems: items.length, mods };
}

// ─── 貼り付け装備の診断 ─────────────────────────────────

export interface ModDiagnosis {
  textJa: string;
  affix: ItemMod["affix"];
  /** 上位採用率 (0 なら上位は使っていない) */
  pct: number;
  usageTier?: number;
  myTier?: number;
}

export interface ItemDiagnosis {
  present: ModDiagnosis[];
  /** 主流 (MAINSTREAM_PCT 以上) なのに付いていない mod。同系統が既にある mod は除く */
  missing: TopProfileMod[];
}

function tierOfValue(tiers: ModTierRow[], v: number): number | undefined {
  if (!tiers.length || !Number.isFinite(v)) return undefined;
  for (let i = 0; i < tiers.length; i++) if (v >= tiers[i].min && v <= tiers[i].max) return i + 1;
  return v > tiers[0].max ? 1 : tiers.length;
}

export function findProfileMod(profile: TopProfile, textEn: string): TopProfileMod | undefined {
  const key = normalizeModTextKey(textEn);
  return profile.mods.find((m) => m.key === key);
}

export function diagnoseItem(profile: TopProfile, item: ParsedItem): ItemDiagnosis {
  const identified = item.mods.filter((m): m is ItemMod => m.identified);
  const present: ModDiagnosis[] = identified.map((m) => {
    const p = findProfileMod(profile, m.textEn);
    const tiers = p?.tiers ?? lookupTiers(normalizeModTemplate(m.textEn));
    const v = extractNumbers(m.textEn)[0];
    const scale = p?.scale ?? tierScale(tiers, v === undefined ? [] : [v]);
    return { textJa: m.textJa, affix: m.affix, pct: p?.pct ?? 0, usageTier: p?.usageTier, myTier: v === undefined ? undefined : tierOfValue(tiers, v * scale) };
  });
  const haveKeys = new Set(identified.map((m) => normalizeModTextKey(m.textEn)));
  const haveGroups = new Set(identified.flatMap((m) => m.groups));
  const missing = profile.mods.filter(
    (m) => m.pct >= MAINSTREAM_PCT && !haveKeys.has(m.key) && !m.groups.some((g) => haveGroups.has(g)),
  );
  return { present, missing };
}

// ─── エッセンス結果の採点 ─────────────────────────────────

/** 保証モッドの上位採用率 (プロファイル外なら 0) */
export function guaranteedPct(profile: TopProfile, mods: OutcomeMod[]): number {
  const g = mods.find((m) => m.guaranteed);
  if (!g) return 0;
  return findProfileMod(profile, g.textEn)?.pct ?? 0;
}

/** 結果の mod のうち主流 mod の本数 */
export function mainstreamCount(profile: TopProfile, mods: OutcomeMod[]): number {
  return mods.filter((m) => (findProfileMod(profile, m.textEn)?.pct ?? 0) >= MAINSTREAM_PCT).length;
}

// ─── 典型構成 (trade2 検索用) ─────────────────────────────────

export interface TargetMods {
  mods: ModEntry[];
  /** rawTemplate → 最頻ティアの下限値 (表示値) */
  tierMinByMod: Record<string, number>;
  filters: Trade2StatFilter[];
  /** trade2 stat に落とせなかった mod */
  missing: string[];
}

/**
 * 採用率上位の prefix 3 + suffix 3 (主流のみ)。ティアは最頻ティアの下限。
 * trade2 stat は、装備 (武器 / 防具) なので同文のグローバル版ではなく `local_*` 版を優先する
 * (命中力 / アタックスピード / 回避 / アーマー は別 stat)。
 */
export function targetMods(profile: TopProfile): TargetMods {
  const pick = (affix: "P" | "S") => profile.mods.filter((m) => m.affix === affix && m.pct >= MAINSTREAM_PCT).slice(0, 3);
  const chosen = [...pick("P"), ...pick("S")];
  const tierMinByMod: Record<string, number> = {};
  const filters: Trade2StatFilter[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  const mods: ModEntry[] = chosen.map((m) => {
    const row = m.usageTier ? m.tiers[m.usageTier - 1] : undefined;
    const min = row ? row.min / m.scale : undefined;
    if (min !== undefined) tierMinByMod[m.template] = min;
    const tradeIds = getModStatIds(m.template)
      .map((id) => TRADE2_STAT_MAPPING[`local_${id}`] ?? TRADE2_STAT_MAPPING[id])
      .filter((id): id is string => !!id);
    if (tradeIds.length === 0) missing.push(m.textJa);
    for (const id of tradeIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      filters.push(min !== undefined ? { id, disabled: false, value: { min } } : { id, disabled: false });
    }
    return {
      text: m.textJa,
      affix: m.affix,
      count: m.count,
      rawTemplate: m.template,
      values: [],
      tiers: m.tiers,
      groupIds: m.groups,
      usageTier: m.usageTier,
    };
  });
  return { mods, tierMinByMod, filters, missing };
}
