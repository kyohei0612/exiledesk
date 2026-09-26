/**
 * カレンシーランキングの取得・状態 (poe2scout)
 *
 * CurrencyRanking.vue から切り出し (2026-09-07)。
 *   - refresh(): リーグ一覧 → 価格 / 24h 履歴 / スナップショット時刻 → 基準レート 7 日 → 表示中の 7 日
 *   - filteredRanking: カテゴリ + 検索で絞り、神換算降順
 */
import { computed, reactive, ref, watch } from "vue";
import {
  fetchItems,
  buildRankedItems,
  fetchSnapshotPairs,
  bestPayByApiId,
  fetchLeagues,
  fetchPriceTrends,
  fetchItemTrend7d,
  fetchLatestSnapshotEpoch,
  type RankedItem,
  type ItemTrend,
  type League,
} from "../../api/poe2scout";
import { jaCurrency } from "../../i18n/currencies-ja";
import { adoptMarket } from "../../state/market-store";
import { categoryOrderIndex } from "./format";

export interface CategoryDisplay {
  id: string;
  count: number;
  icon: string;
  /** アイコンの代わりに出す 1 文字 (お気に入りの ♥ など) */
  glyph?: string;
}

/** 前回の表示内容を残しておく場所 (取得中に画面が真っ白になるのを防ぐ) */
const CACHE_KEY = "exiledesk.currency.snapshot";
const CACHE_VERSION = 1;
interface Snapshot {
  v: number;
  league: string;
  leagues: League[];
  ranking: RankedItem[];
  snapshotEpoch: number | null;
  savedAt: number;
}

export function useCurrencyRanking() {
  const leagues = ref<League[]>([]);
  // 初期値は空。refresh() の初回で必ず現行リーグ (IsCurrent 非HC) を自動選択させるため
  // (過去リーグ名を既定にすると一覧に存在してしまい現行へ切替わらない不具合になる)。
  const league = ref<string>("");
  const divinePrice = ref<number>(1);
  const chaosDivinePrice = ref<number>(1); // 1 神 = X カオス (通常 >1)
  const divineIcon = ref<string>("");
  const chaosIcon = ref<string>("");
  const exaltedIcon = ref<string>("");
  const ranking = ref<RankedItem[]>([]);
  // ItemId → 直近 24 時間トレンド (一括 PriceHistory)。即時フォールバック用。
  const trends = ref<Map<number, ItemTrend>>(new Map());
  // ItemId → 本物の 7 日トレンド (個別履歴を表示中アイテムだけ取得)。reactive で逐次反映。
  const trend7d = reactive(new Map<number, ItemTrend>());
  const loading7d = ref(false);
  // 基準レートは「本物の 7 日」を個別履歴から取得 (一括は ~24 時間しか無いため)。
  // 神→高貴 / 神→カオス / カオス→高貴 をそれぞれ別グラフで表示 (オーナー指示 2026-06-04)。
  const divineVsExalted = ref<ItemTrend | null>(null);
  const divineVsChaos = ref<ItemTrend | null>(null);
  const chaosVsExalted = ref<ItemTrend | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const lastUpdated = ref<Date | null>(null);
  // poe2scout の最新スナップショット実時刻 (Epoch 秒)。鮮度の可視化用 (取得 = PC 時刻とは別)。
  const snapshotEpoch = ref<number | null>(null);
  // リーグ自動判定に失敗した時の警告 (前リーグのまま黙って表示する事故を防ぐ)。
  const leagueWarning = ref<string | null>(null);
  // 初期表示は「通貨 (currency)」固定 (オーナー指示 2026-05-22: 通貨欄はルーン/ジェム/エッセンスを混ぜない)
  // 2026-09-09: 既定はゲーム内取引所の「カレンシー」(x:Currency)
  const categoryFilter = ref<string>("x:Currency");
  const searchQuery = ref<string>("");

  /** 表示中の内容が前回の保存分か (更新が終わるまで true)。画面に「前回のデータ」と出す */
  const fromCache = ref(false);
  /** 自動更新を見送った理由 (画面に出す) */
  const autoNote = ref("");

  /**
   * タブを開いた時の自動更新の最短間隔 (オーナー指示 2026-09-17: 取引履歴と同じ作りに)。
   *
   * poe2scout は公開されている制限が無いので、こちらで礼儀として間隔を決める。
   * 1 回の更新でリーグ一覧 + 価格表 + 履歴 + 基準レート 3 本と、それなりに叩くため。
   */
  const AUTO_MIN_GAP_MS = 5 * 60_000;

  /**
   * 前回の取得結果を保存する。
   *
   * オーナー指摘 (2026-09-17):「更新中でも前のキャッシュを読み込んで表示してほしい。
   * 何も表示がない現象をやめたい」。トレンド (履歴) は数秒で埋まり量も多いので保存しない。
   */
  function saveSnapshot() {
    try {
      const snap: Snapshot = {
        v: CACHE_VERSION,
        league: league.value,
        leagues: leagues.value,
        ranking: ranking.value,
        snapshotEpoch: snapshotEpoch.value,
        savedAt: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(snap));
    } catch {
      /* 容量超過などで保存できなくても表示は続く */
    }
  }

  /**
   * タブを開いた時に呼ぶ。前回の取得から AUTO_MIN_GAP_MS 経っていれば更新し、
   * 経っていなければ理由だけ出して何もしない。手動の「更新」ボタンはこの制限を受けない。
   */
  async function refreshIfStale(): Promise<void> {
    if (loading.value) return;
    const last = lastUpdated.value?.getTime() ?? 0;
    const waitMs = AUTO_MIN_GAP_MS - (Date.now() - last);
    if (last > 0 && waitMs > 0) {
      const m = Math.ceil(waitMs / 60_000);
      autoNote.value = `自動更新は見送り (前回から 5 分空けます · あと ${m} 分)`;
      return;
    }
    autoNote.value = "";
    await refresh();
  }

  /** 起動直後に前回の内容を出す (この後 refresh() が上書きする) */
  function hydrateFromCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw) as Snapshot;
      if (snap?.v !== CACHE_VERSION || !Array.isArray(snap.ranking) || snap.ranking.length === 0) return;
      // 形が違う (古い版で保存した等) キャッシュで画面を壊さない。1 件検査して駄目なら捨てる
      const sample = snap.ranking[0] as Partial<RankedItem>;
      const shapeOk =
        typeof sample?.apiId === "string" &&
        typeof sample?.itemId === "number" &&
        typeof sample?.text === "string" &&
        typeof sample?.groupId === "string" &&
        typeof sample?.exaltedPrice === "number";
      if (!shapeOk) {
        localStorage.removeItem(CACHE_KEY);
        return;
      }
      leagues.value = Array.isArray(snap.leagues) ? snap.leagues : [];
      if (!league.value) league.value = snap.league ?? "";
      const sel = leagues.value.find((l) => l.Value === league.value);
      if (sel) applyLeagueRates(sel);
      ranking.value = snap.ranking;
      snapshotEpoch.value = snap.snapshotEpoch ?? null;
      lastUpdated.value = new Date(snap.savedAt);
      fromCache.value = true;
    } catch {
      /* 壊れていたら無視して普通に取得する */
    }
  }

  /** 表示用: 7 日があれば優先、無ければ 24 時間にフォールバック。 */
  function rowTrend(p: RankedItem): ItemTrend | undefined {
    return trend7d.get(p.itemId) ?? trends.value.get(p.itemId);
  }

  function applyLeagueRates(l: League) {
    divinePrice.value = l.DivinePrice || 1;
    chaosDivinePrice.value = l.ChaosDivinePrice || 1;
    divineIcon.value = l.DivineCurrencyIconUrl || "";
    chaosIcon.value = l.ChaosCurrencyIconUrl || "";
    exaltedIcon.value = l.ExaltedCurrencyIconUrl || l.BaseCurrencyIconUrl || "";
  }

  /** リーグ一覧を取り直し、選択リーグ (無ければ現行非HC) のレートを反映。 */
  async function syncLeagues() {
    let list: League[] = [];
    try {
      list = await fetchLeagues();
      leagues.value = list;
    } catch (e) {
      console.warn("Failed to load leagues:", e);
      leagueWarning.value = "リーグ一覧を取得できませんでした。表示中のデータは前回リーグの可能性があります。";
    }
    if (!list.length) return;
    let sel = list.find((l) => l.Value === league.value);
    if (!sel) {
      sel = list.find((l) => l.IsCurrent && !l.Value.startsWith("HC"));
      if (sel) {
        league.value = sel.Value;
        leagueWarning.value = null;
      } else {
        leagueWarning.value = "現在のリーグを自動判定できませんでした。上のリーグ選択で手動指定してください。";
      }
    } else {
      leagueWarning.value = null;
    }
    if (sel) applyLeagueRates(sel);
  }

  /** 基準レート 3 本の「本物 7 日」を個別履歴から取得。任意表示なので失敗は無視。 */
  function loadBaseRateTrends(lg: string, dId: number | null, cId: number | null) {
    void Promise.all([
      dId != null ? fetchItemTrend7d(lg, dId) : Promise.resolve(null),
      dId != null ? fetchItemTrend7d(lg, dId, "chaos") : Promise.resolve(null),
      cId != null ? fetchItemTrend7d(lg, cId) : Promise.resolve(null),
    ]).then(([dve, dvc, cve]) => {
      // リーグが切り替わっていなければ反映 (古い応答の取り違え防止)
      if (league.value === lg) {
        divineVsExalted.value = dve;
        divineVsChaos.value = dvc;
        chaosVsExalted.value = cve;
      }
    });
  }

  /**
   * 起動時・更新ボタン・リーグ切替の全経路で呼ぶ。毎回リーグ一覧 → 価格 / 履歴を取り直す
   * (「立ち上げ時」も「更新」も常に最新を取得する、no-store と併用)。
   */
  async function refresh() {
    loading.value = true;
    error.value = null;
    try {
      await syncLeagues();
      // 履歴 / 時刻は任意なので失敗しても本体は出す
      const [items, trendMap, snapEpoch, pairs] = await Promise.all([
        fetchItems(league.value),
        fetchPriceTrends(league.value).catch((e) => {
          console.warn("Failed to load price trends:", e);
          return new Map<number, ItemTrend>();
        }),
        fetchLatestSnapshotEpoch(league.value),
        // 一番安く交換できる通貨 (取れなければ相場の値段で出す)
        fetchSnapshotPairs(league.value).catch((e) => {
          console.warn("Failed to load snapshot pairs:", e);
          return [];
        }),
      ]);
      snapshotEpoch.value = snapEpoch;
      // 2026-09-12: 取った価格表を相場ストアに流し、ヴァールの天秤の素材価格に流用する (二重取得しない)
      adoptMarket(leagues.value, league.value, items);
      const ranked = buildRankedItems(items, divinePrice.value, chaosDivinePrice.value);
      const best = bestPayByApiId(
        pairs,
        new Map(ranked.map((r) => [r.apiId, r.exaltedPrice])),
        { chaos: chaosDivinePrice.value > 0 ? divinePrice.value / chaosDivinePrice.value : 0, divine: divinePrice.value },
      );
      for (const r of ranked) r.bestPay = best.get(r.apiId) ?? null;
      ranking.value = ranked;
      trend7d.clear(); // 新データなので 7 日キャッシュは破棄して取り直す
      trends.value = trendMap;
      lastUpdated.value = new Date();
      fromCache.value = false;
      saveSnapshot();

      // 神 / カオス の ItemId はリーグごとに異なるため動的に控える
      const dId = items.find((x) => x.ApiId === "divine")?.ItemId ?? null;
      const cId = items.find((x) => x.ApiId === "chaos")?.ItemId ?? null;
      loadBaseRateTrends(league.value, dId, cId);
      void load7dForVisible();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * 表示中 (フィルタ後) アイテムの「本物 7 日」を個別履歴から並列取得し reactive Map へ逐次反映。
   * 取得済みはスキップ (キャッシュ)。リーグ切替で中断。
   */
  async function load7dForVisible() {
    const lg = league.value;
    const todo = filteredRanking.value.map((p) => p.itemId).filter((id) => !trend7d.has(id));
    if (!todo.length) return;
    loading7d.value = true;
    const CONC = 8;
    let idx = 0;
    const worker = async () => {
      while (idx < todo.length) {
        const id = todo[idx++];
        if (league.value !== lg) return;
        const t = await fetchItemTrend7d(lg, id);
        if (league.value === lg && t) trend7d.set(id, t);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONC, todo.length) }, () => worker()));
    if (league.value === lg) loading7d.value = false;
  }

  function onLeagueChange() {
    // ユーザーが明示的にリーグを選んだ = 鮮度警告の役目は終わり
    leagueWarning.value = null;
    void refresh();
  }

  /** カテゴリ別の表示用リスト。ranking は神換算降順なので各カテゴリ最初のアイテム = 最高額を代表アイコンに使う。 */
  const categoryDisplayList = computed<CategoryDisplay[]>(() => {
    const acc = new Map<string, { count: number; icon: string }>();
    for (const r of ranking.value) {
      const entry = acc.get(r.groupId);
      if (entry) entry.count += 1;
      else acc.set(r.groupId, { count: 1, icon: r.icon });
    }
    return Array.from(acc.entries())
      .map(([id, e]) => ({ id, count: e.count, icon: e.icon }))
      .sort((a, b) => {
        const d = categoryOrderIndex(a.id) - categoryOrderIndex(b.id);
        return d !== 0 ? d : a.id.localeCompare(b.id);
      });
  });

  const filteredRanking = computed(() => {
    let list = ranking.value;
    if (categoryFilter.value !== "all") {
      list = list.filter((r) => r.groupId === categoryFilter.value);
    }
    const q = searchQuery.value.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => r.text.toLowerCase().includes(q) || jaCurrency(r.text).toLowerCase().includes(q));
    }
    // 表示順は「神換算」降順 (オーナー指示 2026-06-01)。同一参照になりうるので slice() してから sort
    return list.slice().sort((a, b) => b.divinePrice - a.divinePrice);
  });

  // カテゴリ切替時、新たに表示されるアイテムの 7 日トレンドを取得 (取得済みはスキップ)
  watch(categoryFilter, () => {
    void load7dForVisible();
  });

  hydrateFromCache();

  return {
    fromCache,
    autoNote,
    refreshIfStale,
    leagues,
    league,
    divinePrice,
    chaosDivinePrice,
    divineIcon,
    chaosIcon,
    exaltedIcon,
    ranking,
    loading7d,
    divineVsExalted,
    divineVsChaos,
    chaosVsExalted,
    loading,
    error,
    lastUpdated,
    snapshotEpoch,
    leagueWarning,
    categoryFilter,
    searchQuery,
    categoryDisplayList,
    filteredRanking,
    rowTrend,
    refresh,
    onLeagueChange,
  };
}
