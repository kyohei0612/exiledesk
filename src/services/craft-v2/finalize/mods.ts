/**
 * MOD バケット → ModEntry (ティア判定を含む)
 *
 * finalize.ts から切り出し (2026-09-26)。
 */
import type { AffixKind, ModEntry, ModTierRow } from "../types";
import type { AggregatedModBucket } from "../ingest";
import { countPlaceholders, fillTemplate, stripRichTextMarkers } from "../../mods/normalize";
import { lookupGroups, lookupModTextJa } from "../../mods/dictionaries";
import { tiersForTemplate } from "../../mods/tiers";

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
 * 値が T1 の上限を超えているか。超えている = **品質やルーンで底上げされた表示値**で、
 * 素の抽選値ではない (`ModEntry.overCap` の説明を参照)。`tierIndexOfValue` はこれを T1 に丸めるので、
 * 丸めた事実を別に数えておく。
 */
function overTopTier(tiers: ModEntry["tiers"], v: number): boolean {
  if (!tiers.length) return false;
  let top = -Infinity;
  for (const t of tiers) if (t.max > top) top = t.max;
  return Number.isFinite(v) && v > top + 1e-9;
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

export function finalizeBuckets(buckets: Map<string, AggregatedModBucket>, affix: AffixKind, tagSets: string[][] | null): ModEntry[] {
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
    // T1 を超えた件数。ティア判定はこれを T1 に丸めるので、丸めた数を持っておく
    const overCap = tiersForJudge.length > 0 ? judgeValues.filter((v) => overTopTier(tiersForJudge, v)).length : 0;

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
      ...(overCap > 0 ? { overCap } : {}),
    });
  }
  entries.sort((a, b) => b.count - a.count);
  return entries;
}
