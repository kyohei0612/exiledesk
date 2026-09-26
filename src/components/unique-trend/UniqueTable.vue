<!--
  UniqueTable.vue — ユニーク装備価格推移の本体テーブル (2026-09-26)
  1 行 = 1 ユニーク (poe.ninja の行。ルーンの熟達品は別の行)。日本語名を大きく、英名とベースを小さく。
  見出しを押すと並び替え、行を押すと詳細が開く。名前の右の ♡ でお気に入り。
-->
<script setup lang="ts">
import { ref } from "vue";
import Sparkline from "../currency/Sparkline.vue";
import UniqueHoverCard from "./UniqueHoverCard.vue";
import { toCss } from "../../utils/zoom";
import UniqueDetail from "./UniqueDetail.vue";
import { displayCurrency } from "../../state/display-currency";
import { uniqueFavorites } from "../../state/unique-favorites";
import { openTrade2ForUnique } from "../../services/trade2/open";
import { marketStore } from "../../state/market-store";
import type { SortKey, UniqueRow, UniqueTrend } from "../../views/unique-trend/useUniqueTrend";

defineProps<{ rows: UniqueRow[]; trends: Map<number, UniqueTrend>; openId: number | null }>();
const sortKey = defineModel<SortKey>("sortKey", { required: true });
const emit = defineEmits<{ toggle: [id: number] }>();

const money = (ex: number) => displayCurrency.money(ex);
/** 取引所をブラウザで開く (設定の開く先 = 日本語サイト。即時購入。コラプトは指定しない。オーナー 2026-09-26) */
async function openTrade(r: UniqueRow): Promise<void> {
  try {
    await openTrade2ForUnique({
      nameEn: r.nameEn,
      baseType: r.baseEn || undefined,
      league: (marketStore.league.value?.Value ?? "").toLowerCase().replace(/\s+/g, "-"),
    });
  } catch {
    /* 開けない環境 (ブラウザ開発) は何もしない */
  }
}
/** ホバーのカード (ゲームのアイテム画面と同じ見た目。オーナー 2026-09-26) */
const hovered = ref<UniqueRow | null>(null);
const hx = ref(0);
const hy = ref(0);
function hoverAt(r: UniqueRow, ev: MouseEvent): void {
  hovered.value = r;
  hx.value = toCss(ev.clientX);
  hy.value = toCss(ev.clientY);
}
function hoverMove(ev: MouseEvent): void {
  if (!hovered.value) return;
  hx.value = toCss(ev.clientX);
  hy.value = toCss(ev.clientY);
}
function tradeFromRow(r: UniqueRow): void {
  hovered.value = null;
  void openTrade(r);
}
const th = "px-3 py-3 whitespace-nowrap";
const sortable = "cursor-pointer hover:text-[var(--exile-color-text-primary)]";
const on = "text-[var(--exile-color-accent-focus)]";

/** 変化率の見出しは 高騰率 ↔ 下落率 を切り替える */
function clickChange() {
  sortKey.value = sortKey.value === "rise" ? "fall" : "rise";
}
</script>

<template>
  <div class="rounded-lg border border-[var(--exile-color-border-subtle)] overflow-hidden">
    <table class="w-full text-base">
      <thead class="bg-[var(--exile-color-bg-surface)] text-xs tracking-wider text-[var(--exile-color-text-secondary)]">
        <tr>
          <th :class="th" class="text-left w-12">#</th>
          <th :class="[th, sortable, sortKey === 'name' ? on : '']" class="text-left" @click="sortKey = 'name'">アイテム{{ sortKey === "name" ? " ▲" : "" }}</th>
          <th :class="[th, sortable, sortKey === 'price' ? on : '']" class="text-right" @click="sortKey = 'price'">今の値段{{ sortKey === "price" ? " ▼" : "" }}</th>
          <th :class="th" class="text-right">出品数</th>
          <th :class="[th, sortable, sortKey === 'rise' || sortKey === 'fall' ? on : '']" class="text-right w-48" @click="clickChange">
            7 日の推移{{ sortKey === "rise" ? " ▼" : sortKey === "fall" ? " ▲" : "" }}
          </th>
          <th :class="th" class="text-right w-28">取引所</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(r, i) in rows" :key="r.itemId">
          <tr
            class="border-t border-[var(--exile-color-border-subtle)] cursor-pointer transition"
            :class="openId === r.itemId ? 'bg-[var(--exile-color-bg-elevated)]' : 'hover:bg-[var(--exile-color-bg-elevated)]'"
            @click="emit('toggle', r.itemId)"
          >
            <td class="px-3 py-2.5 text-[var(--exile-color-text-secondary)] tabular-nums">{{ i + 1 }}</td>
            <td class="px-3 py-2.5">
              <div class="flex items-center gap-3 min-w-0">
                <img v-if="r.icon" :src="r.icon" :alt="r.nameEn" class="w-9 h-9 object-contain shrink-0" loading="lazy" />
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5 min-w-0 text-[var(--exile-color-text-primary)]">
                    <!-- 名前に下線。名前にカーソルでゲームと同じカード (オーナー 2026-09-26「列にホバーで表示されるから分かりづらい」) -->
                    <span
                      class="truncate underline decoration-dotted decoration-[var(--exile-color-text-tertiary)] underline-offset-4 cursor-help"
                      @mouseenter="(ev) => hoverAt(r, ev)"
                      @mousemove="hoverMove"
                      @mouseleave="hovered = null"
                    >{{ r.nameJa }}</span>
                    <span v-if="r.corrupted" class="shrink-0 text-[11px] text-[var(--exile-color-signal-error)]">コラプト</span>
                    <!-- お気に入りは名前の右 (オーナー 2026-09-26) -->
                    <button
                      type="button"
                      class="shrink-0 w-6 h-6 -my-1 rounded text-base leading-none transition"
                      :class="uniqueFavorites.set.value.has(r.fav) ? 'text-[#e25c6a]' : 'text-[var(--exile-color-text-tertiary)] hover:text-[#e25c6a]'"
                      :title="uniqueFavorites.set.value.has(r.fav) ? 'お気に入りから外す' : 'お気に入りに入れる'"
                      @click.stop="uniqueFavorites.toggle(r.fav)"
                    >
                      {{ uniqueFavorites.set.value.has(r.fav) ? "♥" : "♡" }}
                    </button>
                    <!-- 取引所へ (右端のボタンと同じ。オーナー 2026-09-26「ハートの横にもトレードサイトへいかすボタン」) -->
                    <button
                      type="button"
                      class="shrink-0 -my-1 px-1.5 py-0.5 rounded border border-[var(--exile-color-border-subtle)] text-[10px] leading-none text-[var(--exile-color-text-secondary)] hover:border-[var(--exile-color-accent-focus)] hover:text-[var(--exile-color-accent-focus)] transition"
                      title="取引所 (即時購入) をブラウザで開く"
                      @click.stop="tradeFromRow(r)"
                    >
                      トレード2へ
                    </button>
                  </div>
                  <div class="text-[11px] text-[var(--exile-color-text-tertiary)] truncate">
                    <span v-if="r.baseJa">{{ r.baseJa }} · </span>{{ r.nameEn }}{{ r.baseEn ? ` ${r.baseEn}` : "" }}
                  </div>
                </div>
              </div>
            </td>
            <td class="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-sm text-[var(--exile-color-accent-focus)]">{{ money(r.exalted) }}</td>
            <td class="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-sm text-[var(--exile-color-text-secondary)]">{{ r.listings || "—" }}</td>
            <td class="px-3 py-2.5">
              <Sparkline v-if="trends.get(r.itemId)" :trend="trends.get(r.itemId)!" :width="96" :height="24" class="gap-2" />
              <div v-else class="text-right text-xs text-[var(--exile-color-text-tertiary)] pr-1">—</div>
            </td>
            <!-- 取引所へそのまま (即時購入。API は使わず ?q= の URL を開く。オーナー 2026-09-26) -->
            <td class="px-3 py-2.5 text-right">
              <button type="button" class="rounded border border-[var(--exile-color-border-subtle)] px-2 py-0.5 text-xs hover:border-[var(--exile-color-accent-focus)] hover:text-[var(--exile-color-accent-focus)]"
                title="取引所 (即時購入・コラプトの指定なし) をブラウザで開く" @click.stop="tradeFromRow(r)">トレード2へ</button>
            </td>
          </tr>
          <tr v-if="openId === r.itemId" class="border-t border-[var(--exile-color-border-subtle)]">
            <td colspan="6" class="p-0">
              <UniqueDetail :row="r" :trend="trends.get(r.itemId)" @trade="tradeFromRow(r)" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    <UniqueHoverCard :row="hovered" :x="hx" :y="hy" />
  </div>
</template>
