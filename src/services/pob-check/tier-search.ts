/**
 * tier-search.ts — 装備のカードから取引所へ、計算機の「完成品を買う」と同じ探し方で (2026-10-05)
 *
 * オーナー「ホバーしたカードにそのままトレード 2 行けるように。オーグメントなし・品質効果なしで、そのティアで」
 * 「完成品を買う挙動と同じに。自動で計算機を通して MOD 解析、品質無し・オーグメント無しでそのまま検索」
 * 「下限じゃなくて、そのまま品質抜いた時の一番近い MOD ティアで探そう。まぁ基本上限突破してるだろうけど」。
 *
 *   1. PoB の文面 → ゲームのコピーの形 ([[to-craft.ts]]) → 計算機の貼り付けの読み ([[paste.ts]] の parseJaItem / targetsFor)。
 *      ルーン・エンチャント (オーグメント) の行は狙いに入らない。品質・カタリストで底上げされた分は割り戻してティアを決める
 *   2. 下限は「品質を抜いた実際の値」を、そのティアの範囲に収めた値 (範囲より上なら上限、下なら下限)。値が 2 つ以上の MOD
 *      (「# から # の火ダメージ」など、取引所では 1 つにまとまる) はティアの下限のまま
 *   3. 種類は計算機の完成品の full と同じ: 普通 / 固定済み / 冒涜のどれでも (取引所に有る種類だけ)。単体の耐性は「どれかの耐性 N 個」。
 *      ユニーク以外・アイテムレベル以上・品質は条件にしない
 * ユニークは名前 + ベースで探す。取引所は URL を開くだけ (値段は取りに行かない)
 */
import { loadHtcPatch } from "../htc/patch";
import { parseJaItem, targetsFor } from "../htc/paste";
import { baseForSolving } from "../htc/bridge";
import { tradeCategoryOf, tradeFiltersFor } from "../htc/buy-or-craft";
import { boostedBy, rawValue } from "../htc/quality";
import { tierDisplayRanges } from "../mods/stat-scale";
import { buildSpecQuery } from "../trade2/query";
import { hasStatKind, type StatKind } from "../trade2/stat-kinds";
import { splitResists } from "../trade2/resist-group";
import { pobRawToCopy } from "./to-craft";
import { openTradeQuery, uniqueSearchQuery } from "./trade-links";

export interface TierSearchResult {
  /** 開けたか */
  ok: boolean;
  /** 画面に出す一言 (外した行・開けなかった理由) */
  note: string;
}

const KINDS: StatKind[] = ["explicit", "fractured", "desecrated"];
const bareOf = (id: string): string => id.replace(/^(explicit|fractured|desecrated)\./, "");

export async function openTierSearch(it: { raw: string; rarity: string; name: string; base: string }): Promise<TierSearchResult> {
  const r = it.rarity.toUpperCase();
  if (r === "UNIQUE" || r === "RELIC") {
    await openTradeQuery(uniqueSearchQuery({ title: it.name, base: it.base }));
    return { ok: true, note: "名前 + ベースで開きました" };
  }
  const b = await tierSearchQuery(it.raw);
  if ("error" in b) return { ok: false, note: b.error };
  await openTradeQuery(b.query);
  return { ok: true, note: b.note };
}

/** レア・マジックの検索の中身 (開かない)。確かめ用にも分けてある */
export async function tierSearchQuery(raw: string): Promise<{ query: unknown; note: string } | { error: string }> {
  const data = await loadHtcPatch();
  const pasted = parseJaItem(pobRawToCopy(raw));
  if (!pasted.baseType) return { error: "ベースが分かりませんでした" };
  const got = targetsFor(data, pasted);
  const cls = baseForSolving(data, pasted.baseType, got.skippedSides);
  if (!cls) return { error: `「${pasted.baseType}」は計算機が知らないベースです` };
  if (!got.targets.length) return { error: "ティアの決まる MOD がありませんでした" };

  const stats: Array<{ id: string; min?: number }> = [];
  const unmatched: string[] = [];
  got.targets.forEach((t, i) => {
    const one = tradeFiltersFor(data, [t]);
    unmatched.push(...one.unmatched);
    const mod = data.mods.get(t.modId);
    const tier = mod?.tiers[t.minTierIndex ?? 0];
    const line = pasted.lines.find((l) => l.text === got.texts[i]);
    // 品質 (装飾品のカタリスト) の底上げを割り戻した、そのアイテムの値
    const boost = !!(mod && pasted.quality && pasted.catalystTag && boostedBy(mod, pasted.catalystTag));
    const own = line?.values.length === 1 ? (boost ? rawValue(line.values[0]!, pasted.quality!) : line.values[0]!) : null;
    const range = tier ? tierDisplayRanges(tier)[0] : undefined;
    for (const f of one.filters) {
      let min = f.min;
      if (own != null && range && one.filters.length === 1) {
        const lo = Math.min(range[0]!, range[1]!), hi = Math.max(range[0]!, range[1]!);
        min = Math.min(hi, Math.max(lo, own));
      }
      stats.push({ id: f.id, min });
    }
  });
  // 単体の耐性は種類を問わない (完成品と同じ)
  const res = splitResists(stats, KINDS);
  const plain: Array<{ id: string; min?: number }> = [];
  const anyOf: Array<{ filters: Array<{ id: string; min?: number }>; count?: number }> = [];
  for (const f of res.rest) {
    if (!/^(explicit|fractured|desecrated)\./.test(f.id)) { plain.push(f); continue; }
    const key = bareOf(f.id);
    const real = KINDS.filter((k) => hasStatKind(key, k));
    if (real.length > 1) anyOf.push({ filters: real.map((k) => ({ id: `${k}.${key}`, ...(f.min != null ? { min: f.min } : {}) })) });
    else plain.push({ id: `${real[0] ?? "explicit"}.${key}`, ...(f.min != null ? { min: f.min } : {}) });
  }
  if (res.group) anyOf.push(res.group);
  const category = tradeCategoryOf(cls);
  const q = buildSpecQuery({
    baseType: pasted.baseType,
    ...(category ? { category } : {}),
    rarity: "nonunique",
    ...(pasted.itemLevel ? { ilvlMin: pasted.itemLevel } : {}),
    stats: plain,
    anyOf,
  });
  const out = [...unmatched, ...got.skipped];
  return { query: q, note: `${got.targets.length} 個の MOD (品質・オーグメント抜きの値) で開きました${out.length ? `。条件にできない行 ${out.length} 個は外した` : ""}` };
}
