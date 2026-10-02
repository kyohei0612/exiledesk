/**
 * ユニーク装備価格推移の取得・状態 (2026-09-26)
 *
 * オーナー指示:「価格推移を知りたいから、カレンシーランキングと同じように作って欲しい。
 * グラフで分かりやすくトレース、UI はシンプルで、値段順や高騰率で並び替えも」。
 * 2026-09-26 poe.ninja に乗せ換え (「丁度忍者使ってるしな」)。poe2scout はユニークの点がまばらだった。
 *   - 種類ごとの一覧 (8 種) を順に取る。一覧に 値段・7 日の推移・出品数 が入っているので、行ごとに取りに行かない
 *   - 日ごとの推移は行を開いた時だけ ([[useUniqueDetail.ts]])
 *   - お気に入り ([[unique-favorites.ts]]) はカテゴリ欄の一番上
 *   - 型・定数・行の変換・キャッシュは [[unique-trend-data.ts]] (2026-09-26 分割)
 *
 * 2026-10-03 カレンシーランキングのタブに統合 (オーナー「ユニーク装備価格推移はカレンシーランキングの中のタブに。
 * ランキング自体はカレンシーランキングと一緒の方が都合がいい。キャッシュの残り方すら一緒でいい」):
 *   - 状態はアプリで 1 つ (useUniqueTrend() は同じ物を返す)。カレンシーランキングの更新 (起動時 / 更新ボタン / タブを開いた時の
 *     5 分空けた自動更新 / リーグの切り替え) が refreshUniqueTrend() を呼び、同じ時にユニークの一覧も取り直す。
 *     お気に入りの最安値の自動取得 ([[unique-watch.ts]]) は別物のまま
 *   - 30 分の期限はやめた。起動時は前回の保存分をそのまま出し (「前回のデータ」)、取り直したら上書き (カレンシーランキングと同じ)
 *   - 自分では取りに行かない (前は開いた時 / リーグが変わった時に取っていた)。例外は、ユニークのタブを開いたのに何も無い時だけ load()
 */
import { recordHistory } from "../../services/history";
import { computed, ref, shallowRef, watch } from "vue";
import { fetchNinjaOverview, NINJA_UNIQUE_KINDS, type NinjaUniqueKind } from "../../api/ninja-economy";
import { marketStore } from "../../state/market-store";
import { uniqueFavorites } from "../../state/unique-favorites";
import type { CategoryDisplay } from "../currency/useCurrencyRanking";
import {
  cache,
  CAT_OF,
  FAV_CATEGORY,
  LIMIT_STEP,
  loadLs,
  loadLsAny,
  saveLs,
  sparkOf,
  THIN_LISTINGS,
  toRow,
  type KindCache,
  type SortKey,
  type UniqueRow,
  type UniqueTrend,
} from "./unique-trend-data";

export { FAV_CATEGORY, SORT_OPTIONS, type SortKey, type UniqueRow, type UniqueTrend } from "./unique-trend-data";

function createUniqueTrend() {
  const categoryFilter = ref<string>("all");
  const searchQuery = ref<string>("");
  const sortKey = ref<SortKey>("price");
  /** 取れた種類の一覧 (取った順に増える) */
  const byKind = shallowRef(new Map<NinjaUniqueKind, KindCache>());
  const loading = ref(false);
  /** 取っている途中の種類 (画面の「◯◯を取得中」) */
  const loadingKind = ref<NinjaUniqueKind | null>(null);
  const progress = ref({ done: 0, total: 0 });
  const error = ref<string | null>(null);
  const fetchedAt = ref<number | null>(null);
  /** 表示中の内容が前回の保存分か (取り直すまで true)。画面に「前回のデータ」と出す (カレンシーランキングと同じ) */
  const fromCache = ref(false);
  let gen = 0;

  const league = computed(() => marketStore.league.value?.Value ?? "");

  const rows = computed<UniqueRow[]>(() => [...byKind.value.values()].flatMap((c) => c.rows));
  const trends = computed(() => {
    const m = new Map<number, UniqueTrend>();
    for (const c of byKind.value.values()) for (const [k, v] of c.trends) m.set(k, v);
    return m;
  });

  const favCount = computed(() => rows.value.filter((r) => uniqueFavorites.set.value.has(r.fav)).length);
  const categories = computed<CategoryDisplay[]>(() => {
    const out: CategoryDisplay[] = [{ id: FAV_CATEGORY, count: favCount.value, icon: "", glyph: "♥" }];
    for (const { kind } of NINJA_UNIQUE_KINDS) {
      const c = byKind.value.get(kind);
      // 代表アイコンは一番高い物
      const top = c?.rows.reduce<UniqueRow | null>((a, b) => (!a || b.exalted > a.exalted ? b : a), null);
      out.push({ id: CAT_OF[kind], count: c?.rows.length ?? 0, icon: top?.icon ?? "" });
    }
    return out;
  });

  const filtered = computed<UniqueRow[]>(() => {
    let list = rows.value;
    const cat = categoryFilter.value;
    if (cat === FAV_CATEGORY) list = list.filter((r) => uniqueFavorites.set.value.has(r.fav));
    else if (cat !== "all") list = list.filter((r) => r.category === cat);
    const q = searchQuery.value.trim().toLowerCase();
    if (q) list = list.filter((r) => [r.nameJa, r.nameEn, r.baseJa, r.baseEn].some((s) => s.toLowerCase().includes(q)));
    return list;
  });

  /** 並び替え。高騰率 / 下落率は、1 神未満と出品の少ない物を後ろにする (安い物・薄い物の揺れが上を埋める) */
  const sorted = computed<UniqueRow[]>(() => {
    const list = filtered.value.slice();
    const tr = trends.value;
    switch (sortKey.value) {
      case "name":
        return list.sort((a, b) => a.nameJa.localeCompare(b.nameJa, "ja"));
      case "rise":
      case "fall": {
        const dir = sortKey.value === "rise" ? -1 : 1;
        const floor = marketStore.rates.value.divine || 1;
        const weak = (r: UniqueRow) => r.exalted < floor || r.listings < THIN_LISTINGS;
        return list.sort((a, b) => {
          if (weak(a) !== weak(b)) return weak(a) ? 1 : -1;
          const pa = tr.get(a.itemId)?.changePct;
          const pb = tr.get(b.itemId)?.changePct;
          if (pa == null || pb == null) return pa == null && pb == null ? b.exalted - a.exalted : pa == null ? 1 : -1;
          return dir * (pa - pb) || b.exalted - a.exalted;
        });
      }
      default:
        return list.sort((a, b) => b.exalted - a.exalted);
    }
  });

  const limit = ref(LIMIT_STEP);
  const shown = computed(() => sorted.value.slice(0, limit.value));
  function more(): void {
    limit.value += LIMIT_STEP;
  }

  /** 起動直後に前回の保存分を出す (リーグがまだ分からなくても出す。取り直したら上書き) */
  function hydrateFromCache(): void {
    const got = loadLsAny();
    if (!got) return;
    cache.set(got.league, got.kinds);
    byKind.value = new Map(got.kinds);
    fetchedAt.value = Math.min(...[...got.kinds.values()].map((c) => c.at));
    fromCache.value = true;
  }

  /**
   * 種類を順に取る。force = 全部取り直す (カレンシーランキングの更新と同じ時) / false = そのリーグでまだ無い種類だけ。
   * 今見ているカテゴリの種類から先に
   */
  async function fetchAll(force: boolean): Promise<void> {
    const lg = league.value;
    if (!lg) return;
    const my = ++gen;
    let lcache = cache.get(lg);
    if (!lcache) {
      lcache = loadLs(lg) ?? new Map();
      cache.set(lg, lcache);
    }
    const lc = lcache;
    byKind.value = new Map(lc);
    const first = (k: NinjaUniqueKind) => Number(CAT_OF[k] === categoryFilter.value);
    const want = NINJA_UNIQUE_KINDS.map((k) => k.kind).sort((a, b) => first(b) - first(a));
    const todo = want.filter((k) => force || !lc.has(k));
    if (!todo.length) {
      fetchedAt.value = Math.min(...[...lc.values()].map((c) => c.at));
      return;
    }
    loading.value = true;
    error.value = null;
    progress.value = { done: 0, total: todo.length };
    try {
      for (const kind of todo) {
        if (my !== gen) return;
        loadingKind.value = kind;
        progress.value = { done: todo.indexOf(kind), total: todo.length };
        try {
          const ov = await fetchNinjaOverview(lg, kind);
          if (my !== gen) return;
          const exPerDiv = ov.exaltedPerDivine || marketStore.rates.value.divine || 1;
          const kRows: UniqueRow[] = [];
          const kTrends = new Map<number, UniqueTrend>();
          for (const l of ov.lines) {
            const r = toRow(kind, l, exPerDiv);
            if (!r) continue;
            kRows.push(r);
            const spark = l.sparkLine ? sparkOf(l.sparkLine.data) : [];
            if (spark.length >= 2) kTrends.set(r.itemId, { spark, changePct: l.sparkLine!.totalChange, qty: r.listings, points: [] });
          }
          lc.set(kind, { at: Date.now(), rows: kRows, trends: kTrends });
          byKind.value = new Map(lc);
          saveLs(lg, lc);
          fromCache.value = false;
        } catch (e) {
          error.value = `${NINJA_UNIQUE_KINDS.find((k) => k.kind === kind)?.ja ?? kind}: ${String(e)}`;
        }
      }
      fetchedAt.value = Date.now();
      recordHistory("unique-trend", "fetch", { league: league.value, error: error.value, kinds: [...byKind.value.entries()].map(([k, v]) => ({ kind: k, rows: v.rows.length })) });
    } finally {
      if (my === gen) {
        loading.value = false;
        loadingKind.value = null;
      }
    }
  }

  /** 何も無い時の保険 (ユニークのタブを開いたのに空): リーグと換算レート (相場ストア) を揃えてから、無い種類だけ取る */
  async function load(): Promise<void> {
    await marketStore.ensureMarket();
    await fetchAll(false);
  }

  /** 全部取り直す。カレンシーランキングの更新と同じきっかけで呼ばれる (ユニークのタブの「更新」ボタンも同じ) */
  async function refresh(): Promise<void> {
    await marketStore.ensureMarket();
    await fetchAll(true);
  }

  watch([categoryFilter, searchQuery], () => (limit.value = LIMIT_STEP));

  const loadingLabel = computed(() => {
    const k = loadingKind.value;
    if (!k) return null;
    const ja = NINJA_UNIQUE_KINDS.find((x) => x.kind === k)?.ja ?? k;
    return `${ja}を取得中 (${progress.value.done + 1}/${progress.value.total})`;
  });

  hydrateFromCache();

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
    loading,
    loadingLabel,
    error,
    fetchedAt,
    fromCache,
    categoryFilter,
    searchQuery,
    sortKey,
    load,
    refresh,
  };
}

/** アプリで 1 つ (画面とカレンシーランキングの更新が同じ物を見る) */
let shared: ReturnType<typeof createUniqueTrend> | null = null;
export function useUniqueTrend() {
  shared ??= createUniqueTrend();
  return shared;
}

/**
 * カレンシーランキングの更新 (useCurrencyRanking.refresh) から呼ぶ: ユニークの一覧も同じ時に取り直す。
 * 待たせない (poe.ninja は 8 種類で 20 秒ほど。カレンシーランキングの表示を遅らせない)
 */
export function refreshUniqueTrend(): void {
  const u = useUniqueTrend();
  if (u.loading.value) return;
  void u.refresh();
}
