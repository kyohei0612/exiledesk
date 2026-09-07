/**
 * カウンタ → AggregatedAscendancy (UI 公開形式)、および progress / キャッシュからの集計入口
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 */

import { jaAscendancy, ascendancyIcon } from "../../i18n/ascendancies-ja";
import { jaCurrency } from "../../i18n/currencies-ja";
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
  SlotKey,
  SlotMods,
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
import { displayUniqueNameJa, lookupGroups, lookupModTextJa, lookupTiers } from "../mods/dictionaries";

// ============================================================================
// MOD バケット → ModEntry
// ============================================================================

/**
 * 平均値から推定 tier (avg がどの tier の min-max 範囲に入るか)。
 * 単一プレースホルダの MOD のみ計算可能。範囲外 (最大 max 超え) は T1。
 */
function inferTierFromAverage(tiers: ModEntry["tiers"], av: number): number {
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (av >= t.min && av <= t.max) return i + 1;
  }
  const topMax = tiers[0].max;
  return Number.isFinite(topMax) && av > topMax ? 1 : tiers.length;
}

/**
 * 使用率どおりのティア (最頻ティア)。各 occurrence の値を tier 帯にビニングして
 * 件数最多の帯を選ぶ。平均ベースと違い外れ値に強い。trade2 のデフォルトティアに使う。
 */
export function usageTierFromValues(tiers: ModEntry["tiers"], flatValues: number[]): number | undefined {
  const tierCounts = new Array<number>(tiers.length).fill(0);
  for (const v of flatValues) {
    if (!Number.isFinite(v)) continue;
    let idx = -1;
    for (let i = 0; i < tiers.length; i++) {
      if (v >= tiers[i].min && v <= tiers[i].max) {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      const topMax = tiers[0].max;
      idx = Number.isFinite(topMax) && v > topMax ? 0 : tiers.length - 1;
    }
    tierCounts[idx] += 1;
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

function finalizeBuckets(buckets: Map<string, AggregatedModBucket>, affix: AffixKind): ModEntry[] {
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
    const tiers = lookupTiers(bucket.template);
    const groupIds = lookupGroups(bucket.template);

    const placeholderIsSingle = placeholderCount === 1;
    let inferredTier: number | undefined = undefined;
    if (placeholderIsSingle && tiers.length > 0 && avgValues.length > 0 && Number.isFinite(avgValues[0])) {
      inferredTier = inferTierFromAverage(tiers, avgValues[0]);
    }
    let usageTier: number | undefined = undefined;
    if (placeholderIsSingle && tiers.length > 0 && flatValues.length > 0) {
      usageTier = usageTierFromValues(tiers, flatValues);
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
    list.push({ name: jaCurrency(b.nameEn), nameEn: b.nameEn, count: b.count });
  }
  list.sort((a, b) => b.count - a.count);
  return list;
}

function finalizeSlot(slot: SlotCounter): SlotMods {
  return {
    prefix: finalizeBuckets(slot.prefix, "P"),
    suffix: finalizeBuckets(slot.suffix, "S"),
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
    ring: finalizeSlot(counter.slots.ring),
    amulet: finalizeSlot(counter.slots.amulet),
    weapon: finalizeSlot(counter.slots.weapon),
    weapon2: finalizeSlot(counter.slots.weapon2),
    helm: finalizeSlot(counter.slots.helm),
    gloves: finalizeSlot(counter.slots.gloves),
    body: finalizeSlot(counter.slots.body),
    boots: finalizeSlot(counter.slots.boots),
    uniques: finalizeUniques(counter.uniques, sampleSize),
    uniquesBySlot,
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
    ingestCharacterItems(counter, ci);
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
  return { account: c.account, name: c.name, items };
}

/**
 * 1 アセンダンシー分のキャッシュから AggregatedAscendancy を再構築する。
 * fetchProgress は `{ done: 0, total: 件数 }` を仮入れし、差分 progress が届いた時点で置換される
 * (キャッシュ表示中に進捗バーが 100% に張り付くのを防ぐ)。
 */
export function aggregateFromCachedAscendancy(cached: CachedAscendancy): AggregatedAscendancy {
  const counter = emptyAscendancyCounter();
  for (const c of cached.characters) {
    ingestCharacterItems(counter, cachedCharacterToCharacterItems(c));
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
