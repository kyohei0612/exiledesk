/**
 * trade2 で「この条件の装備の最安値」を調べる (クラフト収支用、2026-09-07)
 *
 *   search (条件 → listing ID 列 + total) → fetch (先頭 10 件の詳細) → 価格を高貴 (Exalted) 建てに正規化 → 最安
 *
 * レート制限: 本番 (Tauri) は Rust 側の門番 (trade2.rs gate_acquire) が上限ヘッダを見て待つので、
 * ここは直列化と「再取得まで N 秒」の表示用の記録だけ (2026-09-18 に二重待ちをやめた)。
 * 開発時 (vite のプロキシで直接叩く) だけ、ここで最小間隔と窓の予算を守る。
 */

import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { invoke } from "@tauri-apps/api/core";
import { trade2Site, trade2SiteOrigin } from "./league";
import { localizeQueryForSite } from "./localize";

/**
 * ブラウザ (vite dev) で開いた時だけ vite のプロキシで直接叩く (Rust の門番を通らないので、ここで待つ)。
 * **アプリの中 (開発ビルドの Tauri) では門番を通す。**前は開発ビルドなら常にプロキシで、ログイン (POESESSID) が乗らず
 * 匿名の上限で「検索条件が複雑過ぎます」になっていた (2026-09-24。本番ビルドは最初から門番経由)
 */
const DEV_TRADE = import.meta.env.DEV && !isTauriRuntime();
import type { Trade2SearchResponse } from "./query";

/**
 * 連続リクエストの最小間隔 (ms)。search と fetch は別ポリシーなので別々に数える。
 * 2026-09-08 実測 (X-Rate-Limit-Ip, policy trade-search-request-limit):
 *   search = 5:10:60, 15:60:300, 30:300:1800, 600:21600:3600
 *   → 5 分で 30 回を超えると 30 分ペナルティ。2.5 秒間隔だと 75 秒で 429 (Retry-After 600) を食らった。
 * 今は検索 + 取得の合計を 5 分 22 回 (≈ 13.6 秒に 1 回、バースト 6) で流し、5 分の合計も見張る (本番は Rust の門番、
 * 開発ブラウザは下の DEV_COMBINED_INTERVAL_MS)。窓口ごとの間隔 (下の 2 つ) はその中の並び間隔。
 */
const SEARCH_INTERVAL_MS = 2600;
const FETCH_INTERVAL_MS = 2500;
/** 開発ブラウザの合計の間隔 (本番の門番の 300 秒 ÷ 22) */
const DEV_COMBINED_INTERVAL_MS = 13600;

/**
 * エラー文字列から「あと何秒待てば投げられるか」を取り出す。該当しなければ null。
 *   - 429: "... HTTP 429 retry-after=600: ..."
 *   - 門番の待ち切れ: "trade2 レート制限中 (あと 217 秒)。..." (2026-09-19: これを読まずに
 *     「trade2 エラー: …」と長文で出していた。秒数が読めれば普通の制限として数えられる)
 */
export function retryAfterSeconds(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m =
    msg.match(/HTTP 429 retry-after=(\d+)/) ??
    msg.match(/レート制限中 \(あと (\d+) 秒\)/) ??
    msg.match(/枠待ち \(あと (\d+) 秒\)/);
  return m ? Number(m[1]) : null;
}

/** 門番の「枠待ち」(自分の上限、罰則ではない) か。表示を「レート制限中」と分けるため (2026-09-19) */
export function isBudgetWait(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /枠待ち \(あと \d+ 秒\)/.test(msg);
}
/** fetch 1 回で見られる listing 数 (trade2 の上限 = 10) */
const FETCH_CHUNK = 10;
/** 既定で見る listing 数 (最安 10 件) */
const FETCH_TOP_N = 10;

const lastRequestAt = { search: 0, fetch: 0 };
let chain: Promise<unknown> = Promise.resolve();

/**
 * 門番 (Rust の trade2.rs `gate_status`) の状態の写し。**画面の数字はこれだけを見る**。
 *
 * 2026-09-19 のリファクタ以前は、ここに「画面から出した search だけを数える別の帳簿」
 * (窓ごとの予算 + 応答ヘッダの同期 + localStorage) があり、裏の巡回がどれだけ枠を使っても
 * 動かない数字をボタンに出していた。実際に投げる間隔を決めているのは門番 1 つなので、
 * 表示もそこから貰う。開発モード (vite プロキシ = 門番を通らない) だけ下の一定間隔で守る。
 */
export interface GateState {
  /** 罰則 (429) の解除予定 (ms)。0 = 止まっていない。**これだけが「止まっている」** */
  penaltyUntilMs: number;
  /** 次の 1 本を投げられる時刻 (ms)。順番待ちであって止まりではない */
  nextAtMs: number;
  /** 直近 5 分に全窓口あわせて送った数 / 今の上限 */
  used: number;
  max: number;
}

let gateSnapshot: (GateState & { at: number }) | null = null;

export function noteGateState(s: GateState): void {
  gateSnapshot = { ...s, at: Date.now() };
}

/** 古い値で表示し続けないよう、30 秒で捨てる */
function gateNow(): GateState | null {
  const g = gateSnapshot;
  return g && Date.now() - g.at < 30_000 ? g : null;
}

/** 罰則で止まっている解除予定 (ms)。止まっていなければ 0 */
export function gatePenaltyUntilMs(): number {
  return gateNow()?.penaltyUntilMs ?? 0;
}

/** 次に投げられる時刻 (ms)。画面の「再取得まで N 秒」用 */
export function nextSearchAllowedAt(): number {
  if (!DEV_TRADE) {
    // 本番: 門番の予定だけ。まだ読めていない起動直後は「待ち無し」(押せば門番が待つ)
    return gateNow()?.nextAtMs ?? 0;
  }
  return lastRequestAt.search + SEARCH_INTERVAL_MS;
}

/** 直近 5 分の送信回数と上限 (画面表示用) */
export function searchBudgetUsage(): { used: number; max: number } {
  const g = gateNow();
  return g ? { used: g.used, max: g.max } : { used: 0, max: 0 };
}

/**
 * 直列化 + (開発時だけ) エンドポイント別の最小間隔。
 * 本番は Rust の門番が間隔もバーストも決めるので、ここで待つと二重になる
 */
function throttled<T>(kind: "search" | "fetch", fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    if (DEV_TRADE) {
      // 開発ブラウザ (門番を通らない) は検索と取得を合わせて 13.6 秒に 1 本 (本番の門番の合計の間隔と同じ。2026-09-26 レビュー:
      // 窓口ごとに 2.6 秒空けるだけで、クラフト計算機の全検索で隠れた合計の上限を超えて IP ごと罰則を受け得た)
      void kind; void SEARCH_INTERVAL_MS; void FETCH_INTERVAL_MS;
      const wait = Math.max(lastRequestAt.search, lastRequestAt.fetch) + DEV_COMBINED_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    lastRequestAt[kind] = Date.now();
    return fn();
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

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
}

/** fetch 結果の 1 件から MOD の数を読む */
function modCountsOf(item: FetchItem | undefined): Pick<PriceListing, "mods" | "prefixes" | "suffixes"> {
  if (!item) return { mods: null, prefixes: null, suffixes: null };
  const lines = (item.explicitMods?.length ?? 0) + (item.fracturedMods?.length ?? 0) + (item.desecratedMods?.length ?? 0);
  return {
    mods: item.explicitMods || item.fracturedMods || item.desecratedMods ? lines : null,
    prefixes: typeof item.extended?.prefixes === "number" ? item.extended.prefixes : null,
    suffixes: typeof item.extended?.suffixes === "number" ? item.extended.suffixes : null,
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
      extended?: { prefixes?: number; suffixes?: number };
    };
    listing?: { account?: { name?: string }; price?: { amount?: number; currency?: string; type?: string }; indexed?: string };
  }>;
}

/** 検索 1 回 (直列化 + 間隔ガード) */
/**
 * dev (vite) では Tauri が無いので、vite のプロキシ (/api/trade2-www, /api/trade2-jp) 経由で直接叩く。
 * 本番は Rust の trade2_search / trade2_fetch。429 は Rust 側と同じ "HTTP 429 retry-after=N" 形式で投げる。
 */
async function devJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const rl: Record<string, string> = {};
  r.headers.forEach((v, k) => {
    if (k.toLowerCase().startsWith("x-rate-limit-")) rl[k.toLowerCase()] = v;
  });
  if (r.status === 429) throw new Error(`HTTP 429 retry-after=${r.headers.get("retry-after") ?? "60"} ratelimit=${JSON.stringify(rl)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const body = (await r.json()) as T;
  if (body && typeof body === "object") (body as unknown as { _ratelimit?: Record<string, string> })._ratelimit = rl;
  return body;
}

async function searchOnce(league: string, body: unknown): Promise<Trade2SearchResponse> {
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
  return throttled("search", () => invoke<Trade2SearchResponse>("trade2_search", { req: { league, query, site } }));
}

/**
 * search 結果の先頭 N 件を fetch して最安 (高貴建て) をまとめる。
 *
 * topN は 10 を超えられる (trade2 の fetch は 1 回 10 件までなので 10 件ずつに割って投げる)。
 * オーナー指示 2026-09-19:「現物のトレードサイトの奴は 50 個、最安値から取得して」
 * — 素材として N 個買う時の合計は「最安 1 件 × N」ではなく**最安から N 件の合計**なので、
 * 積み上げられるだけの深さが要る。
 */
async function fetchListings(league: string, search: Trade2SearchResponse, rates: ExaltedRates, topN = FETCH_TOP_N): Promise<PriceResult> {
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
      : await throttled("fetch", () => invoke<FetchResponse>("trade2_fetch", { req: { ids: chunk, queryId: search.id, site } }));
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

/**
 * 任意の検索クエリ (buildGemQuery 等) の最安値。search 1 回 + fetch 1 回。
 * ジェムコラプト収支 (2026-09-12) 用。
 */
export async function priceMinForQuery(league: string, body: unknown, rates: ExaltedRates, topN = FETCH_TOP_N): Promise<PriceResult> {
  const search = await searchOnce(league, body);
  return fetchListings(league, search, rates, topN);
}
