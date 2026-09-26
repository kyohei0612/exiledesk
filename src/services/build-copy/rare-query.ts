/**
 * 忍者ビルドコピーのレアの取引所リンク (2026-09-26)
 *
 * オーナー:「検索するときの MOD ティアで検索かけてね。計算機の完成品みたいな扱いで、完成品ヒットなしで徐々にゆるくなる感じ。
 * MOD 解析と同じ挙動、作る作業が無いだけ。取得もないね、全部手動で検索かけるから絶対トレードにアクセスしなくていい」。
 *   - 装備: クラフト計算機と同じ流れ (PoE2HTC のデータ → 貼り付けの MOD 解析 parseJaItem / targetsFor → 段の下限 tradeFiltersFor)
 *   - ジュエルなど計算機に無い物: 取引所の MOD の文面の一覧から引く (prices.ts の textStats、数値の 8 割以上)
 *   - ゆるめ方は自動では確かめられない (取引所に通信しない) ので、ゆるさの違うリンクを 3 つ並べる:
 *       完成品 (段の下限・全部) → 1 つ欠けても可 → 数値なし (組み合わせだけ)
 */
import { loadHtcPatch } from "../htc/patch";
import { parseJaItem, targetsFor } from "../htc/paste";
import { baseForSolving } from "../htc/bridge";
import { tradeFiltersFor } from "../htc/buy-or-craft";
import { Rarity, SecurityStatus } from "../../constants/trade2";
import { loadStatText, textStats } from "./prices";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { BuildItem } from "./pob";

let data: PatchData | null = null;
/** 計算機のデータと取引所の文面の一覧を読む (読み込みの時に 1 回) */
export async function prepareRareQueries(): Promise<void> {
  await loadStatText();
  data ??= await loadHtcPatch();
}

export interface RareLink {
  label: string;
  query: unknown;
}
export interface RareLinks {
  links: RareLink[];
  /** 段で組めたか (計算機の流れ) / 文面から引いたか */
  via: "tier" | "text";
  /** 条件にできた MOD の数と、できなかった行 */
  used: number;
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
 * 取引所では合わせた 1 つの値で見えるので、下限は足し合わせる (2026-09-26)
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

/** ゲームのコピーの形に並べ直す (計算機の貼り付けの解析に通すため) */
function asPasted(it: BuildItem): string {
  const NL = String.fromCharCode(10);
  return ["Rarity: Rare", it.name, it.base, "--------", `Item Level: ${it.itemLevel}`, "--------", ...it.implicits, "--------", ...it.mods].join(NL);
}

export function rareLinks(it: BuildItem): RareLinks {
  // 1. 計算機と同じ流れ (段の下限)
  if (data && it.base) {
    try {
      const p = parseJaItem(asPasted(it));
      const got = targetsFor(data, p);
      const cls = p.baseType ? baseForSolving(data, p.baseType, got.skippedSides) : null;
      if (cls && got.targets.length) {
        const tf = tradeFiltersFor(data, got.targets);
        const filters: Filter[] = tf.filters.map((f) => (f.min ? { id: f.id, value: { min: f.min } } : { id: f.id }));
        if (filters.length) return { links: ladder(it.base, filters, got.targets.length), via: "tier", used: got.targets.length, missing: [...got.skipped, ...tf.unmatched] };
      }
    } catch {
      /* 解析できない物は文面から */
    }
  }
  // 2. 文面から (ジュエルなど)
  const t = textStats(it.mods);
  return { links: ladder(it.base, t.filters, t.used), via: "text", used: t.used, missing: t.missing };
}
