/**
 * 検索 1 回と出品の取得、価格の高貴 (Exalted) 建てへの換算
 *
 * pricing.ts から切り出し (2026-09-26)。
 */
import { invoke } from "@tauri-apps/api/core";
import { trade2Site, trade2SiteOrigin } from "../league";
import { localizeQueryForSite } from "../localize";
import type { Trade2SearchResponse } from "../query";
import { DEV_TRADE, devJson, throttled } from "./gate";

/** fetch 1 回で見られる listing 数 (trade2 の上限 = 10) */
const FETCH_CHUNK = 10;
/** 既定で見る listing 数 (最安 10 件) */
export const FETCH_TOP_N = 10;

/** 通貨 → 高貴 (Exalted) 換算レート。exalted=1、divine / chaos は poe2scout のリーグ情報、他は poe2scout の価格表 */
export interface ExaltedRates {
  /** 1 神 = ? 高貴 */
  divine: number;
  /** 1 カオス = ? 高貴 */
  chaos: number;
  /** その他通貨 (trade2 の currency id = poe2scout の ApiId) → 高貴 */
  others?: Record<string, number>;
}

export function toExalted(amount: number, currency: string, rates: ExaltedRates): number | null {
  switch (currency) {
    case "exalted":
      return amount;
    case "divine":
      return amount * rates.divine;
    case "chaos":
      return amount * rates.chaos;
    default: {
      const r = rates.others?.[currency];
      return r ? amount * r : null;
    }
  }
}

export interface PriceListing {
  /** trade2 の listing ID (捌き速度の消失率に使う) */
  id: string;
  amountExalted: number;
  amount: number;
  currency: string;
  account: string;
  /** trade2 の item.name + typeLine */
  itemName: string;
  ilvl: number | null;
  /** 出品時刻 (RFC3339)。売れ行きの滞留時間に使う (2026-09-16) */
  indexed: string | null;
  /** 値段の種類 ("~b/o" 即決 / "~price" 固定価格 など) */
  priceType?: string | null;
  /**
   * MOD の数 (2026-09-23、樹 MOD の自前固定の判定に使う)。
   *
   * `mods` は明示 + 固定済み + 冒涜の行数。`prefixes` / `suffixes` は取引所が `extended` に
   * 載せていれば入る (載っていなければ null)。固定の確率は総数だけで決まるので、`mods` が要。
   */
  mods?: number | null;
  prefixes?: number | null;
  suffixes?: number | null;
  /** マジックか (frameType 1 / rarity "Magic")。読めなければ null */
  magic?: boolean | null;
}

/** fetch 結果の 1 件から MOD の数を読む */
function modCountsOf(item: FetchItem | undefined): Pick<PriceListing, "mods" | "prefixes" | "suffixes" | "magic"> {
  if (!item) return { mods: null, prefixes: null, suffixes: null, magic: null };
  const lines = (item.explicitMods?.length ?? 0) + (item.fracturedMods?.length ?? 0) + (item.desecratedMods?.length ?? 0);
  return {
    mods: item.explicitMods || item.fracturedMods || item.desecratedMods ? lines : null,
    prefixes: typeof item.extended?.prefixes === "number" ? item.extended.prefixes : null,
    suffixes: typeof item.extended?.suffixes === "number" ? item.extended.suffixes : null,
    magic: item.frameType === 1 || item.rarity === "Magic" ? true : item.frameType != null || item.rarity != null ? false : null,
  };
}

export interface PriceResult {
  total: number;
  /** 高貴建て最安 (換算不能な通貨のみだった場合 null) */
  minExalted: number | null;
  listings: PriceListing[];
  /** fetch した最安 N 件の listing ID (値段が取れている分) */
  listingIds?: string[];
  /**
   * search が返した ID 一覧すべて (最大 100)。捌き速度の生存確認に使う。
   *
   * 最安 10 件だけで生死を判定すると、同値の出品が新しく入っただけで
   * 窓から押し出された物を「売れた」と誤判定する (2026-09-17 実データで確認)。
   */
  allIds?: string[];
  /** trade2 サイトで同じ検索を開く URL */
  searchUrl: string;
  /** この検索の query id (行方不明の出品を直接 fetch して確認するのに使う) */
  queryId?: string;
  /**
   * 出品がスピリットをリザーブしていたか (= スピリットジェムの原石で作るジェム)。
   * null は「出品が無くて読めなかった」。詳細は state/gem-spirit.ts
   */
  reservesSpirit?: boolean | null;
}

type FetchItem = NonNullable<NonNullable<FetchResponse["result"]>[number]["item"]>;

interface FetchResponse {
  result?: Array<{
    id?: string;
    item?: {
      name?: string; typeLine?: string; ilvl?: number;
      explicitMods?: string[]; fracturedMods?: string[]; desecratedMods?: string[];
      frameType?: number; rarity?: string;
      extended?: { prefixes?: number; suffixes?: number };
    };
    listing?: { account?: { name?: string }; price?: { amount?: number; currency?: string; type?: string }; indexed?: string };
  }>;
}

/**
 * 検索 1 回 (直列化 + 間隔ガード)。
 * patient: 裏で回る取得 (監視に入れた直後の取得など)。門番 (trade2.rs) が枠が空くまで長く待つ (画面の取得は 90 秒で諦める)。
 * 2026-09-26: 監視に入れた直後の取得が画面用の窓口で投げ、枠待ちで断られては 5 秒ごとに投げ直して空回りしていた
 */
export async function searchOnce(league: string, body: unknown, patient = false): Promise<Trade2SearchResponse> {
  // JP サイト設定なら JP の API に日本語名で投げる (検索 ID を JP サイトで開けるようにする)
  const site = trade2Site();
  const query = localizeQueryForSite(body);
  if (DEV_TRADE) {
    return throttled("search", () =>
      devJson<Trade2SearchResponse>(`/api/trade2-${site}/search/poe2/${encodeURIComponent(league)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      }),
    );
  }
  return throttled("search", () => invoke<Trade2SearchResponse>("trade2_search", { req: { league, query, site, patient } }), { patient });
}

/**
 * search 結果の先頭 N 件を fetch して最安 (高貴建て) をまとめる。
 *
 * topN は 10 を超えられる (trade2 の fetch は 1 回 10 件までなので 10 件ずつに割って投げる)。
 * オーナー指示 2026-09-19:「現物のトレードサイトの奴は 50 個、最安値から取得して」
 * — 素材として N 個買う時の合計は「最安 1 件 × N」ではなく**最安から N 件の合計**なので、
 * 積み上げられるだけの深さが要る。
 */
export async function fetchListings(league: string, search: Trade2SearchResponse, rates: ExaltedRates, topN = FETCH_TOP_N, patient = false): Promise<PriceResult> {
  const searchUrl = search.id
    ? `${trade2SiteOrigin()}/trade2/search/poe2/${encodeURIComponent(league)}/${search.id}`
    : "";
  const ids = (search.result ?? []).slice(0, topN);
  if (ids.length === 0 || !search.id) {
    return { total: search.total ?? 0, minExalted: null, listings: [], listingIds: [], allIds: search.result ?? [], searchUrl, queryId: search.id };
  }
  const site = trade2Site();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) chunks.push(ids.slice(i, i + FETCH_CHUNK));
  const results: FetchResponse["result"] = [];
  for (const chunk of chunks) {
    const part = DEV_TRADE
      ? await throttled("fetch", () => devJson<FetchResponse>(`/api/trade2-${site}/fetch/${chunk.join(",")}?query=${encodeURIComponent(search.id!)}`))
      : await throttled("fetch", () => invoke<FetchResponse>("trade2_fetch", { req: { ids: chunk, queryId: search.id, site, patient } }), { patient });
    for (const r of part.result ?? []) results.push(r);
  }
  const fetched: FetchResponse = { result: results };
  const listings: PriceListing[] = [];
  // 出品の properties に「リザーブ … Spirit」があれば、そのジェムはスピリットジェムの原石で作る。
  // 日本語サイトでも値は `100[Spirit|スピリット]` の形なので Spirit で拾える (2026-09-19)
  let seen = 0;
  let reserves = false;
  for (const r of fetched.result ?? []) {
    seen++;
    if (propsHaveSpiritReservation(r.item)) reserves = true;
    const amount = r.listing?.price?.amount;
    const currency = r.listing?.price?.currency;
    const priceType = r.listing?.price?.type ?? null;
    if (typeof amount !== "number" || !currency) continue;
    const ex = toExalted(amount, currency, rates);
    listings.push({
      id: r.id ?? "",
      amountExalted: ex ?? Number.POSITIVE_INFINITY,
      amount,
      currency,
      account: r.listing?.account?.name ?? "",
      itemName: [r.item?.name, r.item?.typeLine].filter(Boolean).join(" "),
      ilvl: r.item?.ilvl ?? null,
      indexed: r.listing?.indexed ?? null,
      priceType,
      ...modCountsOf(r.item),
    });
  }
  const finite = listings.filter((l) => Number.isFinite(l.amountExalted)).map((l) => l.amountExalted);
  return {
    total: search.total ?? 0,
    minExalted: finite.length ? Math.min(...finite) : null,
    listings: listings.sort((a, b) => a.amountExalted - b.amountExalted),
    listingIds: ids,
    allIds: search.result ?? [],
    searchUrl,
    queryId: search.id,
    reservesSpirit: seen > 0 ? reserves : null,
  };
}

/** 出品の properties に スピリットのリザーブ が出ているか */
function propsHaveSpiritReservation(item: unknown): boolean {
  const props = (item as { properties?: { name?: string; values?: unknown[][] }[] } | undefined)?.properties;
  if (!Array.isArray(props)) return false;
  return props.some((p) =>
    (p.values ?? []).some((v) => typeof v?.[0] === "string" && /Spirit/i.test(v[0] as string)),
  );
}
