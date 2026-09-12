/**
 * カウンタ → AggregatedAscendancy (UI 公開形式)、および progress / キャッシュからの集計入口
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 */

import { jaAscendancy, ascendancyIcon } from "../../i18n/ascendancies-ja";
import { jaCurrency } from "../../i18n/currencies-ja";
import { jaSkill } from "../../i18n/skills-ja";
import gemsClientRaw from "../../i18n/gems-client.json";

/** 英名 → ジェム情報 (スピリット / メタ判定)。gems-client.json (GGG クライアント由来) */
const GEM_INFO: Map<string, { spirit: boolean; meta: boolean }> = (() => {
  const m = new Map<string, { spirit: boolean; meta: boolean }>();
  for (const g of gemsClientRaw as { en: string; kind: string; spirit: boolean }[]) m.set(g.en, { spirit: !!g.spirit, meta: g.kind === "meta" });
  return m;
})();
const isMetaGem = (nameEn: string): boolean => GEM_INFO.get(nameEn)?.meta === true;
import type {
  AffixKind,
  AggregatedAscendancy,
  BaseEntry,
  CachedAscendancy,
  CachedCharacter,
  CharacterItems,
  CraftV2Cache,
  CraftV2Progress,
  ModEntry,
  ModTierRow,
  SlotKey,
  SlotMods,
  SkillUsage,
  UniqueUsage,
} from "./types";
import {
  emptyAscendancyCounter,
  ingestCharacterItems,
  type AggregatedModBucket,
  type AscendancyCounter,
  type BaseBucket,
  type SlotCounter,
  type UniqueBucket,
} from "./ingest";
import { countPlaceholders, fillTemplate, stripRichTextMarkers } from "../mods/normalize";
import { displayUniqueNameJa, lookupGroups, lookupModTextJa } from "../mods/dictionaries";
import { tiersForTemplate } from "../mods/tiers";
import { tagSetsForSlotWithClasses } from "../mods/item-class-tags";
import { baseClassOf } from "../trade2/category";

// ============================================================================
// MOD バケット → ModEntry
// ============================================================================

const meanOf = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/**
 * 値 → ティア (1-based)。範囲内ならそのティア、範囲の隙間に落ちたら「下限 ≤ 値」の一番上のティア
 * (tiers は下限降順)。全ティアの下限より小さければ最下位、最上位の上限より大きければ T1。
 * (2026-09-08: 旧実装は隙間の値を全部最下位にしていた。例: 火ダメージ追加の平均 31 が T1 下限 31.0 をわずかに下回り T9)
 */
function tierIndexOfValue(tiers: ModEntry["tiers"], v: number): number {
  for (let i = 0; i < tiers.length; i++) {
    if (v >= tiers[i].min && v <= tiers[i].max) return i;
  }
  for (let i = 0; i < tiers.length; i++) {
    if (v >= tiers[i].min) return i;
  }
  return tiers.length - 1;
}

/** 平均値から推定 tier (1-based)。単一プレースホルダ、または複数値の平均で使う。 */
function inferTierFromAverage(tiers: ModEntry["tiers"], av: number): number {
  return tierIndexOfValue(tiers, av) + 1;
}

/**
 * 使用率どおりのティア (最頻ティア)。各 occurrence の値を tier 帯にビニングして
 * 件数最多の帯を選ぶ。平均ベースと違い外れ値に強い。trade2 のデフォルトティアに使う。
 */
export function usageTierFromValues(tiers: ModEntry["tiers"], flatValues: number[]): number | undefined {
  const tierCounts = new Array<number>(tiers.length).fill(0);
  for (const v of flatValues) {
    if (!Number.isFinite(v)) continue;
    tierCounts[tierIndexOfValue(tiers, v)] += 1;
  }
  let bestIdx = -1;
  let bestCnt = -1;
  for (let i = 0; i < tierCounts.length; i++) {
    if (tierCounts[i] > bestCnt) {
      bestCnt = tierCounts[i];
      bestIdx = i;
    }
  }
  return bestIdx >= 0 && bestCnt > 0 ? bestIdx + 1 : undefined;
}

function finalizeBuckets(buckets: Map<string, AggregatedModBucket>, affix: AffixKind, tagSets: string[][] | null): ModEntry[] {
  const entries: ModEntry[] = [];
  for (const bucket of buckets.values()) {
    // 各 # 位置ごとの平均値
    const placeholderCount = countPlaceholders(bucket.template);
    const avgPerPos: number[] = new Array(placeholderCount).fill(0);
    const cntPerPos: number[] = new Array(placeholderCount).fill(0);
    const flatValues: number[] = [];
    for (const arr of bucket.values) {
      for (let i = 0; i < placeholderCount; i++) {
        if (i < arr.length && Number.isFinite(arr[i])) {
          avgPerPos[i] += arr[i];
          cntPerPos[i] += 1;
          flatValues.push(arr[i]);
        }
      }
    }
    const avgValues = avgPerPos.map((sum, i) => (cntPerPos[i] > 0 ? sum / cntPerPos[i] : NaN));

    // 日本語テンプレート選択の優先順:
    //   1. bucket.textJaTemplate (= bundle text_ja 由来)
    //   2. mod-text-ja(.manual) を正規化キー突合で引く。ただし `#` の個数が英語テンプレと
    //      一致するものだけ (値をリテラルで焼き込んだエントリで数値がズレるのを防ぐ)
    //   3. 英語テンプレート
    let tpl = bucket.textJaTemplate;
    if (tpl == null) {
      const jaFallback = lookupModTextJa(bucket.template);
      tpl =
        jaFallback != null && countPlaceholders(jaFallback) === placeholderCount
          ? jaFallback
          : bucket.template;
    }
    const text = stripRichTextMarkers(fillTemplate(tpl, avgValues));
    const tiers = tiersForTemplate(bucket.template, tagSets);
    const groupIds = lookupGroups(bucket.template);

    // ティア判定: 単一値はそのまま、複数値 ("Adds # to #") は各 occurrence の平均値を
    // ティア側も (mins の平均 .. maxs の平均) に潰して比較する (2026-09-08)
    const placeholderIsSingle = placeholderCount === 1;
    const tiersForJudge: ModTierRow[] = placeholderIsSingle
      ? tiers
      : tiers.map((t) => ({ ...t, min: meanOf(t.mins), max: meanOf(t.maxs) }));
    const judgeValues: number[] = placeholderIsSingle
      ? flatValues
      : bucket.values.filter((arr) => arr.length >= placeholderCount).map((arr) => meanOf(arr.slice(0, placeholderCount)));
    const judgeAvg = placeholderIsSingle ? avgValues[0] : meanOf(avgValues.filter(Number.isFinite));
    let inferredTier: number | undefined = undefined;
    if (tiersForJudge.length > 0 && Number.isFinite(judgeAvg)) {
      inferredTier = inferTierFromAverage(tiersForJudge, judgeAvg);
    }
    let usageTier: number | undefined = undefined;
    if (tiersForJudge.length > 0 && judgeValues.length > 0) {
      usageTier = usageTierFromValues(tiersForJudge, judgeValues);
    }

    entries.push({
      text,
      affix,
      count: bucket.count,
      rawTemplate: bucket.template,
      values: flatValues,
      tiers,
      groupIds,
      inferredTier,
      usageTier,
    });
  }
  entries.sort((a, b) => b.count - a.count);
  return entries;
}

function finalizeBases(buckets: Map<string, BaseBucket>): BaseEntry[] {
  const list: BaseEntry[] = [];
  for (const b of buckets.values()) {
    const skills = [...b.skills.values()]
      .map((s) => ({
        name: jaSkill(s.nameEn),
        nameEn: s.nameEn,
        levelMin: s.levelMin,
        levelMax: s.levelMax,
        count: s.count,
        gems: [...s.gems.entries()]
          .map(([nameEn, count]) => ({ name: jaSkill(nameEn), nameEn, count }))
          .sort((x, y) => y.count - x.count),
      }))
      .sort((x, y) => y.count - x.count);
    list.push({ name: jaCurrency(b.nameEn), nameEn: b.nameEn, count: b.count, skills });
  }
  list.sort((a, b) => b.count - a.count);
  return list;
}

/**
 * スロットの MOD 一覧を確定する。ティア表は「そのスロットで実際に使われていたベースの種別」の spawn タグで絞る
 * (武器スロットなら弓 / 杖 / メイス … の和集合)。ベースが取れていない古いキャッシュはスロット既定タグ。
 */
function finalizeSlot(slot: SlotCounter, slotKey: SlotKey): SlotMods {
  const classes = [...slot.bases.values()].map((b) => baseClassOf(b.nameEn)?.cls).filter((c): c is string => !!c);
  const tagSets = tagSetsForSlotWithClasses(slotKey, classes);
  return {
    prefix: finalizeBuckets(slot.prefix, "P", tagSets),
    suffix: finalizeBuckets(slot.suffix, "S", tagSets),
    bases: finalizeBases(slot.bases),
  };
}

function finalizeUniques(buckets: Map<string, UniqueBucket>, sampleSize: number): UniqueUsage[] {
  const list: UniqueUsage[] = [];
  for (const b of buckets.values()) {
    list.push({
      name: displayUniqueNameJa(b.representative?.name, b.nameEn),
      nameEn: b.nameEn,
      count: b.count,
      percentage: sampleSize > 0 ? b.count / sampleSize : 0,
      icon: b.icon,
      representative: b.representative,
    });
  }
  list.sort((a, b) => b.count - a.count);
  return list;
}

function finalizeSkills(buckets: Map<string, import("./ingest").SkillBucket2>, sampleSize: number): SkillUsage[] {
  const list: SkillUsage[] = [];
  for (const b of buckets.values()) {
    const info = GEM_INFO.get(b.nameEn);
    list.push({
      name: jaSkill(b.nameEn),
      nameEn: b.nameEn,
      spirit: info?.spirit ?? false,
      meta: info?.meta ?? false,
      count: b.count,
      percentage: sampleSize > 0 ? b.count / sampleSize : 0,
      mainCount: b.mainCount,
      supports: [...b.supports.entries()]
        .map(([nameEn, count]) => ({ name: jaSkill(nameEn), nameEn, count }))
        .sort((x, y) => y.count - x.count),
    });
  }
  list.sort((a, b) => b.count - a.count || b.mainCount - a.mainCount);
  return list;
}

function finalizeAscendancy(
  classEn: string,
  usagePercent: number,
  sampleSize: number,
  counter: AscendancyCounter,
  error?: string,
  fetchProgress?: { done: number; total: number },
): AggregatedAscendancy {
  const uniquesBySlot: { [K in SlotKey]: UniqueUsage[] } = {
    ring: finalizeUniques(counter.uniquesBySlot.ring, sampleSize),
    amulet: finalizeUniques(counter.uniquesBySlot.amulet, sampleSize),
    weapon: finalizeUniques(counter.uniquesBySlot.weapon, sampleSize),
    weapon2: finalizeUniques(counter.uniquesBySlot.weapon2, sampleSize),
    helm: finalizeUniques(counter.uniquesBySlot.helm, sampleSize),
    gloves: finalizeUniques(counter.uniquesBySlot.gloves, sampleSize),
    body: finalizeUniques(counter.uniquesBySlot.body, sampleSize),
    boots: finalizeUniques(counter.uniquesBySlot.boots, sampleSize),
  };
  return {
    id: classEn.toLowerCase().replace(/\s+/g, "-"),
    classEn,
    name: jaAscendancy(classEn),
    usagePercent,
    sampleSize,
    icon: ascendancyIcon(classEn),
    ring: finalizeSlot(counter.slots.ring, "ring"),
    amulet: finalizeSlot(counter.slots.amulet, "amulet"),
    weapon: finalizeSlot(counter.slots.weapon, "weapon"),
    weapon2: finalizeSlot(counter.slots.weapon2, "weapon2"),
    helm: finalizeSlot(counter.slots.helm, "helm"),
    gloves: finalizeSlot(counter.slots.gloves, "gloves"),
    body: finalizeSlot(counter.slots.body, "body"),
    boots: finalizeSlot(counter.slots.boots, "boots"),
    uniques: finalizeUniques(counter.uniques, sampleSize),
    uniquesBySlot,
    skills: finalizeSkills(counter.skills, sampleSize),
    error,
    fetchProgress,
  };
}

// ============================================================================
// 集計の入口: progress payload / ディスクキャッシュ
// ============================================================================

/** Rust から届いた 1 アセンダンシー分の progress payload を集計して返す。 */
export function aggregateFromProgress(payload: CraftV2Progress): AggregatedAscendancy {
  const counter = emptyAscendancyCounter();
  for (const ci of payload.items) {
    ingestCharacterItems(counter, ci, isMetaGem);
  }
  return finalizeAscendancy(payload.ascendancy, payload.percentage, payload.characters_done, counter, undefined, {
    done: payload.characters_done,
    total: payload.characters_total,
  });
}

/**
 * 縮小形式の `CachedCharacter` を `ingestCharacterItems` が読める wrapper 形式に復元する。
 * rare_items は「レアのみ」を格納するスキーマなので frameType=2 固定、unique_items は 3。
 */
function cachedCharacterToCharacterItems(c: CachedCharacter): CharacterItems {
  const items: unknown[] = [];
  for (const r of c.rare_items) {
    items.push({
      itemSlot: r.inventory_id,
      itemData: {
        frameType: 2,
        inventoryId: r.inventory_id,
        explicitMods: r.explicit_mods,
        baseType: r.base_type,
        extended: { subcategories: r.subcategories ?? [] },
        // 2026-09-12: 付与スキル / 装着ジェムを poe.ninja の形に戻す (Rust 側 cache_convert と同じ形)
        grantedSkills: (r.granted_skills ?? []).map((s) => ({ name: "Grants Skill", values: [[s, 25]] })),
        socketedItems: [{ socketedItems: (r.socketed_gems ?? []).map((g) => ({ typeLine: g })) }],
      },
    });
  }
  for (const u of c.unique_items) {
    items.push({
      itemSlot: u.inventory_id,
      itemData: {
        frameType: 3,
        inventoryId: u.inventory_id,
        typeLine: u.type_line,
        baseType: u.base_type,
        name: u.name,
        icon: u.icon,
        implicitMods: u.implicit_mods,
        explicitMods: u.explicit_mods,
        flavourText: u.flavour_text as string | string[] | undefined,
        requirements: Array.isArray(u.requirements) ? u.requirements : undefined,
        properties: Array.isArray(u.properties) ? u.properties : undefined,
        ilvl: u.item_level,
        level: u.level,
        extended: { subcategories: u.subcategories ?? [] },
      },
    });
  }
  const skills: unknown[] = (c.skills ?? []).map((g) => ({
    allGems: [
      ...g.mains.map((n) => ({ name: n, itemData: { support: false } })),
      ...g.supports.map((n) => ({ name: n, itemData: { support: true } })),
    ],
    dps: [{ dps: g.dps }],
  }));
  return { account: c.account, name: c.name, items, skills };
}

/**
 * 1 アセンダンシー分のキャッシュから AggregatedAscendancy を再構築する。
 * fetchProgress は `{ done: 0, total: 件数 }` を仮入れし、差分 progress が届いた時点で置換される
 * (キャッシュ表示中に進捗バーが 100% に張り付くのを防ぐ)。
 */
function aggregateFromCachedAscendancy(cached: CachedAscendancy): AggregatedAscendancy {
  const counter = emptyAscendancyCounter();
  for (const c of cached.characters) {
    ingestCharacterItems(counter, cachedCharacterToCharacterItems(c), isMetaGem);
  }
  const cachedCount = cached.characters.length;
  return finalizeAscendancy(cached.class, cached.percentage, cachedCount, counter, undefined, {
    done: 0,
    total: cachedCount > 0 ? cachedCount : 1,
  });
}

/** キャッシュ全体から AggregatedAscendancy[] を構築 (使用率降順)。 */
export function aggregateFromCache(cache: CraftV2Cache): AggregatedAscendancy[] {
  const out = cache.ascendancies.map((a) => aggregateFromCachedAscendancy(a));
  out.sort((a, b) => b.usagePercent - a.usagePercent);
  return out;
}
