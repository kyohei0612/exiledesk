/**
 * 相場ストア (poe2scout) — アプリ全体で 1 つ (2026-09-12)
 *
 * カレンシーランキングと「ヴァールの天秤」の各ツールが同じリーグ一覧 / 価格表を共有する。
 *   - 現行リーグ (IsCurrent かつ非 HC) の全アイテム価格 (高貴建て) を保持
 *   - ensureMarket(): 未取得か 30 分より古ければ取り直す (各画面は起動時にこれを呼ぶだけ)
 *   - adopt(): カレンシーランキングが同じリーグを取った時にその結果を流用する (二重取得しない)
 *   - priceOf(apiId) / uniquePriceOf(nameEn) / rates: ツール側の素材価格・換算に使う
 * オーナー指示 (2026-09-12): 「カレンシーの管理がそのまま素材に自動反映される」ように、手入力は相場が無い物だけにする。
 */
import { computed, ref } from "vue";
import { fetchItems, fetchLeagues, type CurrencyItem, type League } from "../api/poe2scout";
import type { ExaltedRates } from "../services/trade2/pricing";

export const MARKET_MAX_AGE_MS = 30 * 60 * 1000;

const leagues = ref<League[]>([]);
const league = ref<League | null>(null);
const items = ref<CurrencyItem[]>([]);
const fetchedAt = ref<number | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
let inFlight: Promise<void> | null = null;

function pickCurrent(list: League[]): League | null {
  return list.find((l) => l.IsCurrent && !l.Value.startsWith("HC")) ?? list[0] ?? null;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const list = await fetchLeagues();
    leagues.value = list;
    const cur = pickCurrent(list);
    league.value = cur;
    items.value = cur ? await fetchItems(cur.Value) : [];
    fetchedAt.value = Date.now();
    error.value = null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

/** 未取得 or 古ければ取得。同時に呼ばれても 1 回しか走らない。 */
export function ensureMarket(maxAgeMs = MARKET_MAX_AGE_MS): Promise<void> {
  const fresh = fetchedAt.value != null && Date.now() - fetchedAt.value < maxAgeMs && items.value.length > 0;
  if (fresh) return Promise.resolve();
  if (!inFlight) {
    inFlight = load().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** 強制再取得 (ツール側の「更新」用) */
export function refreshMarket(): Promise<void> {
  fetchedAt.value = null;
  return ensureMarket();
}

/**
 * 他画面 (カレンシーランキング) が取った結果を流用する。現行リーグと同じリーグの時だけ採用。
 * ランキングは別リーグも選べるので、リーグ名が違えば無視する。
 */
export function adoptMarket(list: League[], leagueValue: string, fetched: CurrencyItem[]): void {
  if (list.length) leagues.value = list;
  const cur = pickCurrent(list.length ? list : leagues.value);
  if (!cur || cur.Value !== leagueValue) return;
  league.value = cur;
  items.value = fetched;
  fetchedAt.value = Date.now();
  error.value = null;
}

export function priceOf(apiId: string): number | null {
  const hit = items.value.find((it) => it.ApiId === apiId);
  return hit && typeof hit.CurrentPrice === "number" && hit.CurrentPrice > 0 ? hit.CurrentPrice : null;
}

/** ユニーク (ApiId 無し) を英名の先頭一致で引く。poe2scout の Text は "名前 ベース" 形式 */
export function uniquePriceOf(nameEn: string | null): number | null {
  if (!nameEn) return null;
  const hit = items.value.find((it) => !it.ApiId && it.Text.startsWith(nameEn));
  return hit && typeof hit.CurrentPrice === "number" && hit.CurrentPrice > 0 ? hit.CurrentPrice : null;
}

const rates = computed<ExaltedRates>(() => {
  const l = league.value;
  const divine = l?.DivinePrice || 1;
  const chaos = l && l.ChaosDivinePrice ? divine / l.ChaosDivinePrice : 1;
  const others: Record<string, number> = {};
  for (const it of items.value) {
    if (it.ApiId && typeof it.CurrentPrice === "number") others[it.ApiId] = it.CurrentPrice;
  }
  return { divine, chaos, others };
});

const fetchedLabel = computed<string>(() => {
  const t = fetchedAt.value;
  if (!t) return "未取得";
  const d = new Date(t);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")} 取得`;
});

export const marketStore = {
  leagues,
  league,
  items,
  fetchedAt,
  fetchedLabel,
  loading,
  error,
  rates,
  ensureMarket,
  refreshMarket,
  adoptMarket,
  priceOf,
  uniquePriceOf,
};
