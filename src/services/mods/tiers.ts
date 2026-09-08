/**
 * MOD のティア表を「装備タグ (スロット / 装備種別) で絞って」mods-bundle から実行時に組む (2026-09-08)
 *
 * 背景: 旧 mod-tier-and-group.json の tiers は normalize(text_en) だけでまとめていたため、
 *   - 指輪の「最大マナ」にスタッフ専用 (IncreasedManaTwoHandWeapon: 299-328) が混ざって T19 まで並ぶ
 *   - "Adds # to # X Damage" は stats[0] (最小側) しか見ず、T1: 1-4 のような範囲になる
 *   - ユニーク / 腐敗 / 冒涜 / ジュエル用の同文 mod や、ハイブリッド mod の 1 行目が紛れ込む
 * ここでは bundle の spawn (クライアントの SpawnWeight_Tags、並び順そのまま) を装備タグと突合して、
 * その装備に実際に出る mod だけでティアを付ける。
 *   - 出現判定はゲームと同じ「spawn を先頭から見て、装備タグに最初に一致した項目の重み」(弓は `bow:0` が先に来る)
 *   - 範囲は text_en の表示値 (クリティカル率 4.41-5 など。stats の内部値は ×100 のことがある)
 *   - 複数 stat (Adds # to #) は全 stat の範囲を持ち、trade2 の下限には平均を使う
 */

import modsBundle from "../../i18n/mods-bundle.json";
import type { ModTierRow } from "../craft-v2/types";
import { normalizeModTemplate, normalizeModTextKey, stripRichTextMarkers } from "./normalize";

interface BundleStat {
  id: string;
  min?: number;
  max?: number;
}
interface BundleEntry {
  text_en?: string;
  type?: "prefix" | "suffix";
  level?: number;
  stats?: BundleStat[];
  spawn?: Array<{ t: string; w: number }>;
  desecrated?: number;
}

interface TierSource {
  key: string;
  level: number;
  mins: number[];
  maxs: number[];
  spawn: Array<{ t: string; w: number }>;
}

/** ティア表から外す mod (自然には付かない同文 mod) */
const EXCLUDED_KEY = /^(Corruption|Unique|Veiled|Historic|Tower|Grant)/;

/** text_en の `(a-b)` / 裸数値を表示値の範囲として取り出す (裸数値は a=b) */
function displayRanges(textEn: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)|(?<![\d.(-])(-?\d+(?:\.\d+)?)(?![\d.)-])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(textEn))) {
    if (m[1] !== undefined) out.push([Number(m[1]), Number(m[2])]);
    else out.push([Number(m[3]), Number(m[3])]);
  }
  return out;
}

/** normalize(text_en) → その文言を持つ mod */
const SOURCES: Map<string, TierSource[]> = (() => {
  const dict = modsBundle as Record<string, BundleEntry>;
  const map = new Map<string, TierSource[]>();
  for (const key in dict) {
    const e = dict[key];
    if (!e?.text_en || (e.type !== "prefix" && e.type !== "suffix")) continue;
    if (e.desecrated || EXCLUDED_KEY.test(key)) continue;
    // ハイブリッド (複数行) はティア表に混ぜない (単独 mod の T1..Tn と別物)
    if (/\r?\n/.test(e.text_en.trim())) continue;
    const stats = (e.stats ?? []).filter((s) => typeof s.min === "number" && typeof s.max === "number");
    if (stats.length === 0) continue;
    // 表示値 (text_en) を優先。数が合わなければ stats の内部値
    const ranges = displayRanges(stripRichTextMarkers(e.text_en));
    const useDisplay = ranges.length === stats.length;
    const mins = useDisplay ? ranges.map((r) => Math.min(r[0], r[1])) : stats.map((s) => s.min as number);
    const maxs = useDisplay ? ranges.map((r) => Math.max(r[0], r[1])) : stats.map((s) => s.max as number);
    const src: TierSource = { key, level: e.level ?? 0, mins, maxs, spawn: e.spawn ?? [] };
    // キーはマーカー除去 + 小文字 (クライアントは "Lightning damage" のように小文字が混ざる)
    const k = normalizeModTextKey(e.text_en);
    if (!k) continue;
    let list = map.get(k);
    if (!list) {
      list = [];
      map.set(k, list);
    }
    list.push(src);
  }
  return map;
})();

/** spawn を先頭から見て、装備タグに最初に一致した項目の重みで判定 (ゲームと同じ)。一致無しは出ない */
function spawnsOnTags(src: TierSource, tags: ReadonlySet<string>): boolean {
  for (const s of src.spawn) {
    if (tags.has(s.t) || s.t === "default") return s.w > 0;
  }
  return false;
}

const fmtRange = (lo: number, hi: number) => (lo === hi ? `${lo}` : `${lo}-${hi}`);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const cache = new Map<string, ModTierRow[]>();

/**
 * テンプレ (`#` 形式、マーカー有無どちらでも) のティア表。
 * @param tagSets 装備種別ごとのタグ集合。どれか 1 つの種別で出れば採用 (武器スロットは種別ごとに評価する)。
 *                null なら全 mod (絞らない)
 */
export function tiersForTemplate(template: string, tagSets: readonly (readonly string[])[] | null): ModTierRow[] {
  const tplKey = normalizeModTemplate(template);
  const tagKey = tagSets ? tagSets.map((t) => [...t].sort().join(",")).sort().join(";") : "*";
  const cacheKey = `${tagKey}|${tplKey}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const sources = SOURCES.get(normalizeModTextKey(tplKey)) ?? [];
  const sets = tagSets ? tagSets.map((t) => new Set(t)) : null;
  const seen = new Set<string>();
  const rows: Array<{ mins: number[]; maxs: number[]; level: number }> = [];
  for (const s of sources) {
    if (sets && !sets.some((set) => spawnsOnTags(s, set))) continue;
    const sig = `${s.mins.join("/")}|${s.maxs.join("/")}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    rows.push({ mins: s.mins, maxs: s.maxs, level: s.level });
  }
  rows.sort((a, b) => mean(b.mins) - mean(a.mins) || b.level - a.level);
  const out: ModTierRow[] = rows.map((r, i) => ({
    tier: i + 1,
    min: r.mins[0],
    max: r.maxs[0],
    mins: r.mins,
    maxs: r.maxs,
    filterMin: Math.floor(mean(r.mins) * 100) / 100,
    level: r.level,
    label: `T${i + 1}: ${r.mins.map((lo, j) => fmtRange(lo, r.maxs[j])).join(" / ")}`,
  }));
  cache.set(cacheKey, out);
  return out;
}
