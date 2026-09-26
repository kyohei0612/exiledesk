/**
 * 忍者ビルドコピーのレアの取引所リンク (2026-09-26)
 *
 * オーナー:「検索するときの MOD ティアで検索かけてね。計算機の完成品みたいな扱いで、完成品ヒットなしで徐々にゆるくなる感じ。
 * MOD 解析と同じ挙動、作る作業が無いだけ。取得もないね、全部手動で検索かけるから絶対トレードにアクセスしなくていい」
 * 「アイテムの行に各 MOD とティア出して、ティアはいじれる様に」。
 *   - 装備: クラフト計算機と同じ流れ (PoE2HTC のデータ → 貼り付けの MOD 解析 parseJaItem / targetsFor → 段の下限 tradeFiltersFor)。
 *     段は行ごとに選び直せる (analyzeRare で 1 回解析、rareLinks で選んだ段から作り直す)
 *   - ジュエルなど計算機に無い物: 取引所の MOD の文面の一覧から引く (prices.ts の textStats、数値の 8 割以上)
 *   - ゆるめ方は自動では確かめられない (取引所に通信しない) ので、ゆるさの違うリンクを 3 つ並べる:
 *       完成品 (段の下限・全部) → 1 つ欠けても可 → 数値なし (組み合わせだけ)
 *   - コラプト品は固有の行を入れず、ふつうの検索。数値が段の上限を超えている MOD は、その装備レベルで出る一番上の段になる
 */
import { loadHtcPatch } from "../htc/patch";
import { parseJaItem, targetsFor } from "../htc/paste";
import { baseForSolving } from "../htc/bridge";
import { tradeFiltersFor } from "../htc/buy-or-craft";
import { jaUniqueText, loadUniqueHoverDict } from "../mods/unique-mod-ja";
import { Rarity, SecurityStatus } from "../../constants/trade2";
import { loadStatText, textStats } from "./prices";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
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
export interface RareAnalysis {
  base: string;
  /** 段で組めたか (計算機の流れ) / 文面から引いたか */
  via: "tier" | "text";
  mods: RareMod[];
  /** 文面から引いた時の条件と、その日本語 */
  textFilters: Filter[];
  textLines: string[];
  /** 条件にできなかった行 */
  missing: string[];
}

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

/** 1 つのレアを解析する (読み込みの時に 1 回) */
export function analyzeRare(it: BuildItem): RareAnalysis {
  if (data && it.base) {
    try {
      const p = parseJaItem(asPasted(it));
      const got = targetsFor(data, p);
      const cls = p.baseType ? baseForSolving(data, p.baseType, got.skippedSides) : null;
      if (cls && got.targets.length) {
        const mods: RareMod[] = got.targets.map((t, k) => {
          const mod = data!.mods.get(t.modId);
          const tiers = mod?.tiers ?? [];
          const side = mod?.type === "prefix" || mod?.type === "suffix" ? mod.type : null;
          const cur = t.minTierIndex ?? 0;
          const options = tiers
            .map((tr, i) => ({ i, ilvl: tr.ilvl, label: `T${tiers.length - i} 以上 (${(tr.ranges ?? []).map((x) => `${x[0]}-${x[1]}`).join(" / ")})` }))
            .filter((o) => o.ilvl <= (it.itemLevel || 100) || o.i === cur)
            .reverse()
            .map(({ i, label }) => ({ i, label }));
          return { modId: t.modId, text: jaUniqueText(got.texts[k] ?? t.modId), tier: cur, options, side };
        });
        return { base: it.base, via: "tier", mods, textFilters: [], textLines: [], missing: got.skipped };
      }
    } catch {
      /* 解析できない物は文面から */
    }
  }
  const t = textStats(it.mods);
  const missing = new Set(t.missing);
  return { base: it.base, via: "text", mods: [], textFilters: t.filters, textLines: it.mods.filter((m) => !missing.has(m)).map((m) => jaUniqueText(m)), missing: t.missing };
}

/** 選んだ段 (MOD の並び → tiers の添字) でリンクを作る */
export function rareLinks(a: RareAnalysis, picked: Readonly<Record<number, number>> = {}): RareLink[] {
  if (a.via === "tier" && data) {
    const targets: TierTarget[] = a.mods.map((m, k) => ({ modId: m.modId, minTierIndex: picked[k] ?? m.tier }));
    const tf = tradeFiltersFor(data, targets);
    const filters: Filter[] = tf.filters.map((f) => (f.min ? { id: f.id, value: { min: f.min } } : { id: f.id }));
    return ladder(a.base, filters, a.mods.length);
  }
  return ladder(a.base, a.textFilters, a.textLines.length);
}
