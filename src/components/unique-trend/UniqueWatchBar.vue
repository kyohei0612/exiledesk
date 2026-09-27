<!--
  UniqueWatchBar.vue — お気に入りの取引所の最安値を記録する設定 (2026-09-27)

  オーナー:「ユニークのお気に入りは自動監視と同じようにその商品の最安値を記録しよう」「取得間隔は一応決めれるけどマックス 24 時間」
  「自動取得なしってプルダウンも。ユニークに関しては自動取得ありかなしの 2 択」「お気に入りは最大 5 個まで」。
  中身は [[unique-watch.ts]]。取引所を使えるのは 1 つだけなので、ボタンは 使用中 = 中止 / 止めた = 再開 / 他が使用中 = 押せない。
-->
<script setup lang="ts">
import { computed } from "vue";
import { uniqueWatch, UNIQUE_WATCH_HOURS } from "../../state/unique-watch";
import { FAV_MAX, uniqueFavorites } from "../../state/unique-favorites";
import { tradeLock, tradeRefetch } from "../../state/trade-lock";

const favCount = computed(() => uniqueFavorites.set.value.size);
const btn = computed(() => tradeRefetch("unique-fav", uniqueWatch.busy.value, "今すぐ取得"));
function onBtn(): void {
  if (btn.value.action === "stop") tradeLock.stop("unique-fav");
  else void uniqueWatch.runNow();
}
const fmt = (t: number | null): string =>
  t ? new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
</script>

<template>
  <section class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-sky-400/30 bg-sky-500/[0.05] px-3 py-2 text-[12px]">
    <b class="text-sky-200">お気に入りの最安値を記録</b>
    <span class="opacity-60">♥ {{ favCount }} / {{ FAV_MAX }} 個 · 名前だけで探した取引所の即時購入の最安値を、取るたびにグラフへ</span>
    <label class="flex items-center gap-1.5">
      <span class="opacity-60">自動取得</span>
      <select :value="uniqueWatch.hours.value" class="num w-36 py-0.5 text-[12px]" @change="uniqueWatch.setHours(Number(($event.target as HTMLSelectElement).value))">
        <option v-for="h in UNIQUE_WATCH_HOURS" :key="h" :value="h">{{ h === 0 ? "自動取得なし" : `${h} 時間ごと` }}</option>
      </select>
    </label>
    <span v-if="uniqueWatch.busy.value && uniqueWatch.current.value" class="animate-pulse text-amber-200">取得中: {{ uniqueWatch.current.value }}</span>
    <span class="opacity-60">最後 {{ fmt(uniqueWatch.lastRun.value || null) }}<template v-if="uniqueWatch.nextAt.value"> · 次 {{ fmt(uniqueWatch.nextAt.value) }}</template></span>
    <button
      type="button"
      :disabled="btn.disabled || (!favCount && btn.action !== 'stop')"
      class="ml-auto rounded-lg border px-2 py-0.5 disabled:opacity-40"
      :class="btn.action === 'stop' ? 'border-rose-400/60 text-rose-200 hover:bg-rose-500/10' : 'border-sky-400/50 text-sky-200 hover:bg-sky-500/10'"
      @click="onBtn"
    >
      {{ btn.label }}
    </button>
  </section>
</template>
