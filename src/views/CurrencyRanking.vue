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
const divineIcon = ref<string>("");
const ranking = ref<RankedPair[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const lastUpdated = ref<Date | null>(null);
const categoryFilter = ref<string>("all");

async function loadLeagues() {
  try {
    const list = await fetchLeagues();
    leagues.value = list;
    const current = list.find((l) => l.IsCurrent && !l.Value.startsWith("HC"));
    if (current) {
      league.value = current.Value;
      divinePrice.value = current.DivinePrice || 1;
      divineIcon.value = current.DivineCurrencyIconUrl || "";
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
      divineIcon.value = leagueData.DivineCurrencyIconUrl || "";
    }

    const pairs = await fetchSnapshotPairs(league.value);
    ranking.value = rankPairsByVolume(pairs, divinePrice.value);
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
 * 数値表示（poe.ninja 流の日本語ユニット 千/万/億）
 * 基本 1 桁、<1 は 2-3 桁で潰さない
 */
function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return (n / 100_000_000).toFixed(1) + "億";
  if (abs >= 10_000) return (n / 10_000).toFixed(1) + "万";
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + "千";
  if (abs >= 1) return n.toFixed(1);
  if (abs >= 0.1) return n.toFixed(2);
  if (abs >= 0.01) return n.toFixed(3);
  return n.toExponential(1);
}

function formatTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const availableCategories = computed(() => {
  const counts = new Map<string, number>();
  for (const r of ranking.value) {
    counts.set(r.oneCategoryApiId, (counts.get(r.oneCategoryApiId) ?? 0) + 1);
    counts.set(r.twoCategoryApiId, (counts.get(r.twoCategoryApiId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
});

const filteredRanking = computed(() => {
  if (categoryFilter.value === "all") return ranking.value;
  return ranking.value.filter((r) => {
    if (r.containsDivine) {
      // Divine ペアは非 Divine 側 (one) のカテゴリで判定
      return r.oneCategoryApiId === categoryFilter.value;
    }
    // 非 Divine ペアは OR モード（どちらか片側が一致）
    return (
      r.oneCategoryApiId === categoryFilter.value ||
      r.twoCategoryApiId === categoryFilter.value
    );
  });
});

const divinePairs = computed(() =>
  filteredRanking.value.filter((r) => r.containsDivine),
);
const otherPairs = computed(() =>
  filteredRanking.value.filter((r) => !r.containsDivine),
);

onMounted(async () => {
  await loadLeagues();
  refresh();
});
</script>

<template>
  <div class="p-8 overflow-auto h-full">
    <div class="flex items-start justify-between mb-4 gap-4 flex-wrap">
      <div>
        <h2 class="text-2xl font-semibold mb-1">💰 通貨ランキング</h2>
        <p class="text-xs text-[var(--color-text-muted)]">
          最終更新: <span>{{ formatTime(lastUpdated) }}</span>
          <span v-if="ranking.length"> ／ {{ ranking.length }} ペア</span>
          <span v-if="divinePrice > 1">
            ／ 1 神 = {{ fmt(divinePrice) }} 高貴なるオーブ
          </span>
        </p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <select
          v-model="categoryFilter"
          class="px-3 py-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-sm"
          title="種類で絞り込み（Divine ペアは非 Divine 側で判定）"
        >
          <option value="all">すべての種類</option>
          <option v-for="cat in availableCategories" :key="cat" :value="cat">
            {{ jaCategory(cat) }}
          </option>
        </select>
        <select
          v-model="league"
          @change="onLeagueChange"
          class="px-3 py-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-sm"
        >
          <option v-for="l in leagues" :key="l.Value" :value="l.Value">
            {{ l.Value }}{{ l.IsCurrent ? " ★" : "" }}
          </option>
          <option v-if="!leagues.length" :value="league">{{ league }}</option>
        </select>
        <button
          @click="refresh"
          :disabled="loading"
          class="px-4 py-2 rounded bg-[var(--color-accent)] text-black font-medium text-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition"
        >
          {{ loading ? "更新中…" : "🔄 更新" }}
        </button>
      </div>
    </div>

    <div
      v-if="error"
      class="p-4 mb-4 rounded bg-red-900/30 border border-red-700/50 text-red-200 text-sm"
    >
      <p class="font-semibold mb-1">取得失敗</p>
      <p class="font-mono text-xs">{{ error }}</p>
    </div>

    <div
      v-if="loading && !ranking.length"
      class="p-12 text-center text-[var(--color-text-muted)] text-sm"
    >
      データ取得中…
    </div>

    <div
      v-else-if="ranking.length"
      class="rounded-lg border border-[var(--color-border)] overflow-hidden"
    >
      <table class="w-full text-base">
        <thead
          class="bg-[var(--color-surface)] text-xs uppercase tracking-wider text-[var(--color-text-muted)]"
        >
          <tr>
            <th class="text-left px-4 py-3 w-12">#</th>
            <th class="text-left px-4 py-3">通貨ペア</th>
            <th class="text-right px-4 py-3 w-80">神 換算</th>
            <th class="text-right px-4 py-3 w-32">取引量</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="divinePairs.length" class="bg-[var(--color-surface)]/50">
            <td colspan="4" class="px-4 py-2 text-xs uppercase tracking-wider text-[var(--color-accent)]">
              💎 神（Divine）関連ペア
            </td>
          </tr>
          <tr
            v-for="(p, i) in divinePairs"
            :key="p.id"
            class="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)] transition"
          >
            <td class="px-4 py-3 text-[var(--color-text-muted)] font-mono">
              {{ i + 1 }}
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2 flex-wrap">
                <img v-if="p.oneIcon" :src="p.oneIcon" :alt="p.oneText" class="w-6 h-6 object-contain" loading="lazy" />
                <span class="text-[var(--color-text)]">{{ jaCurrency(p.oneText) }}</span>
                <span class="text-[var(--color-text-muted)] mx-1">↔</span>
                <img v-if="p.twoIcon" :src="p.twoIcon" :alt="p.twoText" class="w-6 h-6 object-contain" loading="lazy" />
                <span class="text-[var(--color-text)]">{{ jaCurrency(p.twoText) }}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-1.5 text-sm font-mono">
                <!-- Divine は two 側に正規化済 → 常に one (非 Divine) を 1.0 として神換算 -->
                <span class="text-[var(--color-accent)]">{{ fmt(p.oneDivinePrice) }}</span>
                <img v-if="divineIcon" :src="divineIcon" alt="神" class="w-5 h-5 object-contain" loading="lazy" />
                <span class="text-[var(--color-text-muted)]">⇄</span>
                <span class="text-[var(--color-text)]">1.0</span>
                <img v-if="p.oneIcon" :src="p.oneIcon" :alt="p.oneText" class="w-5 h-5 object-contain" loading="lazy" />
              </div>
            </td>
            <td class="px-4 py-3 text-right text-[var(--color-accent)] font-mono">
              {{ fmt(p.volume) }}
            </td>
          </tr>

          <tr v-if="otherPairs.length" class="bg-[var(--color-surface)]/50">
            <td colspan="4" class="px-4 py-2 text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
              その他のペア（神不在）
            </td>
          </tr>
          <tr
            v-for="(p, i) in otherPairs"
            :key="p.id"
            class="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)] transition"
          >
            <td class="px-4 py-2 text-[var(--color-text-muted)] font-mono">
              {{ divinePairs.length + i + 1 }}
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2 flex-wrap">
                <img v-if="p.oneIcon" :src="p.oneIcon" :alt="p.oneText" class="w-6 h-6 object-contain" loading="lazy" />
                <span class="text-[var(--color-text)]">{{ jaCurrency(p.oneText) }}</span>
                <span class="text-[var(--color-text-muted)] mx-1">↔</span>
                <img v-if="p.twoIcon" :src="p.twoIcon" :alt="p.twoText" class="w-6 h-6 object-contain" loading="lazy" />
                <span class="text-[var(--color-text)]">{{ jaCurrency(p.twoText) }}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex flex-col gap-1 text-sm font-mono items-end">
                <div class="flex items-center gap-1.5">
                  <span class="text-[var(--color-accent)]">{{ fmt(p.oneDivinePrice) }}</span>
                  <img v-if="divineIcon" :src="divineIcon" alt="神" class="w-5 h-5 object-contain" loading="lazy" />
                  <span class="text-[var(--color-text-muted)]">⇄</span>
                  <span class="text-[var(--color-text)]">1.0</span>
                  <img v-if="p.oneIcon" :src="p.oneIcon" :alt="p.oneText" class="w-5 h-5 object-contain" loading="lazy" />
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="text-[var(--color-accent)]">{{ fmt(p.twoDivinePrice) }}</span>
                  <img v-if="divineIcon" :src="divineIcon" alt="神" class="w-5 h-5 object-contain" loading="lazy" />
                  <span class="text-[var(--color-text-muted)]">⇄</span>
                  <span class="text-[var(--color-text)]">1.0</span>
                  <img v-if="p.twoIcon" :src="p.twoIcon" :alt="p.twoText" class="w-5 h-5 object-contain" loading="lazy" />
                </div>
              </div>
            </td>
            <td class="px-4 py-3 text-right text-[var(--color-accent)] font-mono">
              {{ fmt(p.volume) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="mt-4 text-[10px] text-[var(--color-text-muted)] text-right">
      Powered by
      <a href="https://poe2scout.com" target="_blank" class="hover:text-[var(--color-accent)] underline">poe2scout</a>
      ／ <span class="font-mono">{{ league }}</span>
      ／日本語名は v0 暫定（RePoE fork JA データに後日差替え）
      ／レート表記は poe.ninja 流「X 神 ⇄ 1.0 アイテム」
    </p>
  </div>
</template>
