<!--
  BuildItemTable.vue — 忍者ビルドコピーの装備の表 (2026-09-26)
  部位 / アイテム (日本語名、ベース、差したルーン) / 値段 / トレード2へ。
  ユニークは poe.ninja の相場。レアは相場を取らず、段で組んだ検索をゆるさ違いで 3 本 (完成品 → 1 つ欠けても可 → 数値なし)。
  マジック・ノーマルは値段なし (安い物)。
-->
<script setup lang="ts">
import { displayCurrency } from "../../state/display-currency";
import { jaCurrency } from "../../i18n/currencies-ja";
import type { ItemRow } from "../../views/build-copy/useBuildCopy";

defineProps<{ rows: ItemRow[] }>();
const emit = defineEmits<{ trade: [r: ItemRow]; link: [query: unknown] }>();
const money = (ex: number) => displayCurrency.money(ex);
/** ゲームのレアリティの色 */
const COLOR: Record<string, string> = { UNIQUE: "text-[#af6025]", RELIC: "text-[#82ad6a]", RARE: "text-[#e8d77a]", MAGIC: "text-[#8888ff]", NORMAL: "text-[#c8c8c8]" };
const th = "px-3 py-2.5 whitespace-nowrap font-normal";
</script>

<template>
  <div class="rounded-lg border border-[var(--exile-color-border-subtle)] overflow-hidden">
    <table class="w-full text-[13px]">
      <thead class="bg-[var(--exile-color-bg-surface)] text-[11px] tracking-wider text-[var(--exile-color-text-secondary)]">
        <tr>
          <th :class="th" class="text-left w-32">部位</th>
          <th :class="th" class="text-left">アイテム</th>
          <th :class="th" class="text-right w-40">値段</th>
          <th :class="th" class="text-right w-28"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.i" class="border-t border-[var(--exile-color-border-subtle)] align-top">
          <td class="px-3 py-2 text-[12px] text-[var(--exile-color-text-secondary)] whitespace-nowrap">{{ r.item.slot }}</td>
          <td class="px-3 py-2">
            <div class="flex items-baseline gap-2 flex-wrap">
              <span :class="COLOR[r.item.rarity]">{{ r.nameJa }}</span>
              <span v-if="r.item.rarity === 'RARE'" class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ r.item.name }}</span>
              <span v-else-if="r.baseJa && r.baseJa !== r.nameJa" class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ r.baseJa }}</span>
              <span v-if="r.item.corrupted" class="text-[10px] text-[var(--exile-color-signal-error)]">コラプト</span>
            </div>
            <div v-if="r.item.runes.length" class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">ルーン: {{ r.item.runes.map((x) => jaCurrency(x)).join(" · ") }}</div>
          </td>
          <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap">
            <span v-if="r.price != null" class="text-[var(--exile-color-accent-focus)]">{{ money(r.price) }}</span>
            <span v-else-if="r.src === 'rare'" class="text-[12px] text-[var(--exile-color-text-tertiary)]" :title="r.rare?.missing.length ? `条件にできなかった行: ${r.rare.missing.join(' / ')}` : ''">
              取引所で確認<template v-if="r.rare"> ({{ r.rare.via === "tier" ? "段" : "文面" }}で {{ r.rare.used }} MOD)</template>
            </span>
            <span v-else-if="r.src === 'unique'" class="text-[12px] text-[var(--exile-color-text-tertiary)]">相場なし</span>
            <span v-else class="text-[12px] text-[var(--exile-color-text-tertiary)]" title="マジック・ノーマルは安いので数えません">—</span>
          </td>
          <td class="px-3 py-2 text-right whitespace-nowrap">
            <!-- レアはゆるさ違いの 3 本 (オーナー「完成品ヒットなしで徐々にゆるく」。取引所には通信しないので手で順に開く) -->
            <div v-if="r.src === 'rare' && r.rare" class="flex flex-col items-end gap-1">
              <button
                v-for="(l, li) in r.rare.links"
                :key="l.label"
                type="button"
                class="rounded border px-2 py-0.5 text-[11px] hover:border-[var(--exile-color-accent-focus)] hover:text-[var(--exile-color-accent-focus)]"
                :class="li === 0 ? 'border-[var(--exile-color-border-subtle)]' : 'border-transparent text-[var(--exile-color-text-tertiary)] underline'"
                :title="`取引所 (即時購入) をこの条件で開く`"
                @click="emit('link', l.query)"
              >
                {{ li === 0 ? "トレード2へ" : l.label }}
              </button>
            </div>
            <button
              v-else-if="r.src !== 'none' || r.baseJa"
              type="button"
              class="rounded border border-[var(--exile-color-border-subtle)] px-2 py-0.5 text-[11px] hover:border-[var(--exile-color-accent-focus)] hover:text-[var(--exile-color-accent-focus)]"
              title="取引所 (即時購入) をブラウザで開く"
              @click="emit('trade', r)"
            >
              トレード2へ
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
