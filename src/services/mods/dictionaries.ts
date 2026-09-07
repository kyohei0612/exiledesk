/**
 * MOD 辞書の逆引きインデックス (モジュール初回 1 度だけ構築)
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 *   - bundle 索引:   normalize(text_en) → { affix, 日本語テンプレ }   (mods-bundle.json)
 *   - ティア/グループ: normalize(text_en) → ModTierRow[] / group[]   (mod-tier-and-group.json)
 *   - mod-text-ja:   正規化キー → 日本語テンプレ (英語漏れ救済のフォールバック)
 *   - ユニーク正式名: 英語 → 日本語 (unique-names-ja.json)
 * すべて GGG クライアント原本から生成した辞書 (scripts/build-*-from-client.mjs)。
 */

import modsBundle from "../../i18n/mods-bundle.json";
import modTierAndGroup from "../../i18n/mod-tier-and-group.json";
import affixOverridesRaw from "../../i18n/affix-overrides.json";
import uniqueNamesJaRaw from "../../i18n/unique-names-ja.json";
import modTextJaRaw from "../../i18n/mod-text-ja.json";
import modTextJaManualRaw from "../../i18n/mod-text-ja-manual.json";
import { jaCurrency } from "../../i18n/currencies-ja";
import type { AffixKind, ModTierRow } from "../craft-v2/types";
import {
  normalizeModTemplate,
  normalizeModTextKey,
  stripRichTextMarkers,
} from "./normalize";

// ============================================================================
// ティア表 / グループ表 (mod-tier-and-group.json)
// ============================================================================

interface ModTierAndGroupJson {
  tiers: Record<string, ModTierRow[]>;
  groups: Record<string, string[]>;
}
const _modTierAndGroup = modTierAndGroup as ModTierAndGroupJson;

/**
 * mod-tier-and-group.json のキーはリッチテキスト `[Tag|Display]` 形式を保持しているため、
 * ninja の生 explicitMods (= マーカー無し) を正規化しただけでは hit しない。
 * 各キーごとに stripped 版も alias として同データで引けるようにする (衝突時は元キー優先)。
 */
function buildTierGroupWithAliases<T>(
  src: Readonly<Record<string, T>>,
): Readonly<Record<string, T>> {
  const out: Record<string, T> = { ...src };
  for (const k of Object.keys(src)) {
    const stripped = stripRichTextMarkers(k);
    if (stripped && stripped !== k && !(stripped in out)) {
      out[stripped] = src[k];
    }
  }
  return out;
}

const _modTiers: Readonly<Record<string, ModTierRow[]>> = buildTierGroupWithAliases(
  _modTierAndGroup.tiers,
);
const _modGroups: Readonly<Record<string, string[]>> = buildTierGroupWithAliases(
  _modTierAndGroup.groups,
);

/** rawTemplate (正規化済 英語テンプレ) からティア一覧を引く。マーカー除去版でもフォールバック。 */
export function lookupTiers(template: string): ModTierRow[] {
  return _modTiers[template] ?? _modTiers[stripRichTextMarkers(template)] ?? [];
}

/** rawTemplate からグループ ID 一覧を引く。マーカー除去版でもフォールバック。 */
export function lookupGroups(template: string): string[] {
  return _modGroups[template] ?? _modGroups[stripRichTextMarkers(template)] ?? [];
}

// ============================================================================
// bundle 索引 (mods-bundle.json): 正規化テンプレ → affix / 日本語テンプレ
// ============================================================================

interface ModBundleEntry {
  text_en?: string;
  text_ja?: string;
  type?: "prefix" | "suffix";
  groups?: string[];
}
type ModBundleDict = Record<string, ModBundleEntry>;

export interface ModBundleIndexEntry {
  affix: AffixKind;
  textJaTemplate: string | null;
  textEnTemplate: string;
}

/**
 * poe2db 権威 affix オーバーライド (scripts/audit_affix_vs_poe2db.py で生成)。
 * bundle 多数決が「同テキストが prefix/suffix 両方に存在」で外すケースを上書きする。
 */
const _affixOverrides = affixOverridesRaw as Record<string, AffixKind>;

/**
 * 同じ正規化テンプレートに複数 entry が存在するので、prefix/suffix を**多数決**で確定する
 * (同数なら prefix 優先)。「最初勝ち」だと `CorruptionIncreasedLife1` (suffix, 1 件) が
 * 辞書順で先頭に来て、本来 prefix 13 件の `+# to maximum Life` を suffix と誤分類した。
 *
 * bundle の text_en には `\n` 区切りの multi-line MOD が含まれる。poe.ninja の
 * explicitMods は 1 mod = 1 行なので、各行ごとにも別個に登録する (同 affix を継承)。
 */
export const modBundleIndex: Map<string, ModBundleIndexEntry> = (() => {
  const dict = modsBundle as ModBundleDict;
  interface Tally {
    prefix: number;
    suffix: number;
    textJaTemplate: string | null;
  }
  const tally = new Map<string, Tally>();
  const accumulate = (
    rawTextEn: string,
    rawTextJa: string | undefined,
    type: "prefix" | "suffix",
  ) => {
    const tplKey = normalizeModTemplate(rawTextEn);
    if (!tplKey) return;
    const cur = tally.get(tplKey) ?? { prefix: 0, suffix: 0, textJaTemplate: null };
    if (type === "prefix") cur.prefix += 1;
    else cur.suffix += 1;
    if (!cur.textJaTemplate && rawTextJa) {
      cur.textJaTemplate = normalizeModTemplate(rawTextJa);
    }
    tally.set(tplKey, cur);
  };
  for (const key in dict) {
    const e = dict[key];
    if (!e || !e.text_en || !e.type) continue;
    accumulate(e.text_en, e.text_ja, e.type);
    if (e.text_en.includes("\n")) {
      const enLines = e.text_en
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const jaLines =
        typeof e.text_ja === "string" && e.text_ja
          ? e.text_ja
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
          : [];
      // ja の行数が en と一致する場合のみ位置突合、ズレてれば ja=undefined フォールバック
      const jaMatch = enLines.length === jaLines.length;
      for (let i = 0; i < enLines.length; i++) {
        accumulate(enLines[i], jaMatch ? jaLines[i] : undefined, e.type);
      }
    }
  }
  const map = new Map<string, ModBundleIndexEntry>();
  for (const [tplKey, t] of tally) {
    const baseAffix: AffixKind = t.prefix >= t.suffix ? "P" : "S";
    const affix: AffixKind = _affixOverrides[tplKey] ?? baseAffix;
    map.set(tplKey, { affix, textJaTemplate: t.textJaTemplate, textEnTemplate: tplKey });
  }
  return map;
})();

// ============================================================================
// mod-text-ja(.manual): 正規化キー → 日本語テンプレ (bundle に無い MOD の救済)
// ============================================================================

/**
 * 値 (日本語テンプレ) は raw のまま保持する。`#` プレースホルダは後段 `fillTemplate` で埋まる。
 * (normalizeModTemplate は掛けない: 「知性20ごとに#から#」のような ja 内リテラル数値を壊さないため)
 * manual を後勝ちで上書きして優先する。
 */
const _modTextJaIndex: Map<string, string> = (() => {
  const map = new Map<string, string>();
  const ingest = (dict: Record<string, string>) => {
    for (const enKey in dict) {
      const ja = dict[enKey];
      if (typeof ja !== "string" || !ja) continue;
      const normKey = normalizeModTextKey(enKey);
      if (!normKey) continue;
      map.set(normKey, ja);
    }
  };
  ingest(modTextJaRaw as Record<string, string>);
  ingest(modTextJaManualRaw as Record<string, string>);
  return map;
})();

/** 英語テンプレ (未正規化でも可) から日本語テンプレを引く。無ければ undefined。 */
export function lookupModTextJa(templateEn: string): string | undefined {
  return _modTextJaIndex.get(normalizeModTextKey(templateEn));
}

// ============================================================================
// heuristic prefix/suffix 分類 (bundle に該当なしの fallback)
// ============================================================================

/**
 *   - prefix 寄り: ライフ/マナ/ダメージ追加・%増加・+1 全〇〇スキル
 *   - suffix 寄り: 耐性・属性 (+#)・速度系・確率系・吸収・再生
 *   - 不明は suffix (POE は suffix の種類数が多い)
 */
export function heuristicAffix(tpl: string): AffixKind {
  if (
    /Resistance/i.test(tpl) ||
    /chance to/i.test(tpl) ||
    /Leech/i.test(tpl) ||
    /Regeneration/i.test(tpl) ||
    /Recouped/i.test(tpl) ||
    /Cast Speed/i.test(tpl) ||
    /Attack Speed/i.test(tpl) ||
    /Movement Speed/i.test(tpl) ||
    /Stun Threshold/i.test(tpl)
  ) {
    return "S";
  }
  if (/\+# to (Strength|Dexterity|Intelligence|all Attributes)/i.test(tpl)) {
    return "S";
  }
  if (
    /\+# to maximum (Life|Mana|Energy Shield)/i.test(tpl) ||
    /Adds # to # .*Damage/i.test(tpl) ||
    /\+# to Level of all/i.test(tpl) ||
    /increased Spell Damage/i.test(tpl) ||
    /increased.*Damage/i.test(tpl) ||
    /increased Critical/i.test(tpl)
  ) {
    return "P";
  }
  return "S";
}

// ============================================================================
// ユニーク正式名 (unique-names-ja.json)
// ============================================================================

const _uniqueNamesJa = uniqueNamesJaRaw as Record<string, string>;

/**
 * UniqueUsage.name 用の表示名生成。
 *   1. `representative.name` (= poe.ninja data.name = 英語正式名) → 辞書で日本語化
 *   2. 辞書未登録なら英語正式名のまま
 *   3. `nameEn` (= typeLine、ベース表示) を `jaCurrency` で日本語化 (旧挙動 fallback)
 */
export function displayUniqueNameJa(
  representativeName: string | undefined,
  fallbackTypeLine: string,
): string {
  if (representativeName) {
    return _uniqueNamesJa[representativeName] || representativeName;
  }
  return jaCurrency(fallbackTypeLine);
}
