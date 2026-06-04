<script setup lang="ts">
import { ref, reactive, watch, onMounted, computed } from "vue";
import {
  fetchItems,
  buildRankedItems,
  fetchLeagues,
  fetchPriceTrends,
  fetchItemTrend7d,
  fetchLatestSnapshotEpoch,
  type RankedItem,
  type ItemTrend,
  type League,
} from "../api/poe2scout";
import { jaCurrency } from "../i18n/currencies-ja";
import { jaCategory } from "../i18n/categories-ja";
import currencyEffectsJa from "../i18n/currency-effects-ja.json";

// アイテム効果説明(日本語, poe2db由来)。キーは EN名を正規化(小文字英数のみ)したもの。
// e=効果行, s=スタック数, lv=装備条件(レベル)。
interface ItemEffect {
  e: string[];
  s?: string;
  lv?: string;
}
const effectsMap = currencyEffectsJa as Record<string, ItemEffect>;
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function effectFor(p: RankedItem): ItemEffect | null {
  return effectsMap[normName(p.text)] ?? null;
}

// poe2db 風ホバーカードの状態 (Teleport で body に出してテーブルの overflow クリップを回避)。
const hoverItem = ref<RankedItem | null>(null);
const tip = ref({ x: 0, y: 0 });
const hoverEffect = computed<ItemEffect | null>(() =>
  hoverItem.value ? effectFor(hoverItem.value) : null,
);
function showTip(p: RankedItem, ev: MouseEvent) {
  if (effectFor(p)) {
    hoverItem.value = p;
    tip.value = { x: ev.clientX, y: ev.clientY };
  }
}
function moveTip(ev: MouseEvent) {
  if (hoverItem.value) tip.value = { x: ev.clientX, y: ev.clientY };
}
function hideTip() {
  hoverItem.value = null;
}
const tipStyle = computed(() => {
  const w = 340;
  let x = tip.value.x + 18;
  let y = tip.value.y + 18;
  if (typeof window !== "undefined") {
    if (x + w > window.innerWidth - 8) x = tip.value.x - w - 18;
    if (y > window.innerHeight - 220) y = Math.max(8, window.innerHeight - 240);
  }
  return { left: `${x}px`, top: `${y}px`, width: `${w}px` };
});

const leagues = ref<League[]>([]);
// 初期値は空。refresh() の初回で必ず現行リーグ(IsCurrent 非HC)を自動選択させるため
// （過去リーグ名を既定にすると一覧に存在してしまい現行へ切替わらない不具合になる）。
const league = ref<string>("");
const divinePrice = ref<number>(1);
const chaosDivinePrice = ref<number>(1); // 1 神 = X カオス (Chaos per Divine, 通常 >1)
const divineIcon = ref<string>("");
const chaosIcon = ref<string>("");
const exaltedIcon = ref<string>("");
const ranking = ref<RankedItem[]>([]);
// ItemId → 直近24時間トレンド (一括 PriceHistory)。即時フォールバック用。
const trends = ref<Map<number, ItemTrend>>(new Map());
// ItemId → 本物の7日トレンド (個別履歴を表示中アイテムだけ取得)。reactive で逐次反映。
const trend7d = reactive(new Map<number, ItemTrend>());
const loading7d = ref(false);
// 表示用: 7日があれば優先、無ければ24時間にフォールバック。
function rowTrend(p: RankedItem): ItemTrend | undefined {
  return trend7d.get(p.itemId) ?? trends.value.get(p.itemId);
}
// 基準レートのスパークライン用に 神/カオス の ItemId を保持 (リーグごとに異なるため動的取得)。
const divineItemId = ref<number | null>(null);
const chaosItemId = ref<number | null>(null);
// 基準レートは「本物の7日」トレンドを個別履歴から取得して使う (一括は~24時間しか無いため)。
// 神→高貴 / 神→カオス / カオス→高貴 をそれぞれ別グラフで表示 (オーナー指示 2026-06-04)。
const divineVsExalted = ref<ItemTrend | null>(null); // 1神=?高貴 の推移
const divineVsChaos = ref<ItemTrend | null>(null); // 1神=?カオス の推移 (ReferenceCurrency=chaos)
const chaosVsExalted = ref<ItemTrend | null>(null); // 1カオス=?高貴 の推移
const loading = ref(false);
const error = ref<string | null>(null);
const lastUpdated = ref<Date | null>(null);
// poe2scout の最新スナップショット実時刻(Epoch秒)。鮮度の可視化用 (取得=PC時刻とは別)。
const snapshotEpoch = ref<number | null>(null);
// リーグ自動判定に失敗した時の警告 (前リーグのまま黙って表示する事故を防ぐ)。
// refresh() の error とは別管理で、リーグ取得時のみ更新する。
const leagueWarning = ref<string | null>(null);
// 初期表示は「通貨 (currency)」固定 = 高貴なるオーブ等のオーブ系のみ
// (オーナー指示 2026-05-22: 通貨欄はルーン/ジェム/エッセンスを混ぜない)
const categoryFilter = ref<string>("currency");
const searchQuery = ref<string>("");

/** 選択中リーグのレート(神/カオス)とアイコンを League から反映。 */
function applyLeagueRates(l: League) {
  divinePrice.value = l.DivinePrice || 1;
  chaosDivinePrice.value = l.ChaosDivinePrice || 1;
  divineIcon.value = l.DivineCurrencyIconUrl || "";
  chaosIcon.value = l.ChaosCurrencyIconUrl || "";
  exaltedIcon.value = l.ExaltedCurrencyIconUrl || l.BaseCurrencyIconUrl || "";
}

/**
 * 起動時・更新ボタン・リーグ切替の全経路で呼ぶ。毎回:
 *  1) リーグ一覧を取り直し最新レート(DivinePrice/ChaosDivinePrice)を反映
 *  2) /Items(価格) と PriceHistory(7日) を取得
 * これで「立ち上げ時」も「更新」も常に最新を取得する (no-store と併用)。
 */
async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    // 1) リーグ一覧を毎回フレッシュ取得 (神/カオスレートも最新化)
    let list: League[] = [];
    try {
      list = await fetchLeagues();
      leagues.value = list;
    } catch (e) {
      console.warn("Failed to load leagues:", e);
      leagueWarning.value =
        "リーグ一覧を取得できませんでした。表示中のデータは前回リーグの可能性があります。";
    }
    if (list.length) {
      // 選択中リーグ。未選択 or 一覧に無ければ現行リーグ(非HC)を自動選択
      let sel = list.find((l) => l.Value === league.value);
      if (!sel) {
        sel = list.find((l) => l.IsCurrent && !l.Value.startsWith("HC"));
        if (sel) {
          league.value = sel.Value;
          leagueWarning.value = null;
        } else {
          leagueWarning.value =
            "現在のリーグを自動判定できませんでした。上のリーグ選択で手動指定してください。";
        }
      } else {
        leagueWarning.value = null;
      }
      if (sel) applyLeagueRates(sel);
    }

    // 2) アイテム価格(/Items)・価格履歴・最新スナップショット時刻を並列取得。
    //    履歴/時刻は任意なので失敗しても本体は出す。
    const [items, trendMap, snapEpoch] = await Promise.all([
      fetchItems(league.value),
      fetchPriceTrends(league.value).catch((e) => {
        console.warn("Failed to load price trends:", e);
        return new Map<number, ItemTrend>();
      }),
      fetchLatestSnapshotEpoch(league.value),
    ]);
    snapshotEpoch.value = snapEpoch;
    ranking.value = buildRankedItems(
      items,
      divinePrice.value,
      chaosDivinePrice.value,
    );
    trend7d.clear(); // 新データなので7日キャッシュは破棄して取り直す
    // 基準レートのスパークライン用に 神/カオス の ItemId を控える
    divineItemId.value = items.find((x) => x.ApiId === "divine")?.ItemId ?? null;
    chaosItemId.value = items.find((x) => x.ApiId === "chaos")?.ItemId ?? null;
    trends.value = trendMap;
    lastUpdated.value = new Date();

    // 基準レートは「本物の7日」トレンドを個別履歴から取得 (一括は~24時間のみ)。
    // 神→高貴 / 神→カオス(ReferenceCurrency=chaos) / カオス→高貴 の3グラフ。任意表示なので失敗無視。
    const lg = league.value;
    const dId = divineItemId.value;
    const cId = chaosItemId.value;
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

    // テーブルの「本物7日」を表示中アイテムから取得 (起動/更新時)。逐次反映。
    void load7dForVisible();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

/**
 * 表示中(フィルタ後)アイテムの「本物7日」トレンドを個別履歴から並列取得し reactive Map へ逐次反映。
 * 取得済みはスキップ(キャッシュ)。リーグ切替で中断。一括(24時間)は即時フォールバックとして別に保持。
 */
async function load7dForVisible() {
  const lg = league.value;
  const todo = filteredRanking.value
    .map((p) => p.itemId)
    .filter((id) => !trend7d.has(id));
  if (!todo.length) return;
  loading7d.value = true;
  const CONC = 8;
  let idx = 0;
  const worker = async () => {
    while (idx < todo.length) {
      const id = todo[idx++];
      if (league.value !== lg) return; // リーグ切替で中断
      const t = await fetchItemTrend7d(lg, id);
      if (league.value === lg && t) trend7d.set(id, t);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONC, todo.length) }, () => worker()),
  );
  if (league.value === lg) loading7d.value = false;
}

function onLeagueChange() {
  // ユーザーが明示的にリーグを選んだ = 鮮度警告の役目は終わり (案内文と挙動を一致させる)
  leagueWarning.value = null;
  refresh();
}

/**
 * 数値表示
 * - >=1億: "X.X億"
 * - >=1万: "X.X万"
 * - >=1000: "1,234" カンマ区切り (漢字 "千" は使わない、オーナー指示 2026-05-22)
 * - >=1: "X.X"
 * - 小数: 0.1/0.01 帯は桁を潰さない
 */
const numFormat1k = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return (n / 100_000_000).toFixed(1) + "億";
  if (abs >= 10_000) return (n / 10_000).toFixed(1) + "万";
  if (abs >= 1_000) return numFormat1k.format(n);
  if (abs >= 1) return n.toFixed(1);
  if (abs >= 0.1) return n.toFixed(2);
  if (abs >= 0.01) return n.toFixed(3);
  if (abs >= 0.0001) return n.toFixed(4);
  // 0.0001 未満は実用上ほぼ無価値。指数表記 (7.4e-3) は分かりにくいので "<0.0001" 固定表示
  return "<0.0001";
}

function formatTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
/** poe2scout の相場スナップショット実時刻(Epoch秒)を「MM/DD HH:MM」で表示。鮮度の可視化。 */
function formatEpoch(epoch: number | null): string {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- トレンド (スパークライン + 変化率) ---
/** spark 配列を SVG polyline の points 文字列に変換 (古→新, 左→右)。 */
function sparkPoints(vals: number[], w = 72, h = 20): string {
  if (vals.length < 2) return "";
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pad = 1.5; // 線幅ぶん上下に余白
  return vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
/** 変化率の表示文字列 (+12.3% / −4.5% / 0%)。 */
function fmtPct(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 0.05) return "0%";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${Math.abs(n).toFixed(0)}%`;
}

// カテゴリ表示順 (オーナー指示 2026-06-03): 件数依存だと毎リーグ並びが変わるので固定順にする。
// POE2 公式トレードの並びを参考に「カレンシー → 強化系 → リーグ機構 → ジェム/アイドル系」。
// 未掲載カテゴリはこの後ろに ID 昇順で続ける。
const CATEGORY_ORDER: string[] = [
  "currency",
  "essences",
  "essence",
  "delirium",
  "breach",
  "abyss",
  "sanctum",
  "fragments",
  "fragment",
  "runes",
  "rune",
  "ritual",
  "soulcore",
  "expedition",
  "ultimatum",
  "incursion",
  "idol",
  "uncutgems",
  "lineagesupportgems",
  "verisium",
  "vaultkeys",
  "vaal",
];
function categoryOrderIndex(id: string): number {
  const i = CATEGORY_ORDER.indexOf(id);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

// カテゴリ別の表示用リスト。各カテゴリで取引量最大のアイテムのアイコンを代表に使う。
// アイテム単位に集約済なので categoryApiId でそのまま件数を数える。
interface CategoryDisplay {
  id: string;
  count: number;
  icon: string;
}
const categoryDisplayList = computed<CategoryDisplay[]>(() => {
  // ranking は価格(高貴)降順なので、各カテゴリ最初に出たアイテム=最高額を代表アイコンに使う。
  const acc = new Map<string, { count: number; icon: string }>();
  for (const r of ranking.value) {
    const entry = acc.get(r.categoryApiId);
    if (entry) {
      entry.count += 1;
    } else {
      acc.set(r.categoryApiId, { count: 1, icon: r.icon });
    }
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

  // カテゴリフィルタ: アイテムの categoryApiId で絞るだけ。
  if (categoryFilter.value !== "all") {
    list = list.filter((r) => r.categoryApiId === categoryFilter.value);
  }

  // 検索フィルタ（日英両方の名前を対象）
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (r) =>
        r.text.toLowerCase().includes(q) ||
        jaCurrency(r.text).toLowerCase().includes(q),
    );
  }

  // 表示順は「神換算」降順 = 価値が高い順 (オーナー指示 2026-06-01)。
  // list が ranking.value と同一参照になりうるので slice() してから sort する。
  return list.slice().sort((a, b) => b.divinePrice - a.divinePrice);
});

// カテゴリ切替時、新たに表示されるアイテムの7日トレンドを取得 (取得済みはスキップ)。
watch(categoryFilter, () => {
  void load7dForVisible();
});

onMounted(() => {
  // 起動時も refresh() がリーグ一覧+価格+履歴を全てフレッシュ取得する
  refresh();
});
</script>

<template>
  <div class="h-full flex overflow-hidden">
    <!-- ============================================================
      左サイドバー: カテゴリ縦リスト (POE2 trade2 風)
    ============================================================ -->
    <aside
      class="w-44 shrink-0 border-r border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] overflow-y-auto flex flex-col"
    >
      <div class="px-3 py-3 border-b border-[var(--exile-color-border-subtle)]">
        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="🔍 商品で検索…"
            class="w-full px-3 py-2 pr-8 rounded bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)] text-sm focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)] text-sm"
            title="クリア"
          >✕</button>
        </div>
      </div>
      <div class="px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--exile-color-text-secondary)]">
        カテゴリ
      </div>
      <nav class="flex-1">
        <button
          @click="categoryFilter = 'all'"
          :class="[
            'w-full text-left px-3 py-2 flex items-center gap-2 text-sm border-l-2 transition',
            categoryFilter === 'all'
              ? 'bg-[var(--exile-color-bg-elevated)] border-[var(--exile-color-accent-focus)] text-[var(--exile-color-accent-focus)]'
              : 'border-transparent hover:bg-[var(--exile-color-bg-elevated)]',
          ]"
        >
          <span class="w-6 h-6 inline-flex items-center justify-center text-base">★</span>
          <span>すべて</span>
          <span class="ml-auto text-[10px] text-[var(--exile-color-text-secondary)] tabular-nums">{{ ranking.length }}</span>
        </button>
        <button
          v-for="cat in categoryDisplayList"
          :key="cat.id"
          @click="categoryFilter = cat.id"
          :class="[
            'w-full text-left px-3 py-2 flex items-center gap-2 text-sm border-l-2 transition',
            categoryFilter === cat.id
              ? 'bg-[var(--exile-color-bg-elevated)] border-[var(--exile-color-accent-focus)] text-[var(--exile-color-accent-focus)]'
              : 'border-transparent hover:bg-[var(--exile-color-bg-elevated)]',
          ]"
        >
          <img v-if="cat.icon" :src="cat.icon" :alt="cat.id" class="w-6 h-6 object-contain shrink-0" loading="lazy" />
          <span v-else class="w-6 h-6 inline-flex items-center justify-center text-base">·</span>
          <span class="truncate">{{ jaCategory(cat.id) }}</span>
          <span class="ml-auto text-[10px] text-[var(--exile-color-text-secondary)] tabular-nums">{{ cat.count }}</span>
        </button>
      </nav>
    </aside>

    <!-- ============================================================
      メインエリア: ヘッダ + テーブル
    ============================================================ -->
    <div class="flex-1 overflow-auto p-4">
    <div class="flex items-start justify-between mb-4 gap-4 flex-wrap">
      <div>
        <h2 class="text-[24px] font-semibold font-display mb-1">💰 カレンシーランキング</h2>
        <div class="h-px bg-gradient-to-r from-transparent via-[var(--exile-color-border-brass)] to-transparent" />
        <p class="text-xs text-[var(--exile-color-text-secondary)]">
          相場時刻: <span class="text-[var(--exile-color-text-primary)]">{{ formatEpoch(snapshotEpoch) }}</span>
          <span class="text-[var(--exile-color-text-tertiary)]">（poe2scout更新）</span>
          ／ 取得 <span>{{ formatTime(lastUpdated) }}</span>
          <span v-if="ranking.length"> ／ {{ ranking.length }} 件</span>
        </p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <select
          v-model="league"
          @change="onLeagueChange"
          class="px-3 py-2 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] text-sm"
        >
          <option v-for="l in leagues" :key="l.Value" :value="l.Value">
            {{ l.Value }}{{ l.IsCurrent ? " ★" : "" }}
          </option>
          <option v-if="!leagues.length" :value="league">{{ league }}</option>
        </select>
        <button
          @click="refresh"
          :disabled="loading"
          class="px-4 py-2 rounded bg-[var(--exile-color-accent-focus)] text-black font-medium text-sm hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-50 transition"
        >
          {{ loading ? "更新中…" : "🔄 更新" }}
        </button>
      </div>
    </div>

    <!-- リーグ自動判定の警告: 前リーグのまま表示する事故を可視化 -->
    <div
      v-if="leagueWarning"
      class="p-3 mb-4 rounded bg-[color-mix(in_srgb,var(--exile-color-signal-warning,#c9a227)_12%,transparent)] border-l-2 border-[var(--exile-color-signal-warning,#c9a227)] text-sm"
    >
      ⚠️ {{ leagueWarning }}
    </div>

    <!-- 基準レート帯: 神→高貴 / 神→カオス / カオス→高貴 を各行に分け、それぞれ過去7日グラフ+% -->
    <div
      v-if="ranking.length"
      class="mb-4 px-4 py-2.5 rounded-lg border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)]"
    >
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[10px] uppercase tracking-wider text-[var(--exile-color-text-secondary)] font-display">基準レート</span>
        <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">過去7日</span>
      </div>
      <template v-if="divinePrice > 1">
        <div class="flex flex-col gap-1.5">
          <!-- 1 神 = 高貴 -->
          <div class="flex items-center gap-1 text-sm tabular-nums">
            <span class="text-[var(--exile-color-text-secondary)]">1</span>
            <img v-if="divineIcon" :src="divineIcon" alt="神" class="w-5 h-5 object-contain" loading="lazy" />
            <span class="text-[10px] text-[var(--exile-color-text-secondary)]">神</span>
            <span class="text-[var(--exile-color-text-secondary)]">=</span>
            <span class="text-[var(--exile-color-accent-focus)] font-semibold">{{ fmt(divinePrice) }}</span>
            <img v-if="exaltedIcon" :src="exaltedIcon" alt="高貴" class="w-4 h-4 object-contain" loading="lazy" />
            <span class="text-[10px] text-[var(--exile-color-text-secondary)]">高貴</span>
            <div v-if="divineVsExalted && divineVsExalted.spark.length >= 2" class="flex items-center gap-1 ml-2">
              <svg width="60" height="16" viewBox="0 0 72 20" preserveAspectRatio="none" class="shrink-0 overflow-visible">
                <polyline :points="sparkPoints(divineVsExalted.spark)" fill="none" :stroke="divineVsExalted.changePct < 0 ? 'var(--exile-color-signal-error)' : 'var(--exile-color-signal-success)'" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
              </svg>
              <span class="text-xs tabular-nums w-12 text-right" :class="divineVsExalted.changePct < 0 ? 'text-[var(--exile-color-signal-error)]' : 'text-[var(--exile-color-signal-success)]'">{{ fmtPct(divineVsExalted.changePct) }}</span>
            </div>
          </div>
          <!-- 1 神 = カオス -->
          <div class="flex items-center gap-1 text-sm tabular-nums">
            <span class="text-[var(--exile-color-text-secondary)]">1</span>
            <img v-if="divineIcon" :src="divineIcon" alt="神" class="w-5 h-5 object-contain" loading="lazy" />
            <span class="text-[10px] text-[var(--exile-color-text-secondary)]">神</span>
            <span class="text-[var(--exile-color-text-secondary)]">=</span>
            <span class="text-[var(--exile-color-accent-focus)] font-semibold">{{ fmt(chaosDivinePrice) }}</span>
            <img v-if="chaosIcon" :src="chaosIcon" alt="カオス" class="w-4 h-4 object-contain" loading="lazy" />
            <span class="text-[10px] text-[var(--exile-color-text-secondary)]">カオス</span>
            <div v-if="divineVsChaos && divineVsChaos.spark.length >= 2" class="flex items-center gap-1 ml-2">
              <svg width="60" height="16" viewBox="0 0 72 20" preserveAspectRatio="none" class="shrink-0 overflow-visible">
                <polyline :points="sparkPoints(divineVsChaos.spark)" fill="none" :stroke="divineVsChaos.changePct < 0 ? 'var(--exile-color-signal-error)' : 'var(--exile-color-signal-success)'" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
              </svg>
              <span class="text-xs tabular-nums w-12 text-right" :class="divineVsChaos.changePct < 0 ? 'text-[var(--exile-color-signal-error)]' : 'text-[var(--exile-color-signal-success)]'">{{ fmtPct(divineVsChaos.changePct) }}</span>
            </div>
          </div>
          <!-- 1 カオス = 高貴 (このリーグはカオス>高貴。数値3.1はこの向きで出る) -->
          <div class="flex items-center gap-1 text-sm tabular-nums text-[var(--exile-color-text-secondary)]">
            <span>1</span>
            <img v-if="chaosIcon" :src="chaosIcon" alt="カオス" class="w-4 h-4 object-contain" loading="lazy" />
            <span class="text-[10px]">カオス</span>
            <span>=</span>
            <span class="text-[var(--exile-color-text-primary)]">{{ fmt(divinePrice / chaosDivinePrice) }}</span>
            <img v-if="exaltedIcon" :src="exaltedIcon" alt="高貴" class="w-4 h-4 object-contain" loading="lazy" />
            <span class="text-[10px]">高貴</span>
            <div v-if="chaosVsExalted && chaosVsExalted.spark.length >= 2" class="flex items-center gap-1 ml-2">
              <svg width="60" height="16" viewBox="0 0 72 20" preserveAspectRatio="none" class="shrink-0 overflow-visible">
                <polyline :points="sparkPoints(chaosVsExalted.spark)" fill="none" :stroke="chaosVsExalted.changePct < 0 ? 'var(--exile-color-signal-error)' : 'var(--exile-color-signal-success)'" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
              </svg>
              <span class="text-xs tabular-nums w-12 text-right" :class="chaosVsExalted.changePct < 0 ? 'text-[var(--exile-color-signal-error)]' : 'text-[var(--exile-color-signal-success)]'">{{ fmtPct(chaosVsExalted.changePct) }}</span>
            </div>
          </div>
        </div>
      </template>
      <span v-else class="text-sm text-[var(--exile-color-text-tertiary)] italic">
        神価格は未確定（1 神 = 1 高貴 仮置き）
      </span>
    </div>

    <div
      v-if="error"
      class="p-4 mb-4 rounded bg-[color-mix(in_srgb,var(--exile-color-signal-error)_10%,transparent)] border-l-2 border-[var(--exile-color-signal-error)] text-[var(--exile-color-signal-error)] text-sm"
    >
      <p class="font-semibold mb-1">取得失敗</p>
      <p class="font-mono text-xs">{{ error }}</p>
    </div>

    <div
      v-if="loading && !ranking.length"
      class="p-12 text-center text-[var(--exile-color-text-secondary)] text-sm"
    >
      データ取得中…
    </div>

    <!-- M2: フィルタ後 0 件案内 (元データはあるが categoryFilter / searchQuery で消えた時) -->
    <div
      v-else-if="ranking.length && filteredRanking.length === 0"
      class="p-12 text-center text-[var(--exile-color-text-secondary)] text-sm rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)]"
    >
      <p class="mb-2">該当するアイテムがありません</p>
      <p class="text-xs text-[var(--exile-color-text-tertiary)]">
        カテゴリ / 検索条件を変更してください
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="ml-2 underline hover:text-[var(--exile-color-accent-focus)]"
        >検索クリア</button>
        <button
          v-if="categoryFilter !== 'all'"
          @click="categoryFilter = 'all'"
          class="ml-2 underline hover:text-[var(--exile-color-accent-focus)]"
        >「すべて」に戻す</button>
      </p>
    </div>

    <div
      v-else-if="ranking.length"
      class="rounded-lg border border-[var(--exile-color-border-subtle)] overflow-hidden"
    >
      <table class="w-full text-base">
        <thead
          class="bg-[var(--exile-color-bg-surface)] text-xs uppercase tracking-wider text-[var(--exile-color-text-secondary)]"
        >
          <tr>
            <th class="text-left px-3 py-3 whitespace-nowrap">#</th>
            <th class="text-left px-3 py-3 whitespace-nowrap">アイテム</th>
            <th class="text-right px-3 py-3 whitespace-nowrap">神 換算</th>
            <th class="text-right px-3 py-3 whitespace-nowrap">高貴 換算</th>
            <th class="text-right px-3 py-3 whitespace-nowrap">カオス 換算</th>
            <th class="text-right px-3 py-3 whitespace-nowrap">
              過去7日間<span v-if="loading7d" class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)] normal-case">読込中…</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- 1 アイテム = 1 行。神/高貴/カオスの3換算 (オーナー指示 2026-06-03) -->
          <tr
            v-for="(p, i) in filteredRanking"
            :key="p.apiId"
            class="border-t border-[var(--exile-color-border-subtle)] hover:bg-[var(--exile-color-bg-elevated)] transition"
            @mouseenter="showTip(p, $event)"
            @mousemove="moveTip"
            @mouseleave="hideTip"
          >
            <td class="px-3 py-3 text-[var(--exile-color-text-secondary)] tabular-nums whitespace-nowrap">{{ i + 1 }}</td>
            <td class="px-3 py-3 whitespace-nowrap">
              <div
                class="flex items-center gap-2 whitespace-nowrap"
                :class="effectFor(p) ? 'cursor-help' : ''"
              >
                <img v-if="p.icon" :src="p.icon" :alt="p.text" class="w-6 h-6 object-contain shrink-0" loading="lazy" />
                <span
                  class="text-[var(--exile-color-text-primary)]"
                  :class="effectFor(p) ? 'underline decoration-dotted decoration-[var(--exile-color-text-tertiary)] underline-offset-4' : ''"
                >{{ jaCurrency(p.text) }}</span>
              </div>
            </td>
            <td class="px-2 py-3 text-right">
              <div class="flex items-center justify-end gap-1 text-sm tabular-nums">
                <span class="text-[var(--exile-color-accent-focus)]">{{ fmt(p.divinePrice) }}</span>
                <img v-if="divineIcon" :src="divineIcon" alt="神" class="w-5 h-5 object-contain" loading="lazy" />
              </div>
            </td>
            <td class="px-2 py-3 text-right">
              <div class="flex items-center justify-end gap-1 text-sm tabular-nums">
                <span class="text-[var(--exile-color-accent-focus)]">{{ fmt(p.exaltedPrice) }}</span>
                <img v-if="exaltedIcon" :src="exaltedIcon" alt="高貴" class="w-5 h-5 object-contain" loading="lazy" />
              </div>
            </td>
            <td class="px-2 py-3 text-right">
              <div class="flex items-center justify-end gap-1 text-sm tabular-nums">
                <span class="text-[var(--exile-color-accent-focus)]">{{ fmt(p.chaosPrice) }}</span>
                <img v-if="chaosIcon" :src="chaosIcon" alt="カオス" class="w-5 h-5 object-contain" loading="lazy" />
              </div>
            </td>
            <td class="px-2 py-3">
              <div
                v-if="rowTrend(p) && rowTrend(p)!.spark.length >= 2"
                class="flex items-center justify-end gap-2"
                :title="`過去7日間 ${fmtPct(rowTrend(p)!.changePct)}`"
              >
                <svg
                  width="72"
                  height="20"
                  viewBox="0 0 72 20"
                  preserveAspectRatio="none"
                  class="shrink-0 overflow-visible"
                >
                  <polyline
                    :points="sparkPoints(rowTrend(p)!.spark)"
                    fill="none"
                    :stroke="rowTrend(p)!.changePct < 0
                      ? 'var(--exile-color-signal-error)'
                      : 'var(--exile-color-signal-success)'"
                    stroke-width="1.5"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                  />
                </svg>
                <span
                  class="text-xs tabular-nums w-12 text-right"
                  :class="rowTrend(p)!.changePct < 0
                    ? 'text-[var(--exile-color-signal-error)]'
                    : 'text-[var(--exile-color-signal-success)]'"
                >{{ fmtPct(rowTrend(p)!.changePct) }}</span>
              </div>
              <div v-else class="text-right text-xs text-[var(--exile-color-text-tertiary)] pr-1">—</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="mt-4 text-[10px] text-[var(--exile-color-text-secondary)] text-right">
      Powered by
      <a href="https://poe2scout.com" target="_blank" class="hover:text-[var(--exile-color-accent-focus)] underline">poe2scout</a>
      ／ <span class="font-mono">{{ league }}</span>
      ／日本語名は v0 暫定（RePoE fork JA データに後日差替え）
      ／各列は「1 アイテム = X 神 / 高貴 / カオス」
    </p>
    </div>

    <!-- poe2db 風ホバーカード (Teleport で body 直下に出しテーブルの overflow クリップを回避) -->
    <Teleport to="body">
      <div
        v-if="hoverItem && hoverEffect"
        class="fixed z-[1000] pointer-events-none rounded-md border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)] shadow-2xl overflow-hidden"
        :style="tipStyle"
      >
        <div class="flex items-center gap-2 px-3 py-2 bg-[var(--exile-color-bg-elevated)] border-b border-[var(--exile-color-border-subtle)]">
          <img v-if="hoverItem.icon" :src="hoverItem.icon" :alt="hoverItem.text" class="w-7 h-7 object-contain shrink-0" />
          <span class="font-display text-[15px] text-[var(--exile-color-accent-focus)] leading-tight">{{ jaCurrency(hoverItem.text) }}</span>
        </div>
        <div class="px-3 py-2">
          <div
            v-if="hoverEffect.s"
            class="text-xs text-[var(--exile-color-text-secondary)] tabular-nums"
          >スタック数: <span class="text-[var(--exile-color-text-primary)]">{{ hoverEffect.s }}</span></div>
          <div
            v-if="hoverEffect.lv"
            class="text-xs text-[var(--exile-color-text-secondary)] tabular-nums"
          >装備条件: <span class="text-[var(--exile-color-text-primary)]">{{ hoverEffect.lv }}</span></div>
          <div
            v-if="hoverEffect.s || hoverEffect.lv"
            class="h-px my-2 bg-gradient-to-r from-transparent via-[var(--exile-color-border-brass)] to-transparent"
          />
          <p
            v-for="(line, idx) in hoverEffect.e"
            :key="idx"
            class="text-[13px] leading-snug text-[var(--exile-color-accent-focus)]"
            :class="idx > 0 ? 'mt-1' : ''"
          >{{ line }}</p>
        </div>
        <div class="px-3 pb-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--exile-color-text-tertiary)] text-center">{{ hoverItem.text }}</div>
      </div>
    </Teleport>
  </div>
</template>
