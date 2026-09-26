/**
 * 忍者ビルドコピーの値段 (2026-09-26)
 *
 * - ユニーク: poe.ninja の相場 (ユニーク装備価格推移と同じ一覧。ここはルーンの熟達品などの行も残す)。名前 + ベースで引き、無ければ名前だけ
 * - ルーン / ソウルコア / リネージュサポート: カレンシーランキングの相場 (poe2scout)
 * - レア: 検索のリンクは rare-query.ts、「相場を取る」を押した時だけ取引所で取る (rare-auto.ts)
 * - 種類違いのあるユニーク (通過儀礼など、poe.ninja の MOD に「どれかが付く」行がある物): 付いている MOD で取引所を検索して最安値
 *   (オーナー 2026-09-27「1 ユニークだけど複数あるやつは MOD で検索してあげて最安値取ろうか。コラプト等の指定はなしで一番緩く」)
 * 取引所へはどれも即時購入 (status: securable) で開く。
 */
import { fetchNinjaOverview, NINJA_UNIQUE_KINDS } from "../../api/ninja-economy";
import { marketStore } from "../../state/market-store";
import { SecurityStatus } from "../../constants/trade2";


// ---- ユニーク (poe.ninja) ----
interface UniquePrice { exalted: number; listings: number }
let uniqueMap: Map<string, UniquePrice> | null = null;
/** 種類違いのあるユニーク → 「どれかが付く」MOD の文面の鍵 (statKey) */
let variantKeys = new Map<string, Set<string>>();
let uniqueAt = 0;
let uniqueLoading: Promise<void> | null = null;
const UNIQUE_TTL = 30 * 60 * 1000;

/** 8 種類の一覧を取る (30 分覚える)。poe.ninja のゲートを通るので 20 秒ほど */
export function loadUniquePrices(onProgress?: (done: number, total: number) => void): Promise<void> {
  if (uniqueMap && Date.now() - uniqueAt < UNIQUE_TTL) return Promise.resolve();
  uniqueLoading ??= (async () => {
    const lg = marketStore.league.value?.Value ?? "";
    const m = new Map<string, UniquePrice>();
    const vk = new Map<string, Set<string>>();
    let done = 0;
    for (const { kind } of NINJA_UNIQUE_KINDS) {
      try {
        const ov = await fetchNinjaOverview(lg, kind);
        const per = ov.exaltedPerDivine || marketStore.rates.value.divine || 1;
        for (const l of ov.lines) {
          const opt = (l.explicitModifiers ?? []).filter((x) => x.optional).flatMap((x) => [statKey(plainNinja(x.text)), statKey(plainNinja(x.text.split("\n")[0] ?? ""))]);
          if (opt.length) vk.set(l.name, new Set([...(vk.get(l.name) ?? []), ...opt]));
          if (!(l.primaryValue > 0) || l.corrupted) continue;
          const p = { exalted: l.primaryValue * per, listings: l.listingCount ?? 0 };
          const k = `${l.name}|${l.baseType}`;
          if (!m.has(k)) m.set(k, p);
          // 名前だけでも引けるように (安い方)
          const n = m.get(l.name);
          if (!n || p.exalted < n.exalted) m.set(l.name, p);
        }
      } catch {
        /* 取れなかった種類は相場なし */
      }
      onProgress?.(++done, NINJA_UNIQUE_KINDS.length);
    }
    uniqueMap = m;
    variantKeys = vk;
    uniqueAt = Date.now();
  })().finally(() => (uniqueLoading = null));
  return uniqueLoading;
}

export function uniquePrice(name: string, base: string): UniquePrice | null {
  return uniqueMap?.get(`${name}|${base}`) ?? uniqueMap?.get(name) ?? null;
}

/** poe.ninja の MOD 文の印 ([Tag|表示]) と範囲 ((10-20)) を外す */
function plainNinja(t: string): string {
  return t.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1").replace(/\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)/g, "1");
}

/** 種類違いのあるユニークか */
export function isVariantUnique(name: string): boolean {
  return variantKeys.has(name);
}

/**
 * 種類違いのあるユニークの検索: 名前 + ベース + 種類を決める MOD (数値なし)。コラプトの指定はしない (一番ゆるく)。
 * 種類を決める MOD = poe.ninja で「どれかが付く」行 (1 行目だけでも合わせる) と、選ぶ形の MOD (From Nothing のキーストーン)。
 * queries は きつい順 (全部 → 1 つ欠けても可 → 2 つ欠けても可)。井戸の心臓のように全部が「どれかが付く」行の物は、
 * 全部一致だと出品が無い (2026-09-27 実測 0 件)。
 * 種類を決める MOD が付いていない (アドニアのエゴのパワーチャージ 0) / 取引所の条件にできない時は reason
 */
export function uniqueVariantQuery(name: string, base: string, mods: readonly string[]): { queries: unknown[] } | { reason: string } {
  const keys = variantKeys.get(name) ?? new Set<string>();
  const key = (t: string) => statKey(t).replace(/(^|\s)-(?=#)/g, "$1");
  const { lines } = textStats(mods);
  const optional = mods.filter((m) => keys.has(key(m)));
  const pick = lines.filter((l) => keys.has(key(l.text)) || l.ids.some((id) => id.includes("|")));
  if (!pick.length) return { reason: optional.length ? "種類を決める MOD を取引所の条件にできないので poe.ninja の相場のまま" : "種類を決める MOD は付いていないので poe.ninja の相場のまま" };
  const filters = [...new Set(pick.flatMap((l) => l.ids))].map((id) => statFilter(id));
  const q = (need: number | null) => ({
    query: {
      status: { option: SecurityStatus.Securable },
      name,
      ...(base ? { type: base } : {}),
      stats: [need == null ? { type: "and", filters } : { type: "count", value: { min: need }, filters }],
    },
    sort: { price: "asc" },
  });
  const queries: unknown[] = [q(null)];
  for (let need = filters.length - 1; need >= Math.max(1, filters.length - 2); need--) queries.push(q(need));
  return { queries };
}

/**
 * 条件の番号 → 取引所の条件。「番号|選択肢」(From Nothing の範囲内のノータブルなど、選ぶ形の MOD) は option で指定する
 * (数値の下限は付けない)
 */
export function statFilter(id: string, value?: { min?: number; max?: number }): { id: string; value?: { min?: number; max?: number; option?: number } } {
  const [sid, opt] = id.split("|");
  if (opt != null) return { id: sid!, value: { option: Number(opt) } };
  return value ? { id, value } : { id };
}

// ---- カレンシー (poe2scout) ----
/** 英語名 → 高貴建て (ルーン・ソウルコア・リネージュサポートなど) */
export function currencyPrice(nameEn: string): number | null {
  const it = marketStore.items.value.find((x) => x.Text === nameEn);
  return it && typeof it.CurrentPrice === "number" && it.CurrentPrice > 0 ? it.CurrentPrice : null;
}
/** その名前がリネージュサポートか (相場の分類で見る) */
export function isLineage(nameEn: string): boolean {
  return marketStore.items.value.some((x) => x.Text === nameEn && x.CategoryApiId === "lineagesupportgems");
}

// ---- 取引所の検索 ----
/** 名前 (種類) だけで探す (ルーン・ジェムなど) */
export function typeQuery(nameEn: string): unknown {
  return { query: { status: { option: SecurityStatus.Securable }, type: nameEn }, sort: { price: "asc" } };
}

/** MOD の文の数値 (「Adds 5 to 10」は平均) */
function valueOf(text: string): number | null {
  const nums = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (!nums.length) return null;
  return /\d+(\.\d+)? to \d+/.test(text) && nums.length >= 2 ? (nums[0]! + nums[1]!) / 2 : nums[0]!;
}

/**
 * 取引所の MOD の文面 → 条件の番号 (src/i18n/trade2-stat-text.json、scripts/build-trade2-stat-text.mjs)。
 * 上位プレイヤーMOD一覧用の表 (getModStatIds) では、レアの MOD の半分以上が引けなかった (2026-09-26)
 */
let statText: Record<string, string[]> | null = null;
export async function loadStatText(): Promise<void> {
  statText ??= ((await import("../../i18n/trade2-stat-text.json")).default ?? {}) as Record<string, string[]>;
}
const statKey = (t: string) => t.replace(/[0-9]+(\.[0-9]+)?/g, "#").replace(/[+]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** 文面から引いた 1 行 (条件の番号と、付いている数値) */
export interface TextStat {
  /** 元の文 (英語) */
  text: string;
  ids: string[];
  /** 付いている数値 (「Adds 5 to 10」は平均)。数値の無い行は null */
  value: number | null;
  /** reduced の行 (取引所では increased の負の値なので、条件は上限になる) */
  negative: boolean;
}

/** 1 つの MOD → 明示の番号と数値 */
function statFor(mod: string): TextStat | null {
  const d = statText ?? {};
  const pick = (k: string) => (d[k] ?? []).filter((id) => id.startsWith("explicit."));
  // 「-10% to all Elemental Resistances per Power Charge」は取引所では「#% to …」(負の値)
  let ids = pick(statKey(mod));
  if (!ids.length) ids = pick(statKey(mod).replace(/(^|\s)-(?=#)/g, "$1"));
  let negative = false;
  if (!ids.length && /reduced/i.test(mod)) {
    ids = pick(statKey(mod.replace(/reduced/i, "increased")));
    negative = ids.length > 0;
  }
  if (!ids.length) return null;
  return { text: mod, ids, value: valueOf(mod), negative };
}

/**
 * 文面から条件を引く (ジュエルなど計算機に無い物・計算機で作れない特殊な MOD の検索用。rare-query.ts)。
 * 数値をどこまで下げるかは rare-query.ts の側で決める。直せない行は missing に
 */
export function textStats(mods: readonly string[]): { lines: TextStat[]; missing: string[] } {
  const lines: TextStat[] = [];
  const missing: string[] = [];
  for (const mod of mods) {
    const st = statFor(mod);
    if (st) lines.push(st);
    else missing.push(mod);
  }
  return { lines, missing };
}
