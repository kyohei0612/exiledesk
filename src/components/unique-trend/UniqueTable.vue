<!--
  UniqueTable.vue — ユニーク装備価格推移の本体テーブル (2026-09-26)
  1 行 = 1 ユニーク (poe.ninja の行。ルーンの熟達品は別の行)。日本語名を大きく、英名とベースを小さく。
  見出しを押すと並び替え、行を押すと詳細が開く。名前の右の ♡ でお気に入り。
  お気に入りの一覧 (favMode) は、値段を取引所の最安値 (名前だけ・コラプト等の指定なし。unique-watch.ts が記録) にし、
  「(コラプトなし)」「コラプト」の札を出さず、純正品とコラプト品の行を 1 行にまとめる
  (2026-09-28 オーナー「お気に入りは文字通り最安値だから、コラプト等の指定はお気に入りリスト内の場合は外して。最安値指定なしの金額を表示」)。
-->
<script setup lang="ts">
import { useFlash } from "../../utils/use-flash";
import Disclosure from "../ui/Disclosure.vue";
import Sparkline from "../currency/Sparkline.vue";
import { computed } from "vue";
import { uniqueWatch } from "../../state/unique-watch";
import { hoverStack } from "../../state/hover-stack";
import { toCss } from "../../utils/zoom";
import UniqueDetail from "./UniqueDetail.vue";
import { displayCurrency } from "../../state/display-currency";
import { FAV_MAX, uniqueFavorites } from "../../state/unique-favorites";
import { openTrade2ForUnique } from "../../services/trade2/open";
import { marketStore } from "../../state/market-store";
import type { SortKey, UniqueRow, UniqueTrend } from "../../views/unique-trend/useUniqueTrend";
import { uniqueArt } from "../../services/assets/unique-art";

const props = defineProps<{ rows: UniqueRow[]; trends: Map<number, UniqueTrend>; openId: number | null; favMode?: boolean }>();
/** お気に入りの一覧は 名前 + ベース で 1 行 (poe.ninja の純正品とコラプト品の行をまとめる) */
const list = computed(() => {
  if (!props.favMode) return props.rows;
  const seen = new Set<string>();
  return props.rows.filter((r) => (seen.has(r.fav) ? false : (seen.add(r.fav), true)));
});
/** 取引所の最安値の一番新しい記録 (無ければ null) */
function lastCheapest(r: UniqueRow): { ex: number | null; t: number; src: string } | null {
  const pts = uniqueWatch.history.value[r.fav];
  const p = pts?.[pts.length - 1];
  if (!p) return null;
  const src = p.src ? `出品の値段: ${p.src.amount} ${p.src.currency} (出品者 ${p.src.account || "?"}${p.src.type ? `、${p.src.type}` : ""}) / 出品 ${p.total} 件` : `出品 ${p.total} 件`;
  return { ex: p.ex, t: p.t, src };
}
const agoJa = (t: number): string => {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 60 ? `${m} 分前` : m < 1440 ? `${Math.round(m / 60)} 時間前` : `${Math.round(m / 1440)} 日前`;
};
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
/** ホバーのカード (ゲームのアイテム画面と同じ見た目。重なりは hover-stack。オーナー 2026-09-26) */
function hoverAt(r: UniqueRow, ev: MouseEvent): void {
  hoverStack.openRoot({ kind: "unique", row: r }, toCss(ev.clientX), toCss(ev.clientY));
}
function tradeFromRow(r: UniqueRow): void {
  hoverStack.clear();
  void openTrade(r);
}
const th = "px-3 py-3 whitespace-nowrap";
const sortable = "cursor-pointer hover:text-[var(--exile-color-text-primary)]";
const on = "text-[var(--exile-color-accent-focus)]";

/** 変化率の見出しは 高騰率 ↔ 下落率 を切り替える */
function clickChange() {
  sortKey.value = sortKey.value === "rise" ? "fall" : "rise";
}
/** お気に入りは 5 個まで (取引所で最安値を記録するため。オーナー 2026-09-27)。付けられなかった行に数秒だけ断りを出す */
const favNote = useFlash();
const favFull = favNote.msg;
function onFav(key: string): void {
  if (uniqueFavorites.toggle(key)) return;
  favNote.flash(key);
}
</script>

<template>
  <div class="rounded-xl border border-white/10 overflow-hidden">
    <table class="w-full text-base">
      <thead class="bg-[var(--exile-color-bg-surface)] text-xs tracking-wider text-[var(--exile-color-text-secondary)]">
        <tr>
          <th :class="th" class="text-left w-12">#</th>
          <th :class="[th, sortable, sortKey === 'name' ? on : '']" class="text-left" @click="sortKey = 'name'">アイテム{{ sortKey === "name" ? " ▲" : "" }}</th>
          <th :class="[th, sortable, sortKey === 'price' ? on : '']" class="text-right" @click="sortKey = 'price'">{{ favMode ? "最安値 (指定なし)" : "今の値段" }}{{ sortKey === "price" ? " ▼" : "" }}</th>
          <th :class="th" class="text-right">出品数</th>
          <th :class="[th, sortable, sortKey === 'rise' || sortKey === 'fall' ? on : '']" class="text-right w-48" @click="clickChange">
            7 日の推移{{ sortKey === "rise" ? " ▼" : sortKey === "fall" ? " ▲" : "" }}
          </th>
          <th :class="th" class="text-right w-28">詳細</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(r, i) in list" :key="r.itemId">
          <tr
            class="cursor-pointer transition"
            :class="openId === r.itemId ? 'bg-[var(--exile-color-bg-elevated)]' : ['hover:bg-[var(--exile-color-bg-elevated)]', i % 2 ? 'bg-white/[0.025]' : '']"
            @click="emit('toggle', r.itemId)"
          >
            <td class="px-3 py-2.5 text-[var(--exile-color-text-secondary)] tabular-nums">{{ i + 1 }}</td>
            <!-- 名前の列が残りの幅を取り、長い名前は切る (2026-10-10: 枠に入れたら右端の「詳細」が切れた) -->
            <td class="px-3 py-2.5 w-full max-w-0">
              <div class="flex items-center gap-3 min-w-0">
                <!-- poe.ninja の絵が無い時は同梱のユニークの絵 (2026-09-29) -->
                <img v-if="r.icon || uniqueArt(r.nameEn)" :src="r.icon || uniqueArt(r.nameEn)!" :alt="r.nameEn" class="w-9 h-9 object-contain shrink-0" loading="lazy" />
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5 min-w-0 text-[var(--exile-color-text-primary)]">
                    <!-- 名前に乗せると色が変わる (下線の点線はチカチカするので外した、2026-10-09)。名前にカーソルでゲームと同じカード (オーナー 2026-09-26「列にホバーで表示されるから分かりづらい」) -->
                    <span
                      class="g-hover-name truncate"
                      @mouseenter="(ev) => hoverAt(r, ev)"
                      @mouseleave="hoverStack.leave()"
                    >{{ r.nameJa }}</span>
                    <span v-if="r.corrupted && !favMode" class="shrink-0 text-[11px] text-[var(--exile-color-signal-error)]">コラプト</span>
                    <!-- お気に入りは名前の右 (オーナー 2026-09-26) -->
                    <button
                      type="button"
                      class="shrink-0 w-6 h-6 -my-1 rounded text-base leading-none transition"
                      :class="uniqueFavorites.set.value.has(r.fav) ? 'text-[#e25c6a]' : 'text-[var(--exile-color-text-tertiary)] hover:text-[#e25c6a]'"
                      :title="uniqueFavorites.set.value.has(r.fav) ? 'お気に入りから外す' : 'お気に入りに入れる'"
                      @click.stop="onFav(r.fav)"
                    >
                      {{ uniqueFavorites.set.value.has(r.fav) ? "♥" : "♡" }}
                    </button>
                    <span v-if="favFull === r.fav" class="shrink-0 rounded bg-rose-500/15 px-1.5 text-[10px] text-rose-300">お気に入りは {{ FAV_MAX }} 個まで</span>
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
            <!-- お気に入りの一覧: 取引所の最安値 (指定なし) -->
            <td v-if="favMode" class="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-sm text-[var(--exile-color-accent-focus)]">
              <template v-if="lastCheapest(r)?.ex != null">
                <span :title="lastCheapest(r)!.src">{{ money(lastCheapest(r)!.ex!) }}</span>
                <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">取引所の最安値 · {{ agoJa(lastCheapest(r)!.t) }}</div>
              </template>
              <span v-else-if="lastCheapest(r)" class="text-xs text-[var(--exile-color-text-tertiary)]">出品なし</span>
              <span v-else class="text-xs text-[var(--exile-color-text-tertiary)]" title="上の「お気に入りの最安値を記録」で取ると出ます">未取得</span>
            </td>
            <td v-else class="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-sm text-[var(--exile-color-accent-focus)]">
              {{ money(r.exalted) }}
              <!-- poe.ninja の値段はコラプトしていない純正品 (オーナー 2026-09-26「コラプトなしってちっさく書こうか、値段の後ろに ()」) -->
              <span v-if="!r.corrupted" class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)]">(コラプトなし)</span>
            </td>
            <td class="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-sm text-[var(--exile-color-text-secondary)]">{{ r.listings || "—" }}</td>
            <td class="px-3 py-2.5">
              <Sparkline v-if="trends.get(r.itemId)" :trend="trends.get(r.itemId)!" :width="96" :height="24" class="gap-2" />
              <div v-else class="text-right text-xs text-[var(--exile-color-text-tertiary)] pr-1">—</div>
            </td>
            <!-- 詳細を開く (取引所へは名前の横の「トレード2へ」。オーナー 2026-09-26「右側は詳細って書いたら開いてくれるから、トレードへ遷移しなくていい」) -->
            <td class="px-3 py-2.5 text-right">
              <Disclosure :open="openId === r.itemId" kind="detail" class="text-xs" :title="openId === r.itemId ? '詳細を閉じる' : 'グラフと取引所へのボタンを開く'" @click.stop @update:open="emit('toggle', r.itemId)" />
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
  </div>
</template>
