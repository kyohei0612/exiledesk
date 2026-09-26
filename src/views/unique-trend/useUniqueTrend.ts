/**
 * ユニーク装備価格推移の取得・状態 (2026-09-26)
 *
 * オーナー指示:「価格推移を知りたいから、カレンシーランキングと同じように作って欲しい。
 * グラフで分かりやすくトレース、UI はシンプルで、値段順や高騰率で並び替えも」。
 *   - 価格表は相場ストア (poe2scout /Items) をそのまま使う。ユニークは ApiId が無い行
 *   - 7 日の推移は 1 件ずつ `/Items/{id}/History` を取る (一括 PriceHistory は約 24 時間しか無いため)
 *   - 取引所 (trade2) には開いただけでは投げない。詳細の「取引所で即時購入の最安を取る」だけ
 */
import { computed, reactive, ref, watch } from "vue";
import { fetchItemHistory, type CurrencyItem, type HistoryPoint } from "../../api/poe2scout";
import { marketStore } from "../../state/market-store";
import { jaTypeName, jaUniqueName } from "../../services/trade2/localize";
import type { CategoryDisplay } from "../currency/useCurrencyRanking";

export interface UniqueRow {
  itemId: number;
  nameEn: string;
  nameJa: string;
  baseEn: string;
  baseJa: string;
  category: string;
  icon: string;
  /** 高貴建て */
  exalted: number;
}

/** 7 日の推移 (古→新)。changePct は窓の最初と最後の比、qty は最新点の出品数 */
export interface UniqueTrend {
  spark: number[];
  changePct: number;
  qty: number | null;
  points: HistoryPoint[];
}

export type SortKey = "price" | "rise" | "fall" | "name";
export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "price", label: "値段" },
  { key: "rise", label: "高騰率" },
  { key: "fall", label: "下落率" },
  { key: "name", label: "名前" },
];

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
/** 同時に取る本数 (poe2scout に制限の公開は無いので礼儀として控えめに) */
const CONC = 6;

/** poe2scout の行 → ユニークの行。Name が無い物 (ベースだけの行) は落とす */
function toRow(it: CurrencyItem): UniqueRow | null {
  if (it.ApiId || typeof it.CurrentPrice !== "number" || it.CurrentPrice <= 0) return null;
  const nameEn = it.Name ?? "";
  if (!nameEn) return null;
  const baseEn = it.Type ?? (it.Text.startsWith(nameEn) ? it.Text.slice(nameEn.length).trim() : "");
  return {
    itemId: it.ItemId,
    nameEn,
    nameJa: jaUniqueName(nameEn),
    baseEn,
    baseJa: baseEn ? jaTypeName(baseEn) : "",
    category: it.CategoryApiId,
    icon: it.IconUrl,
    exalted: it.CurrentPrice,
  };
}

/** 点列から 7 日窓の推移を作る (2 点未満なら null)。窓に 2 点無ければ全件で見る */
export function toTrend(points: HistoryPoint[]): UniqueTrend | null {
  if (points.length < 2) return null;
  const cutoff = points[points.length - 1].t - SEVEN_DAYS_MS;
  const recent = points.filter((p) => p.t >= cutoff);
  const series = recent.length >= 2 ? recent : points;
  const first = series[0].price;
  const last = series[series.length - 1].price;
  return {
    spark: series.map((p) => p.price),
    changePct: first > 0 ? ((last - first) / first) * 100 : 0,
    qty: series[series.length - 1].qty || null,
    points,
  };
}

/** 固定の並び (件数で毎回変わらないように)。知らないカテゴリは後ろに名前順 */
const CATEGORY_ORDER = ["weapon", "armour", "accessory", "flask", "jewel", "charm", "relic", "map", "waystone", "sanctum"];
function catIndex(id: string): number {
  const i = CATEGORY_ORDER.indexOf(id);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

export function useUniqueTrend() {
  const categoryFilter = ref<string>("all");
  const searchQuery = ref<string>("");
  const sortKey = ref<SortKey>("price");
  /** ItemId → 7 日の推移。取った物だけ入る */
  const trends = reactive(new Map<number, UniqueTrend>());
  /** 取りに行って取れなかった ItemId (何度も叩かない) */
  const failed = new Set<number>();
  const loadingTrends = ref(false);
  let trendLeague = "";

  const league = computed(() => marketStore.league.value?.Value ?? "");

  const rows = computed<UniqueRow[]>(() => {
    const out: UniqueRow[] = [];
    for (const it of marketStore.items.value) {
      const r = toRow(it);
      if (r) out.push(r);
    }
    return out;
  });

  const categories = computed<CategoryDisplay[]>(() => {
    const acc = new Map<string, { count: number; icon: string; top: number }>();
    for (const r of rows.value) {
      const e = acc.get(r.category);
      // 代表アイコンは一番高い物
      if (!e) acc.set(r.category, { count: 1, icon: r.icon, top: r.exalted });
      else {
        e.count += 1;
        if (r.exalted > e.top) Object.assign(e, { icon: r.icon, top: r.exalted });
      }
    }
    return Array.from(acc.entries())
      .map(([id, e]) => ({ id, count: e.count, icon: e.icon }))
      .sort((a, b) => catIndex(a.id) - catIndex(b.id) || a.id.localeCompare(b.id));
  });

  const filtered = computed<UniqueRow[]>(() => {
    let list = rows.value;
    if (categoryFilter.value !== "all") list = list.filter((r) => r.category === categoryFilter.value);
    const q = searchQuery.value.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.nameJa, r.nameEn, r.baseJa, r.baseEn].some((s) => s.toLowerCase().includes(q)),
      );
    }
    return list;
  });

  /** 並び替え。推移がまだ無い行は高騰率 / 下落率では後ろ (値段順) */
  const sorted = computed<UniqueRow[]>(() => {
    const list = filtered.value.slice();
    const pct = (r: UniqueRow) => trends.get(r.itemId)?.changePct;
    switch (sortKey.value) {
      case "name":
        return list.sort((a, b) => a.nameJa.localeCompare(b.nameJa, "ja"));
      case "rise":
      case "fall": {
        const dir = sortKey.value === "rise" ? -1 : 1;
        // 1 神未満は後ろ (2 → 35 高貴で +1650% のように、安い物の揺れが上を埋めていた。2026-09-26)
        const floor = marketStore.rates.value.divine || 1;
        const cheap = (r: UniqueRow) => r.exalted < floor;
        return list.sort((a, b) => {
          if (cheap(a) !== cheap(b)) return cheap(a) ? 1 : -1;
          const pa = pct(a);
          const pb = pct(b);
          if (pa == null || pb == null) return pa == null && pb == null ? b.exalted - a.exalted : pa == null ? 1 : -1;
          return dir * (pa - pb) || b.exalted - a.exalted;
        });
      }
      default:
        return list.sort((a, b) => b.exalted - a.exalted);
    }
  });

  /**
   * 推移を取るのは値段の高い順に上から LIMIT 件まで (「もっと見る」で増やす)。2026-09-26: 全件 (数百件) を開くたびに
   * poe2scout へ 1 件ずつ取りに行っていた。高騰率 / 下落率の並びも、この取れた範囲の中で並べる
   */
  const LIMIT_STEP = 50;
  const limit = ref(LIMIT_STEP);
  const byPrice = computed(() => filtered.value.slice().sort((a, b) => b.exalted - a.exalted));
  const inScope = computed(() => new Set(byPrice.value.slice(0, limit.value).map((r) => r.itemId)));
  /** 画面に出す行 (取る範囲の中を並び替えた物) */
  const shown = computed(() => sorted.value.filter((r) => inScope.value.has(r.itemId)));
  function more(): void {
    limit.value += LIMIT_STEP;
    void loadVisibleTrends();
  }
  /** 表示中の行の推移を並列で取る (取得済み / 失敗済みは飛ばす)。リーグが変わったら止める */
  async function loadVisibleTrends(): Promise<void> {
    const lg = league.value;
    if (!lg) return;
    if (trendLeague !== lg) {
      trends.clear();
      failed.clear();
      trendLeague = lg;
    }
    const todo = [...inScope.value].filter((id) => !trends.has(id) && !failed.has(id));
    if (!todo.length || loadingTrends.value) return;
    loadingTrends.value = true;
    let idx = 0;
    const worker = async () => {
      while (idx < todo.length) {
        const id = todo[idx++];
        if (league.value !== lg) return;
        const pts = await fetchItemHistory(lg, id);
        const t = pts ? toTrend(pts) : null;
        if (league.value !== lg) return;
        if (t) trends.set(id, t);
        else failed.add(id);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(CONC, todo.length) }, () => worker()));
    } finally {
      loadingTrends.value = false;
    }
    // 取っている間に絞り込みが変わっていたら残りを取る
    if ([...inScope.value].some((id) => !trends.has(id) && !failed.has(id))) void loadVisibleTrends();
  }

  /** 開いた時: 相場ストアが古ければ取り直し、表示中の推移を取る */
  async function load(): Promise<void> {
    await marketStore.ensureMarket();
    void loadVisibleTrends();
  }

  /** 更新ボタン: 価格表も推移も取り直す */
  async function refresh(): Promise<void> {
    await marketStore.refreshMarket();
    trends.clear();
    failed.clear();
    void loadVisibleTrends();
  }

  watch([categoryFilter, searchQuery], () => { limit.value = LIMIT_STEP; void loadVisibleTrends(); });

  return {
    league,
    rows,
    categories,
    filtered,
    sorted,
    shown,
    limit,
    more,
    trends,
    loadingTrends,
    categoryFilter,
    searchQuery,
    sortKey,
    load,
    refresh,
  };
}
