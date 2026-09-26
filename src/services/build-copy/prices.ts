/**
 * 忍者ビルドコピーの値段 (2026-09-26)
 *
 * - ユニーク: poe.ninja の相場 (ユニーク装備価格推移と同じ一覧。ここはルーンの熟達品などの行も残す)。名前 + ベースで引き、無ければ名前だけ
 * - ルーン / ソウルコア / リネージュサポート: カレンシーランキングの相場 (poe2scout)
 * - レア: 相場は取らない (取引所に通信しない)。検索のリンクは rare-query.ts
 * 取引所へはどれも即時購入 (status: securable) で開く。
 */
import { fetchNinjaOverview, NINJA_UNIQUE_KINDS } from "../../api/ninja-economy";
import { marketStore } from "../../state/market-store";
import { SecurityStatus } from "../../constants/trade2";


// ---- ユニーク (poe.ninja) ----
interface UniquePrice { exalted: number; listings: number }
let uniqueMap: Map<string, UniquePrice> | null = null;
let uniqueAt = 0;
let uniqueLoading: Promise<void> | null = null;
const UNIQUE_TTL = 30 * 60 * 1000;

/** 8 種類の一覧を取る (30 分覚える)。poe.ninja のゲートを通るので 20 秒ほど */
export function loadUniquePrices(onProgress?: (done: number, total: number) => void): Promise<void> {
  if (uniqueMap && Date.now() - uniqueAt < UNIQUE_TTL) return Promise.resolve();
  uniqueLoading ??= (async () => {
    const lg = marketStore.league.value?.Value ?? "";
    const m = new Map<string, UniquePrice>();
    let done = 0;
    for (const { kind } of NINJA_UNIQUE_KINDS) {
      try {
        const ov = await fetchNinjaOverview(lg, kind);
        const per = ov.exaltedPerDivine || marketStore.rates.value.divine || 1;
        for (const l of ov.lines) {
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
    uniqueAt = Date.now();
  })().finally(() => (uniqueLoading = null));
  return uniqueLoading;
}

export function uniquePrice(name: string, base: string): UniquePrice | null {
  return uniqueMap?.get(`${name}|${base}`) ?? uniqueMap?.get(name) ?? null;
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

/** 1 つの MOD → 明示の番号と、条件の値 (reduced は increased の側を負の値で) */
function statFor(mod: string): { ids: string[]; value?: { min?: number; max?: number } } | null {
  const d = statText ?? {};
  const v = valueOf(mod);
  const pick = (k: string) => (d[k] ?? []).filter((id) => id.startsWith("explicit."));
  let ids = pick(statKey(mod));
  let negative = false;
  if (!ids.length && /reduced/i.test(mod)) {
    ids = pick(statKey(mod.replace(/reduced/i, "increased")));
    negative = ids.length > 0;
  }
  if (!ids.length) return null;
  if (v == null || v < 1) return { ids };
  const lim = Math.floor(v * 0.8);
  return { ids, value: negative ? { max: -lim } : { min: lim } };
}

/**
 * 文面から条件を作る (ジュエルなど計算機に無い物の検索用。rare-query.ts)。数値は 8 割以上 (reduced は負の値の上限)。
 * 直せない行は missing に
 */
export function textStats(mods: readonly string[]): { filters: Array<{ id: string; value?: { min?: number; max?: number } }>; used: number; missing: string[] } {
  const filters: Array<{ id: string; value?: { min?: number; max?: number } }> = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  let used = 0;
  for (const mod of mods) {
    const st = statFor(mod);
    if (!st) {
      missing.push(mod);
      continue;
    }
    used++;
    for (const id of st.ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      filters.push(st.value ? { id, value: st.value } : { id });
    }
  }
  return { filters, used, missing };
}
