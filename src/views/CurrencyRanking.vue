<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
  fetchSnapshotPairs,
  rankPairsByVolume,
  fetchLeagues,
  type RankedPair,
  type League,
} from "../api/poe2scout";
import { jaCurrency } from "../i18n/currencies-ja";
import { jaCategory } from "../i18n/categories-ja";

const leagues = ref<League[]>([]);
const league = ref<string>("Fate of the Vaal");
const divinePrice = ref<number>(1);
const chaosDivinePrice = ref<number>(1); // 1 Chaos = X Divine (リーグ末期は >1 = Chaos > Divine 逆転)
const divineIcon = ref<string>("");
const chaosIcon = ref<string>("");
const exaltedIcon = ref<string>("");
const ranking = ref<RankedPair[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const lastUpdated = ref<Date | null>(null);
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
    }
  } catch (e) {
    console.warn("Failed to load leagues, using default:", e);
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

    const pairs = await fetchSnapshotPairs(league.value);
    ranking.value = rankPairsByVolume(
      pairs,
      divinePrice.value,
      chaosDivinePrice.value,
    );
    lastUpdated.value = new Date();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function onLeagueChange() {
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

/**
 * 神換算列で表示する「1.0」側のアイテム（より価値の高い方）。
 * Divine ペアは非 Divine 側 (one)。非 Divine ペアは Divine 価格が高い方。
 */
function primarySide(p: RankedPair): {
  text: string;
  icon: string;
  divinePrice: number;
  chaosPrice: number;
  exaltedPrice: number;
} {
  if (p.containsDivine) {
    return {
      text: p.oneText,
      icon: p.oneIcon,
      divinePrice: p.oneDivinePrice,
      chaosPrice: p.oneChaosPrice,
      exaltedPrice: p.oneRelativePrice,
    };
  }
  if (p.oneDivinePrice >= p.twoDivinePrice) {
    return {
      text: p.oneText,
      icon: p.oneIcon,
      divinePrice: p.oneDivinePrice,
      chaosPrice: p.oneChaosPrice,
      exaltedPrice: p.oneRelativePrice,
    };
  }
  return {
    text: p.twoText,
    icon: p.twoIcon,
    divinePrice: p.twoDivinePrice,
    chaosPrice: p.twoChaosPrice,
    exaltedPrice: p.twoRelativePrice,
  };
}


// ドロップダウンに出すカテゴリ集計 (2026-05-22 修正):
// - Divine ペア: Divine は価格基準なので、非 Divine 側 (oneCategoryApiId) のカテゴリで集計
// - 非 Divine ペア: 両者同カテゴリのみ集計 (リチュアル ↔ アビスのような混在ペアは除外)
/**
 * 各 Item ApiId について、「Divine ペア / Exalted ペア / Chaos ペアそれぞれでの
 * Item 1 個あたりの神換算価格」を集めるマップ。同 Item が複数の異通貨ペアに登場すれば、
 * 各ペアで独立した relativePrice → 神換算値の差が「市場乖離 (アービトラージ機会)」。
 *
 * counterpart = "divine" | "exalted" | "chaos" の場合のみ拾う (他通貨は対象外)。
 */
const itemDivineEquivMap = computed(() => {
  const m = new Map<string, { divine?: number; exalted?: number; chaos?: number }>();
  for (const r of ranking.value) {
    // (oneApiId, twoApiId) のうち、片方が divine/exalted/chaos ならそれを counterpart、もう一方を Item とみなす
    const counterparts = new Set(["divine", "exalted", "chaos"]);
    let itemApiId: string | null = null;
    let counterpart: "divine" | "exalted" | "chaos" | null = null;
    let itemDivineEquiv = 0;
    if (counterparts.has(r.oneApiId) && !counterparts.has(r.twoApiId)) {
      itemApiId = r.twoApiId;
      counterpart = r.oneApiId as "divine" | "exalted" | "chaos";
      itemDivineEquiv = r.twoDivinePrice;
    } else if (counterparts.has(r.twoApiId) && !counterparts.has(r.oneApiId)) {
      itemApiId = r.oneApiId;
      counterpart = r.twoApiId as "divine" | "exalted" | "chaos";
      itemDivineEquiv = r.oneDivinePrice;
    } else {
      continue;
    }
    if (!itemApiId || !counterpart) continue;
    const entry = m.get(itemApiId) ?? {};
    entry[counterpart] = itemDivineEquiv;
    m.set(itemApiId, entry);
  }
  return m;
});

/**
 * 行の primarySide Item について、Divine を基準として「高貴経由 / カオス経由で取引した
 * 場合の神換算差分」を返す。差分が 0 (もしくは比較対象なし) なら undefined。
 */
function arbitrageDelta(
  p: RankedPair,
  via: "exalted" | "chaos",
): number | undefined {
  // primarySide の Item ApiId を特定 (containsDivine なら one=非Divine、それ以外は価値高い側)
  const itemApiId = p.containsDivine
    ? p.oneApiId
    : p.oneDivinePrice >= p.twoDivinePrice
      ? p.oneApiId
      : p.twoApiId;
  const entry = itemDivineEquivMap.value.get(itemApiId);
  if (!entry || entry.divine === undefined || entry[via] === undefined) {
    return undefined;
  }
  const diff = entry[via]! - entry.divine;
  // ノイズ閾値: 0.0001 神未満は表示しない
  if (Math.abs(diff) < 0.0001) return undefined;
  return diff;
}

function fmtDelta(d: number): string {
  const sign = d >= 0 ? "+" : "−";
  return `${sign}${fmt(Math.abs(d))} 神`;
}

// カテゴリ別の表示用リスト。各カテゴリで取引量最大のアイテムのアイコンを代表に使う。
// Divine ペア OR 両者同カテゴリの場合のみ集計対象 (異カテゴリペアは「すべて」のみ)。
interface CategoryDisplay {
  id: string;
  count: number;
  icon: string;
}
const categoryDisplayList = computed<CategoryDisplay[]>(() => {
  const acc = new Map<string, { count: number; maxVolume: number; icon: string }>();
  for (const r of ranking.value) {
    let cat: string | null = null;
    let icon = "";
    if (r.containsDivine) {
      cat = r.oneCategoryApiId;
      icon = r.oneIcon;
    } else if (r.oneCategoryApiId === r.twoCategoryApiId) {
      cat = r.oneCategoryApiId;
      icon = r.oneDivinePrice >= r.twoDivinePrice ? r.oneIcon : r.twoIcon;
    }
    if (!cat) continue;
    const entry = acc.get(cat) ?? { count: 0, maxVolume: 0, icon: "" };
    entry.count += 1;
    if (r.volume > entry.maxVolume) {
      entry.maxVolume = r.volume;
      entry.icon = icon;
    }
    acc.set(cat, entry);
  }
  return Array.from(acc.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([id, e]) => ({ id, count: e.count, icon: e.icon }));
});

const filteredRanking = computed(() => {
  let list = ranking.value;

  // カテゴリフィルタ (2026-05-22 修正):
  // - Divine ペア: Divine は価格基準。非 Divine 側 (oneCategoryApiId) のカテゴリで判定
  //   → 「リチュアル」フィルタで「Divine ↔ リチュアル素材」は表示される
  // - 非 Divine ペア: 両者同カテゴリのみ表示 (リチュアル ↔ アビスのような混在は除外)
  if (categoryFilter.value !== "all") {
    list = list.filter((r) => {
      if (r.containsDivine) {
        return r.oneCategoryApiId === categoryFilter.value;
      }
      return (
        r.oneCategoryApiId === categoryFilter.value &&
        r.twoCategoryApiId === categoryFilter.value
      );
    });
  }

  // 検索フィルタ（日英両方の名前を対象）
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter((r) => {
      const oneEn = r.oneText.toLowerCase();
      const twoEn = r.twoText.toLowerCase();
      const oneJa = jaCurrency(r.oneText).toLowerCase();
      const twoJa = jaCurrency(r.twoText).toLowerCase();
      return (
        oneEn.includes(q) ||
        twoEn.includes(q) ||
        oneJa.includes(q) ||
        twoJa.includes(q)
      );
    });
  }

  return list;
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
          <span v-if="ranking.length"> ／ {{ ranking.length }} ペア</span>
          <span v-if="divinePrice > 1">
            ／ 1 神 = {{ fmt(divinePrice) }} 高貴 ／ 1 神 = {{ fmt(chaosDivinePrice) }} カオス
          </span>
          <!-- L6: divinePrice <= 1 (リーグ初日 / データ未確定) のフォールバック -->
          <span
            v-else-if="ranking.length"
            class="text-[var(--exile-color-text-tertiary)] italic"
          >
            ／ 神価格は未確定 (1 神 = 1 高貴 仮置き)
          </span>
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
      <p class="mb-2">該当するペアがありません</p>
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
            <th class="text-left px-3 py-3 whitespace-nowrap">カレンシーペア</th>
            <th class="text-right px-3 py-3 whitespace-nowrap">神 換算</th>
            <th class="text-right px-3 py-3 whitespace-nowrap">高貴 換算</th>
            <th class="text-right px-3 py-3 whitespace-nowrap">カオス 換算</th>
          </tr>
        </thead>
        <tbody>
          <!-- 単一ランキング（神換算降順）— ペア違いで同じアイテムが複数行に出るのは仕様 -->
          <tr
            v-for="(p, i) in filteredRanking"
            :key="p.id"
            class="border-t border-[var(--exile-color-border-subtle)] hover:bg-[var(--exile-color-bg-elevated)] transition"
          >
            <td class="px-3 py-3 text-[var(--exile-color-text-secondary)] tabular-nums whitespace-nowrap">{{ i + 1 }}</td>
            <td class="px-3 py-3 whitespace-nowrap">
              <div class="flex items-center gap-2 whitespace-nowrap">
                <img v-if="p.oneIcon" :src="p.oneIcon" :alt="p.oneText" class="w-6 h-6 object-contain shrink-0" loading="lazy" />
                <span class="text-[var(--exile-color-text-primary)]">{{ jaCurrency(p.oneText) }}</span>
                <span class="text-[var(--exile-color-text-secondary)] mx-1">↔</span>
                <img v-if="p.twoIcon" :src="p.twoIcon" :alt="p.twoText" class="w-6 h-6 object-contain shrink-0" loading="lazy" />
                <span class="text-[var(--exile-color-text-primary)]">{{ jaCurrency(p.twoText) }}</span>
              </div>
            </td>
            <td class="px-2 py-3 text-right">
              <div class="flex items-center justify-end gap-1 text-sm tabular-nums">
                <span class="text-[var(--exile-color-text-primary)]">1.0</span>
                <img v-if="primarySide(p).icon" :src="primarySide(p).icon" :alt="primarySide(p).text" class="w-5 h-5 object-contain" loading="lazy" />
                <span class="text-[var(--exile-color-text-secondary)]">⇄</span>
                <span class="text-[var(--exile-color-accent-focus)]">{{ fmt(primarySide(p).divinePrice) }}</span>
                <img v-if="divineIcon" :src="divineIcon" alt="神" class="w-5 h-5 object-contain" loading="lazy" />
              </div>
            </td>
            <td class="px-2 py-3 text-right">
              <div class="flex items-center justify-end gap-1 text-sm tabular-nums">
                <span class="text-[var(--exile-color-text-primary)]">1.0</span>
                <img v-if="primarySide(p).icon" :src="primarySide(p).icon" :alt="primarySide(p).text" class="w-5 h-5 object-contain" loading="lazy" />
                <span class="text-[var(--exile-color-text-secondary)]">⇄</span>
                <span class="text-[var(--exile-color-accent-focus)]">{{ fmt(primarySide(p).exaltedPrice) }}</span>
                <img v-if="exaltedIcon" :src="exaltedIcon" alt="高貴" class="w-5 h-5 object-contain" loading="lazy" />
                <span
                  v-if="arbitrageDelta(p, 'exalted') !== undefined"
                  :class="[
                    'text-[10px] ml-1',
                    arbitrageDelta(p, 'exalted')! < 0
                      ? 'text-[var(--exile-color-signal-error)]'
                      : 'text-[var(--exile-color-signal-success)]',
                  ]"
                  :title="arbitrageDelta(p, 'exalted')! < 0 ? '神基準で損' : '神基準で得'"
                >{{ fmtDelta(arbitrageDelta(p, 'exalted')!) }}</span>
              </div>
            </td>
            <td class="px-2 py-3 text-right">
              <div class="flex items-center justify-end gap-1 text-sm tabular-nums">
                <span class="text-[var(--exile-color-text-primary)]">1.0</span>
                <img v-if="primarySide(p).icon" :src="primarySide(p).icon" :alt="primarySide(p).text" class="w-5 h-5 object-contain" loading="lazy" />
                <span class="text-[var(--exile-color-text-secondary)]">⇄</span>
                <span class="text-[var(--exile-color-accent-focus)]">{{ fmt(primarySide(p).chaosPrice) }}</span>
                <img v-if="chaosIcon" :src="chaosIcon" alt="カオス" class="w-5 h-5 object-contain" loading="lazy" />
                <span
                  v-if="arbitrageDelta(p, 'chaos') !== undefined"
                  :class="[
                    'text-[10px] ml-1',
                    arbitrageDelta(p, 'chaos')! < 0
                      ? 'text-[var(--exile-color-signal-error)]'
                      : 'text-[var(--exile-color-signal-success)]',
                  ]"
                  :title="arbitrageDelta(p, 'chaos')! < 0 ? '神基準で損' : '神基準で得'"
                >{{ fmtDelta(arbitrageDelta(p, 'chaos')!) }}</span>
              </div>
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
      ／レート表記は poe.ninja 流「X 神 ⇄ 1.0 アイテム」
    </p>
    </div>
  </div>
</template>
