/**
 * POE2 trade2 mod text → ティア番号 逆引き（Phase 1.6）.
 *
 * オーナー指示 (2026-05-21): クラフト発見君のクラスタクリック時に
 *   「軸 mod + 同等以上 tier」の trade2 query を生成して
 *   POE2 オーバーレイ流儀（その tier 以上の listing がずらっと並ぶ）を再現する。
 *
 * 設計のキモ (リサーチ A/B 統合):
 *   1. bundle `mods-bundle.json` を text_en 単位でファミリ化（同 text_en = 同 mod kind）。
 *      実際にはほぼ全ての mod が **同 text_en で 1 件**（家族サイズ 1）か
 *      **数値範囲のみ違う数 tier** で構成される。
 *   2. ファミリ内を `level` 降順にソート → index = tier 番号 (1-based) と定義。
 *      T1 = 最高 level = 最強 tier（GGG 慣習）。
 *   3. 入力テキスト + magnitude 数値 を受け取り、ファミリ内で
 *      その数値が `stats[i].min/max` 範囲に収まる最も強い (最大 level) mod を選び、
 *      その index + 1 を tier 番号として返す。
 *   4. magnitude が無くても text family が見つかれば family size 自体が
 *      「この mod 種別の総 tier 数」として返せる。値不明時は最低 tier 扱い。
 *
 * 解決率見込み:
 *   - mods-bundle.json は ~2700 件、text_en でユニーク化すると ~2570 family。
 *   - 単 tier family (1 件のみ) = ~60%、tier 推定不要（常に T1）。
 *   - 多 tier family は ~40%、magnitude が listing から取れれば 95%+ 確定。
 *   - magnitude 取得失敗時は tierMax = family size、tier = 不明 として返却。
 *
 * 既存 mod-translations.ts と疎結合に保つため独立モジュール化。
 * compiledTranslations の構築コスト（起動時 1 回 ~50ms）を共有しない代わりに、
 * 同等の builder を持つことで責務を分離（読みやすさ優先）。
 */

import modsBundle from "../i18n/mods-bundle.json";

interface BundleEntry {
  text_en?: string;
  text_ja?: string;
  type?: "prefix" | "suffix";
  level?: number;
  stats?: Array<{ id?: string; min?: number; max?: number }>;
  groups?: string[];
}

/** mod family の 1 エントリ（tier 候補 1 個に相当） */
interface TierEntry {
  /** mod 群内での tier index（0-based: 強い→弱い）。表示は tier = index + 1 (T1, T2...)。 */
  index: number;
  /** required_level（強さの指標、降順ソート用） */
  level: number;
  /** stats[i].min（n 個の magnitude に対応、order 保持） */
  statMins: number[];
  /** stats[i].max（n 個の magnitude に対応、order 保持） */
  statMaxs: number[];
}

interface TierFamily {
  /** 正規化 text_en 由来の照合 pattern */
  pattern: RegExp;
  /** ja 側からも照合できるように（タグ展開済日訳とのマッチ用） */
  jaPattern: RegExp | null;
  /** ファミリ内全 mod の tier 列（level 降順、index 0 が最強） */
  entries: TierEntry[];
}

/** [token|display] タグを `display` 部分に展開 */
function expandTags(s: string): string {
  return s.replace(/\[([^|\]]+)\|([^\]]+)\]/g, (_, _t, d) => d);
}

/** 正規表現メタ文字 */
const REGEX_META = /[.+*?^$()\[\]{}|\\]/g;
/** エスケープ後の `\(min-max\)` 形式（数値範囲テンプレ） */
const ESCAPED_RANGE_PATTERN =
  /\\\(-?\d+(?:\.\d+)?-(?:-?\d+(?:\.\d+)?)\\\)/g;

// ━━ 起動時 1 回構築 ━━

const tierFamilies: TierFamily[] = (() => {
  // text_en でグルーピング
  const grouped = new Map<string, BundleEntry[]>();
  const entries = modsBundle as unknown as Record<string, BundleEntry>;
  for (const entry of Object.values(entries)) {
    const en = entry.text_en;
    if (!en || typeof en !== "string") continue;
    if (!grouped.has(en)) grouped.set(en, []);
    grouped.get(en)!.push(entry);
  }

  const families: TierFamily[] = [];
  for (const [textEn, mods] of grouped) {
    // level 降順（最高 level = 最強 tier）。同 level は stats[0].max 降順 tie-break。
    mods.sort((a, b) => {
      const al = a.level ?? 0;
      const bl = b.level ?? 0;
      if (al !== bl) return bl - al;
      const am = a.stats?.[0]?.max ?? 0;
      const bm = b.stats?.[0]?.max ?? 0;
      return bm - am;
    });

    // pattern 構築（text_en の (min-max) を (\d+) に）
    let pattern: RegExp;
    try {
      let escaped = textEn.replace(REGEX_META, "\\$&");
      escaped = escaped.replace(ESCAPED_RANGE_PATTERN, "(-?\\d+(?:\\.\\d+)?)");
      pattern = new RegExp("^" + escaped + "$");
    } catch {
      continue;
    }

    // ja 側 pattern（タグ展開済日訳ともマッチ可、未取得時は null）
    let jaPattern: RegExp | null = null;
    const ja = mods[0].text_ja;
    if (ja) {
      try {
        const jaExpanded = expandTags(ja);
        let escaped = jaExpanded.replace(REGEX_META, "\\$&");
        escaped = escaped.replace(
          ESCAPED_RANGE_PATTERN,
          "(-?\\d+(?:\\.\\d+)?)",
        );
        jaPattern = new RegExp("^" + escaped + "$");
      } catch {
        jaPattern = null;
      }
    }

    const tierEntries: TierEntry[] = mods.map((m, i) => {
      const stats = Array.isArray(m.stats) ? m.stats : [];
      return {
        index: i,
        level: m.level ?? 0,
        statMins: stats.map((s) => s?.min ?? 0),
        statMaxs: stats.map((s) => s?.max ?? 0),
      };
    });

    families.push({ pattern, jaPattern, entries: tierEntries });
  }
  return families;
})();

// ━━ 公開型 ━━

/**
 * ティア推定結果。
 * - tier: 1-based tier 番号（T1 が最強、null は推定不能）
 * - tierTotal: ファミリ内総 tier 数（推定不能時も family ヒット時は埋まる）
 * - tierMinValue: その tier の stat[0].min（trade2 query の value.min に使う）
 * - tierMaxValue: その tier の stat[0].max（参考表示）
 */
export interface TierInfo {
  tier: number | null;
  tierTotal: number;
  tierMinValue: number | null;
  tierMaxValue: number | null;
}

const EMPTY_TIER_INFO: TierInfo = {
  tier: null,
  tierTotal: 0,
  tierMinValue: null,
  tierMaxValue: null,
};

// ━━ 公開関数 ━━

/**
 * mod text + 観測 magnitude 値 から tier 情報を逆引き。
 *
 * @param text trade2 raw 英語 text (タグ込み) or 翻訳済日訳 (タグ展開済) どちらも可
 * @param magnitudes 観測された stat 値の配列（stats[i] と order が一致する前提）。
 *   listing.item.extended.mods.explicit[].magnitudes.min をそのまま渡すのが想定。
 *   省略時は family ヒットだけ判定し、tier 番号は null。
 * @returns TierInfo。bundle 非ヒット時は EMPTY_TIER_INFO（tier=null）。
 */
export function inferModTier(
  text: string,
  magnitudes?: number[],
): TierInfo {
  if (!text) return EMPTY_TIER_INFO;

  for (const fam of tierFamilies) {
    if (!fam.pattern.test(text) && !(fam.jaPattern && fam.jaPattern.test(text))) {
      continue;
    }
    const tierTotal = fam.entries.length;

    // magnitudes が無い OR family サイズが 1 なら family ヒットだけ報告
    if (!magnitudes || magnitudes.length === 0) {
      // family size 1 は常に T1 と確定
      if (tierTotal === 1) {
        const top = fam.entries[0];
        return {
          tier: 1,
          tierTotal,
          tierMinValue: top.statMins[0] ?? null,
          tierMaxValue: top.statMaxs[0] ?? null,
        };
      }
      return {
        tier: null,
        tierTotal,
        tierMinValue: null,
        tierMaxValue: null,
      };
    }

    // 各 tier entry で「観測 magnitudes が全部 range に収まる」最初の entry を採用
    //   level 降順ソート済 → 上から順に「収まる」最強の tier が見つかる
    //   ※ 同じ範囲が重なる tier 群がある場合（連続 tier の境界値）も level 降順で安定
    for (const ent of fam.entries) {
      const expected = Math.min(ent.statMins.length, magnitudes.length);
      if (expected === 0) continue;
      let allIn = true;
      for (let i = 0; i < expected; i++) {
        const n = magnitudes[i];
        if (!isFinite(n)) {
          allIn = false;
          break;
        }
        const lo = Math.min(ent.statMins[i], ent.statMaxs[i]);
        const hi = Math.max(ent.statMins[i], ent.statMaxs[i]);
        // 寛容判定: 絶対値ベース（POE2 trade2 raw の符号付き表示対策、mod-translations と同流派）
        const nAbs = Math.abs(n);
        const loAbs = Math.min(Math.abs(lo), Math.abs(hi));
        const hiAbs = Math.max(Math.abs(lo), Math.abs(hi));
        if (nAbs < loAbs || nAbs > hiAbs) {
          allIn = false;
          break;
        }
      }
      if (allIn) {
        return {
          tier: ent.index + 1,
          tierTotal,
          tierMinValue: ent.statMins[0] ?? null,
          tierMaxValue: ent.statMaxs[0] ?? null,
        };
      }
    }

    // family ヒットしたが範囲に収まる tier が無い（数値が tier 表外、稀ケース）
    return {
      tier: null,
      tierTotal,
      tierMinValue: null,
      tierMaxValue: null,
    };
  }

  return EMPTY_TIER_INFO;
}

/**
 * 集計結果の「全 listing で観測された最低 tier 番号」算出ヘルパ。
 *
 * @param tiers cluster 内 listing から取得した tier 番号列（null 含む）
 * @returns null = 観測なし、それ以外は cluster 全体の最低保証 tier (= 最大の tier 番号)。
 *   tier 番号は「1 = 最強」なので、min tier 保証 = listing で観測された最大の tier 番号。
 */
export function aggregateMinTier(tiers: Array<number | null>): number | null {
  let maxTierNumber: number | null = null;
  let observedCount = 0;
  for (const t of tiers) {
    if (t === null || !isFinite(t)) continue;
    observedCount++;
    if (maxTierNumber === null || t > maxTierNumber) {
      maxTierNumber = t;
    }
  }
  // 全件 null だと minTier 算出不能
  if (observedCount === 0) return null;
  return maxTierNumber;
}

/** 簡易デバッグ: family 総数 + 多 tier family 数を返す */
export function getTierFamilyStats(): {
  totalFamilies: number;
  multiTierFamilies: number;
  maxTierCount: number;
} {
  let multi = 0;
  let maxTier = 0;
  for (const fam of tierFamilies) {
    if (fam.entries.length > 1) multi++;
    if (fam.entries.length > maxTier) maxTier = fam.entries.length;
  }
  return {
    totalFamilies: tierFamilies.length,
    multiTierFamilies: multi,
    maxTierCount: maxTier,
  };
}
