<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
  fetchItems,
  buildRankedItems,
  fetchLeagues,
  fetchPriceTrends,
  type RankedItem,
  type ItemTrend,
  type League,
} from "../api/poe2scout";
import { jaCurrency } from "../i18n/currencies-ja";
import { jaCategory } from "../i18n/categories-ja";

const leagues = ref<League[]>([]);
const league = ref<string>("Fate of the Vaal");
const divinePrice = ref<number>(1);
const chaosDivinePrice = ref<number>(1); // 1 神 = X カオス (Chaos per Divine, 通常 >1)
const divineIcon = ref<string>("");
const chaosIcon = ref<string>("");
const exaltedIcon = ref<string>("");
const ranking = ref<RankedItem[]>([]);
// ItemId → 過去7日トレンド (poe2scout PriceHistory)。表示は任意なので失敗しても表は出す。
const trends = ref<Map<number, ItemTrend>>(new Map());
const loading = ref(false);
const error = ref<string | null>(null);
const lastUpdated = ref<Date | null>(null);
// リーグ自動判定に失敗した時の警告 (前リーグのまま黙って表示する事故を防ぐ)。
// refresh() の error とは別管理で、リーグ取得時のみ更新する。
const leagueWarning = ref<string | null>(null);
// 初期表示は「通貨 (currency)」固定 = 高貴なるオーブ等のオーブ系のみ
// (オーナー指示 2026-05-22: 通貨欄はルーン/ジェム/エッセンスを混ぜない)
const categoryFilter = ref<string>("currency");
const searchQuery = ref<string>("");

async function loadLeagues() {
  try {
    const list = await fetchLeagues();
    leagues.value = list;
    const current = list.find((l) => l.IsCurrent && !l.Value.startsWith("HC"));
    if (current) {
      league.value = current.Value;
      divinePrice.value = current.DivinePrice || 1;
      chaosDivinePrice.value = current.ChaosDivinePrice || 1;
      divineIcon.value = current.DivineCurrencyIconUrl || "";
      chaosIcon.value = current.ChaosCurrencyIconUrl || "";
      exaltedIcon.value = current.ExaltedCurrencyIconUrl || current.BaseCurrencyIconUrl || "";
      leagueWarning.value = null;
    } else {
      // API は応答したが IsCurrent なリーグが無い = 前リーグのまま表示する事故になり得る
      leagueWarning.value =
        "現在のリーグを自動判定できませんでした。上のリーグ選択で手動指定してください。";
    }
  } catch (e) {
    console.warn("Failed to load leagues, using default:", e);
    leagueWarning.value =
      "リーグ一覧を取得できませんでした。表示中のデータは前回リーグの可能性があります。";
  }
}

async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    const leagueData = leagues.value.find((l) => l.Value === league.value);
    if (leagueData) {
      divinePrice.value = leagueData.DivinePrice || 1;
      chaosDivinePrice.value = leagueData.ChaosDivinePrice || 1;
      divineIcon.value = leagueData.DivineCurrencyIconUrl || "";
      chaosIcon.value = leagueData.ChaosCurrencyIconUrl || "";
      exaltedIcon.value = leagueData.ExaltedCurrencyIconUrl || leagueData.BaseCurrencyIconUrl || "";
    }

    // アイテム価格(/Items)と価格履歴を並列取得。履歴は任意表示なので失敗しても本体は出す。
    const [items, trendMap] = await Promise.all([
      fetchItems(league.value),
      fetchPriceTrends(league.value).catch((e) => {
        console.warn("Failed to load price trends:", e);
        return new Map<number, ItemTrend>();
      }),
    ]);
    ranking.value = buildRankedItems(
      items,
      divinePrice.value,
      chaosDivinePrice.value,
    );
    trends.value = trendMap;
    lastUpdated.value = new Date();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
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

// --- 過去7日トレンド (スパークライン + 変化率) ---
function trendFor(p: RankedItem): ItemTrend | undefined {
  return trends.value.get(p.itemId);
}
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

onMounted(async () => {
  await loadLeagues();
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
          最終更新: <span>{{ formatTime(lastUpdated) }}</span>
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

    <!-- 基準レート帯: ランキングは「1 神 建て」なので、神→高貴/カオスの相場を真上に明示 -->
    <div
      v-if="ranking.length"
      class="flex items-center gap-x-5 gap-y-2 mb-4 px-4 py-2.5 rounded-lg border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)] flex-wrap"
    >
      <span class="text-[10px] uppercase tracking-wider text-[var(--exile-color-text-secondary)] font-display">基準レート</span>
      <template v-if="divinePrice > 1">
        <div class="flex items-center gap-1.5 text-lg font-semibold tabular-nums">
          <span class="text-[var(--exile-color-text-secondary)]">1</span>
          <img v-if="divineIcon" :src="divineIcon" alt="神" class="w-6 h-6 object-contain" loading="lazy" />
          <span class="text-[var(--exile-color-text-secondary)]">=</span>
          <span class="text-[var(--exile-color-accent-focus)]">{{ fmt(divinePrice) }}</span>
          <img v-if="exaltedIcon" :src="exaltedIcon" alt="高貴" class="w-6 h-6 object-contain" loading="lazy" />
          <span class="text-sm text-[var(--exile-color-text-secondary)]">高貴</span>
        </div>
        <div class="flex items-center gap-1.5 text-base tabular-nums text-[var(--exile-color-text-secondary)]">
          <span>1</span>
          <img v-if="divineIcon" :src="divineIcon" alt="神" class="w-5 h-5 object-contain" loading="lazy" />
          <span>=</span>
          <span class="text-[var(--exile-color-text-primary)]">{{ fmt(chaosDivinePrice) }}</span>
          <img v-if="chaosIcon" :src="chaosIcon" alt="カオス" class="w-5 h-5 object-contain" loading="lazy" />
          <span class="text-sm">カオス</span>
        </div>
        <!-- 高貴 ↔ カオス 相互レート (オーナー指示 2026-06-03) -->
        <div class="flex items-center gap-1.5 text-base tabular-nums text-[var(--exile-color-text-secondary)]">
          <span>1</span>
          <img v-if="exaltedIcon" :src="exaltedIcon" alt="高貴" class="w-5 h-5 object-contain" loading="lazy" />
          <span>=</span>
          <span class="text-[var(--exile-color-text-primary)]">{{ fmt(chaosDivinePrice / divinePrice) }}</span>
          <img v-if="chaosIcon" :src="chaosIcon" alt="カオス" class="w-5 h-5 object-contain" loading="lazy" />
          <span class="text-sm">カオス</span>
        </div>
        <div class="flex items-center gap-1.5 text-base tabular-nums text-[var(--exile-color-text-secondary)]">
          <span>1</span>
          <img v-if="chaosIcon" :src="chaosIcon" alt="カオス" class="w-5 h-5 object-contain" loading="lazy" />
          <span>=</span>
          <span class="text-[var(--exile-color-text-primary)]">{{ fmt(divinePrice / chaosDivinePrice) }}</span>
          <img v-if="exaltedIcon" :src="exaltedIcon" alt="高貴" class="w-5 h-5 object-contain" loading="lazy" />
          <span class="text-sm">高貴</span>
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
            <th class="text-right px-3 py-3 whitespace-nowrap">過去7日間</th>
          </tr>
        </thead>
        <tbody>
          <!-- 1 アイテム = 1 行。神/高貴/カオスの3換算 (オーナー指示 2026-06-03) -->
          <tr
            v-for="(p, i) in filteredRanking"
            :key="p.apiId"
            class="border-t border-[var(--exile-color-border-subtle)] hover:bg-[var(--exile-color-bg-elevated)] transition"
          >
            <td class="px-3 py-3 text-[var(--exile-color-text-secondary)] tabular-nums whitespace-nowrap">{{ i + 1 }}</td>
            <td class="px-3 py-3 whitespace-nowrap">
              <div class="flex items-center gap-2 whitespace-nowrap">
                <img v-if="p.icon" :src="p.icon" :alt="p.text" class="w-6 h-6 object-contain shrink-0" loading="lazy" />
                <span class="text-[var(--exile-color-text-primary)]">{{ jaCurrency(p.text) }}</span>
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
                v-if="trendFor(p) && trendFor(p)!.spark.length >= 2"
                class="flex items-center justify-end gap-2"
                :title="`過去7日間 ${fmtPct(trendFor(p)!.changePct)}`"
              >
                <svg
                  width="72"
                  height="20"
                  viewBox="0 0 72 20"
                  preserveAspectRatio="none"
                  class="shrink-0 overflow-visible"
                >
                  <polyline
                    :points="sparkPoints(trendFor(p)!.spark)"
                    fill="none"
                    :stroke="trendFor(p)!.changePct < 0
                      ? 'var(--exile-color-signal-error)'
                      : 'var(--exile-color-signal-success)'"
                    stroke-width="1.5"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                  />
                </svg>
                <span
                  class="text-xs tabular-nums w-12 text-right"
                  :class="trendFor(p)!.changePct < 0
                    ? 'text-[var(--exile-color-signal-error)]'
                    : 'text-[var(--exile-color-signal-success)]'"
                >{{ fmtPct(trendFor(p)!.changePct) }}</span>
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
  </div>
</template>
