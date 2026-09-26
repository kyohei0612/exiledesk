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
import { Rarity, SecurityStatus } from "../../constants/trade2";
import { loadStatText, textStats, type TextStat } from "./prices";
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
}
/** 聖別で掛かる倍率の上限 (78%〜122%) */
const SANCTIFY_MAX = 1.22;

type Filter = { id: string; value?: { min?: number; max?: number } };

function query(base: string, filters: Filter[], need: number | null): unknown {
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      ...(base ? { type: base } : {}),
      stats: filters.length ? [need == null ? { type: "and", filters } : { type: "count", value: { min: need }, filters }] : [],
      filters: { type_filters: { filters: { rarity: { option: Rarity.Rare } } } },
    },
    sort: { price: "asc" },
  };
}

/**
 * 同じ条件の番号をまとめる。ローカルの「エナジーシールドが % 増加」が 2 つの MOD に分かれて付いている時など、
 * 取引所では合わせた 1 つの値で見えるので、下限は足し合わせる
 */
function mergeSame(filters: Filter[]): Filter[] {
  const m = new Map<string, Filter>();
  for (const f of filters) {
    const cur = m.get(f.id);
    if (!cur) {
      m.set(f.id, { ...f, ...(f.value ? { value: { ...f.value } } : {}) });
      continue;
    }
    if (f.value?.min != null) cur.value = { ...(cur.value ?? {}), min: (cur.value?.min ?? 0) + f.value.min };
  }
  return [...m.values()];
}

/** ゆるさの違う 3 本 (MOD の数から 1 つ欠けの数を出す) */
function ladder(base: string, raw: Filter[], mods: number): RareLink[] {
  const filters = mergeSame(raw);
  const bare = filters.map((f) => ({ id: f.id }));
  const links: RareLink[] = [{ label: "完成品", query: query(base, filters, null) }];
  if (mods >= 3) links.push({ label: "1 つ欠けても可", query: query(base, filters, mods - 1) });
  links.push({ label: "数値なし", query: query(base, bare, null) });
  return links;
}

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

/** 1 つのレアを解析する (読み込みの時に 1 回) */
export function analyzeRare(it: BuildItem): RareAnalysis {
  const sanctified = !!it.sanctified;
  if (data && it.base && it.kind !== "jewel") {
    try {
      const p = parseJaItem(asPasted(it));
      const got = targetsFor(data, p);
      const cls = p.baseType ? baseForSolving(data, p.baseType, got.skippedSides) : null;
      if (cls && got.targets.length) {
        const mods: RareMod[] = got.targets.map((t, k) => {
          const mod = data!.mods.get(t.modId);
          const tiers = mod?.tiers ?? [];
          const side = mod?.type === "prefix" || mod?.type === "suffix" ? mod.type : null;
          const cur = (sanctified && mod ? nearestTier(mod, got.texts[k] ?? "", it.itemLevel || 100) : null) ?? t.minTierIndex ?? 0;
          const options = tiers
            .map((tr, i) => ({ i, ilvl: tr.ilvl, label: `T${tiers.length - i} 以上 (${(tr.ranges ?? []).map((x) => `${x[0]}-${x[1]}`).join(" / ")})` }))
            .filter((o) => o.ilvl <= (it.itemLevel || 100) || o.i === cur)
            .reverse()
            .map(({ i, label }) => ({ i, label }));
          return { modId: t.modId, text: jaUniqueText(got.texts[k] ?? t.modId), tier: cur, options, side };
        });
        // 計算機で作れない行も、取引所の文面で引けた物は条件にする
        const extra = textStats(got.skipped);
        return { base: it.base, via: "tier", mods, lines: extra.lines.map((x) => toLine(x, sanctified)), missing: extra.missing, sanctified };
      }
    } catch {
      /* 解析できない物は文面から */
    }
  }
  const t = textStats(it.mods);
  return { base: it.base, via: "text", mods: [], lines: t.lines.map((x) => toLine(x, sanctified)), missing: t.missing, sanctified };
}

/** 数値の行の下限 (数値 × 割合、固定の値はそのまま)。条件に数値を入れない時は null */
export function lineMin(l: RareLine, ratio: number): number | null {
  const v = l.value;
  if (v == null || v <= 0) return null;
  const lim = l.fixed ? Math.floor(v) : Math.floor((v * ratio) / 100);
  return lim >= 1 ? lim : null;
}

/** 数値の行 → 条件 (reduced は負の値の上限) */
function lineFilters(lines: readonly RareLine[], ratio: number): Filter[] {
  const out: Filter[] = [];
  for (const l of lines) {
    const lim = lineMin(l, ratio);
    for (const id of l.ids) out.push(lim == null ? { id } : { id, value: l.negative ? { max: -lim } : { min: lim } });
  }
  return out;
}

/** 選んだ段 (MOD の並び → tiers の添字) と数値の割合 (%) でリンクを作る */
export function rareLinks(a: RareAnalysis, picked: Readonly<Record<number, number>> = {}, ratio = 100): RareLink[] {
  const extra = lineFilters(a.lines, ratio);
  if (a.via === "tier" && data) {
    const targets: TierTarget[] = a.mods.map((m, k) => ({ modId: m.modId, minTierIndex: picked[k] ?? m.tier }));
    const tf = tradeFiltersFor(data, targets);
    const filters: Filter[] = tf.filters.map((f) => (f.min ? { id: f.id, value: { min: f.min } } : { id: f.id }));
    return ladder(a.base, [...filters, ...extra], a.mods.length + a.lines.length);
  }
  return ladder(a.base, extra, a.lines.length);
}
