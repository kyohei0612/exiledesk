/**
 * 忍者ビルドコピーのレアの取引所リンク (2026-09-26)
 *
 * オーナー:「検索するときの MOD ティアで検索かけてね。計算機の完成品みたいな扱いで、完成品ヒットなしで徐々にゆるくなる感じ。
 * MOD 解析と同じ挙動、作る作業が無いだけ。取得もないね、全部手動で検索かけるから絶対トレードにアクセスしなくていい」
 * 「アイテムの行に各 MOD とティア出して、ティアはいじれる様に」。
 *   - 装備: クラフト計算機と同じ流れ (PoE2HTC のデータ → 貼り付けの MOD 解析 parseJaItem / targetsFor → 段の下限 tradeFiltersFor)。
 *     段は行ごとに選び直せる (analyzeRare で 1 回解析、rareLinks で選んだ段から作り直す)
 *   - ジュエルと計算機に無い物: 取引所の MOD の文面の一覧から引く (prices.ts の textStats)。下限は数値の割合 (最初は 100%)
 *   - ゆるめ方は自動では確かめられない (取引所に通信しない) ので、ゆるさの違うリンクを 3 つ並べる:
 *       完成品 (段の下限・全部) → 1 つ欠けても可 → 数値なし (組み合わせだけ)
 *   - コラプト品は固有の行 (コラプトで付いた物) を入れず、ふつうの検索。数値が段の上限を超えている MOD は、その装備レベルで出る一番上の段になる
 *   - 計算機で作れない特殊な MOD (ドロップ限定など) も条件に入れる。外すのはコラプトで付いた行だけ
 *     (オーナー 2026-09-26「特殊 MOD 省かなくていいぞ、そもそもコラプトでついたやつだけだね弾くのは」)。
 *     段が無いので数値で、下限は数値の割合 (ratio)
 *   - 聖別品は、聖別で動いた数値を戻してから段を決める (オーナー「聖別で上がった値とかもリセットして計算」)。
 *     聖別は MOD ごとに 78%〜122% を掛ける (クライアントのキーワードの説明)。元の値は分からないので、
 *     段のある MOD は今の数値に一番近い段 (範囲の外に出ていれば端の段)、段の無い行は一番低い元の値 (÷1.22) にする
 *   - ジュエルは段ではなく数値の割合で下限を決める (オーナー 2026-09-26「ジュエルはティアじゃなくて数値に、割合で減らす感じで。
 *     固定の数値のとこはそのままで」)
 */
import { loadHtcPatch } from "../htc/patch";
import { parseJaItem, targetsFor } from "../htc/paste";
import { baseForSolving } from "../htc/bridge";
import { tradeFiltersFor } from "../htc/buy-or-craft";
import { jaUniqueText, loadUniqueHoverDict } from "../mods/unique-mod-ja";
import { loadStatText, textStats, type TextStat } from "./prices";
import { bareOf, defScaleOf, ladder, lineFilters, mergeSame, query, type Filter } from "./rare-trade-query";
export { lineMin } from "./rare-trade-query";
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { BuildItem } from "./pob";

let data: PatchData | null = null;
/** 計算機のデータ・取引所の文面の一覧・MOD の日本語を読む (読み込みの時に 1 回) */
export async function prepareRareQueries(): Promise<void> {
  await Promise.all([loadStatText(), loadUniqueHoverDict()]);
  data ??= await loadHtcPatch();
}

export interface RareLink {
  label: string;
  query: unknown;
}
/** 1 つの MOD (段を選べる) */
export interface RareMod {
  modId: string;
  /** 日本語の文 (付いている数値のまま) */
  text: string;
  /** 解析で決まった段 (tiers の添字。大きいほど上の段) */
  tier: number;
  /** 選べる段 (その装備レベルで付く物、上の段から)。label は「T1 以上 (80-89)」 */
  options: Array<{ i: number; label: string }>;
  /** プレフィックス / サフィックス (オーナー 2026-09-26「サフィとプレフィックス簡単に分けて表示」) */
  side: "prefix" | "suffix" | null;
}
/** 数値で条件にする行 (ジュエル、装備の特殊な MOD) */
export interface RareLine {
  /** 日本語の文 (付いている数値のまま) */
  text: string;
  ids: string[];
  /** 割合を掛ける元の数値 (聖別品は戻した値)。数値の無い行は null */
  value: number | null;
  negative: boolean;
  /** 割合で下げない (数値が 1 以下の、動かない値) */
  fixed: boolean;
  /** 付きやすさ (計算機の MOD なのに取引所の条件にできず文面から引き直した行だけ。特殊な MOD は無し = 最後に外す) */
  weight?: number;
}
export interface RareAnalysis {
  base: string;
  /** 段で組めたか (計算機の流れ) / 文面から引いたか */
  via: "tier" | "text";
  mods: RareMod[];
  /** 数値で条件にする行 (段の流れでは計算機で作れない特殊な MOD、文面の流れでは全部) */
  lines: RareLine[];
  /** 条件にできなかった行 */
  missing: string[];
  sanctified: boolean;
  /** アイテムレベル (付きやすさを出す段の範囲) */
  ilvl: number;
  /** 防御値とソケット数 (取引所の装備の条件)。オーナー 2026-09-27「ベースについてるエナシやらアーマーやらの値とソケットも検索に」 */
  equip: Equip;
}
export interface Equip {
  armour: number;
  evasion: number;
  energyShield: number;
  sockets: number;
  /** 品質 (%)。完成品の検索だけ下限に入れる (オーナー 2026-09-27「元のコピーが 40% なら 40% で探すべき。条件緩めるならその限りではない」) */
  quality: number;
}
/** 聖別で掛かる倍率の上限 (78%〜122%) */
const SANCTIFY_MAX = 1.22;

/** ゲームのコピーの形に並べ直す (計算機の貼り付けの解析に通すため)。コラプト品は固有の行を入れない */
function asPasted(it: BuildItem): string {
  const NL = String.fromCharCode(10);
  return ["Rarity: Rare", it.name, it.base, "--------", `Item Level: ${it.itemLevel}`, "--------", ...(it.corrupted ? [] : it.implicits), "--------", ...it.mods].join(NL);
}

/** 文面から引いた行 → 数値で条件にする行 */
function toLine(t: TextStat, sanctified: boolean): RareLine {
  const value = t.value == null ? null : sanctified ? t.value / SANCTIFY_MAX : t.value;
  return { text: jaUniqueText(t.text), ids: t.ids, value, negative: t.negative, fixed: t.value != null && t.value <= 1 };
}

/**
 * 聖別品の段: 数値に一番近い段 (その装備レベルで出る物)。同じ近さなら上の段。
 * 数値の数が段の範囲の数と合わない時 (複合 MOD の片方の行など) は null (解析のまま)
 */
function nearestTier(mod: Mod, text: string, level: number): number | null {
  const nums = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  let best: number | null = null;
  let bestD = Infinity;
  mod.tiers.forEach((t, i) => {
    const r = t.ranges ?? [];
    if (t.ilvl > level || r.length !== nums.length || !r.length) return;
    const d = r.reduce((s, x, k) => {
      const lo = Number(x[0]);
      const hi = Number(x[1]);
      const v = nums[k]!;
      return s + Math.max(0, lo - v, v - hi) / Math.max(1, Math.abs(hi));
    }, 0);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** 品質の最大値 (+20% to Maximum Quality) の行ではない */
const notQuality = (t: TextStat) => !t.ids.some((id) => id.endsWith(".stat_2039822488"));
const equipOf = (it: BuildItem): Equip => ({ armour: it.armour, evasion: it.evasion, energyShield: it.energyShield, sockets: it.sockets, quality: it.quality });

/** 1 つのレアを解析する (読み込みの時に 1 回) */
export function analyzeRare(it: BuildItem): RareAnalysis {
  const sanctified = !!it.sanctified;
  if (data && it.base && it.kind !== "jewel") {
    try {
      const p = parseJaItem(asPasted(it));
      const got = targetsFor(data, p);
      const cls = p.baseType ? baseForSolving(data, p.baseType, got.skippedSides) : null;
      if (cls && got.targets.length) {
        // 取引所の条件にできない MOD (靴の「冷気と混沌耐性」など) は、黙って抜けないよう文面から引き直す。
        // 品質の最大値は MOD ではない (品質を上げる道具) ので入れない (オーナー 2026-09-27「純粋に MOD だけでいい」)
        const quality = (id: string) => data!.mods.get(id)?.family === "LocalMaximumQuality";
        const keep = got.targets.map((t, k) => ({ t, text: got.texts[k] ?? "" })).filter((x) => !quality(x.t.modId));
        const tradable = keep.filter((x) => !tradeFiltersFor(data!, [x.t]).unmatched.length);
        const refetchKeep = keep.filter((x) => !tradable.includes(x));
        const refetch = refetchKeep.map((x) => x.text);
        const weightByText = new Map(refetchKeep.map((x) => [x.text, weightOf(x.t.modId, it.itemLevel || 100)]));
        const mods: RareMod[] = tradable.map(({ t, text }) => {
          const mod = data!.mods.get(t.modId);
          const tiers = mod?.tiers ?? [];
          const side = mod?.type === "prefix" || mod?.type === "suffix" ? mod.type : null;
          const cur = (sanctified && mod ? nearestTier(mod, text, it.itemLevel || 100) : null) ?? t.minTierIndex ?? 0;
          const options = tiers
            .map((tr, i) => ({ i, ilvl: tr.ilvl, label: `T${tiers.length - i} 以上 (${(tr.ranges ?? []).map((x) => `${x[0]}-${x[1]}`).join(" / ")})` }))
            .filter((o) => o.ilvl <= (it.itemLevel || 100) || o.i === cur)
            .reverse()
            .map(({ i, label }) => ({ i, label }));
          return { modId: t.modId, text: jaUniqueText(text || t.modId), tier: cur, options, side };
        });
        // 計算機で作れない行も、取引所の文面で引けた物は条件にする
        // 計算機の型に無い行 (「13% reduced Slowing Potency of Debuffs on You」など) は p.unmatched に落ちる。黙って抜けないよう文面から
        const extra = textStats([...refetch, ...got.skipped, ...p.unmatched]);
        return { base: it.base, via: "tier", mods, lines: extra.lines.filter(notQuality).map((x) => ({ ...toLine(x, sanctified), weight: weightByText.get(x.text) })), missing: extra.missing, sanctified, ilvl: it.itemLevel || 100, equip: equipOf(it) };
      }
    } catch {
      /* 解析できない物は文面から */
    }
  }
  const t = textStats(it.mods);
  return { base: it.base, via: "text", mods: [], lines: t.lines.filter(notQuality).map((x) => toLine(x, sanctified)), missing: t.missing, sanctified, ilvl: it.itemLevel || 100, equip: equipOf(it) };
}

/** 条件の鍵 (段の MOD は m番号、数値の行は l番号)。自動の相場取りで外す単位 */
export type CondKey = `m${number}` | `l${number}`;

/** 選んだ段から shift 段下げた段 (選べる段の中で。一番下ならそのまま) */
function shifted(m: RareMod, now: number, shift: number): number {
  if (shift <= 0) return now;
  const below = m.options.map((o) => o.i).filter((i) => i < now).sort((x, y) => y - x);
  return below.length ? below[Math.min(shift, below.length) - 1]! : now;
}

/** 条件 (選んだ段・割合から shift 段下げ、drop の条件は外す)。数値なしの時は values = false */
function filtersFor(
  a: RareAnalysis,
  picked: Readonly<Record<number, number>>,
  ratio: number,
  opts: { shift?: number; drop?: ReadonlySet<CondKey>; values?: boolean } = {},
): Filter[] {
  const shift = opts.shift ?? 0;
  const drop = opts.drop ?? new Set<CondKey>();
  const lines = a.lines.filter((_, k) => !drop.has(`l${k}`));
  const extra = lineFilters(lines, Math.max(10, ratio - shift * 10));
  let filters: Filter[] = extra;
  if (a.via === "tier" && data) {
    const targets: TierTarget[] = a.mods.flatMap((m, k) => (drop.has(`m${k}`) ? [] : [{ modId: m.modId, minTierIndex: shifted(m, picked[k] ?? m.tier, shift) }]));
    const tf = tradeFiltersFor(data, targets);
    filters = [...tf.filters.map((f): Filter => (f.min ? { id: f.id, value: { min: f.min } } : { id: f.id })), ...extra];
  }
  const merged = mergeSame(filters);
  return opts.values === false ? merged.map(bareOf) : merged;
}

/** 選んだ段 (MOD の並び → tiers の添字) と数値の割合 (%) でリンクを作る */
export function rareLinks(a: RareAnalysis, picked: Readonly<Record<number, number>> = {}, ratio = 100): RareLink[] {
  return ladder(a.base, filtersFor(a, picked, ratio), a.equip);
}

/** 自動の相場取りの検索 1 本 (rare-auto.ts) */
export function rareQuery(
  a: RareAnalysis,
  picked: Readonly<Record<number, number>>,
  ratio: number,
  opts: { shift?: number; drop?: ReadonlySet<CondKey>; values?: boolean },
): unknown {
  return query(a.base, filtersFor(a, picked, ratio, opts), a.equip, opts.values === false ? null : defScaleOf(opts.shift ?? 0));
}

/** その MOD の付きやすさ (アイテムレベルで出る段の重みの合計。データが無ければ 0) */
function weightOf(modId: string, ilvl: number): number {
  const m = data?.mods.get(modId);
  return (m?.tiers ?? []).filter((t) => t.ilvl <= ilvl).reduce((s, t) => s + (t.weight || 0), 0);
}

/**
 * 出品が無い時に外していく順: 付きやすい MOD から (オーナー 2026-09-27「MOD 付きやすい順で無くしていって検索かけよう」)。
 * 計算機で作れない特殊な MOD は重みが無い (= 珍しい) ので最後
 */
export function dropOrder(a: RareAnalysis): Array<{ key: CondKey; text: string }> {
  // 文面から引き直した計算機の MOD (靴の「冷気と混沌耐性」など) も重みで並べる。重みの無い特殊な MOD は最後
  const weighted = [
    ...a.mods.map((m, k) => ({ key: `m${k}` as CondKey, text: m.text, w: weightOf(m.modId, a.ilvl) })),
    ...a.lines.flatMap((l, k) => (l.weight != null ? [{ key: `l${k}` as CondKey, text: l.text, w: l.weight }] : [])),
  ].sort((x, y) => y.w - x.w);
  const special = a.lines.flatMap((l, k) => (l.weight == null ? [{ key: `l${k}` as CondKey, text: l.text }] : []));
  return [...weighted.map(({ key, text }) => ({ key, text })), ...special];
}
