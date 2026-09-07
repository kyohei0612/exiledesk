<!--
  CraftProfit.vue — クラフト収支 (2026-09-07)
  装備テキストを貼り付け → 使えるエッセンス (保証モッド) を列挙 → 完成品の相場を trade2 で調べ →
  合計コスト (ベース + 素材) / 完成品最安 / 収支 を高貴 (Exalted) 建てで出す。
    views/craft-profit/parse.ts          貼り付け解析 (日英)
    views/craft-profit/essence-plan.ts   エッセンス → 結果の mod 構成
    views/craft-profit/useCraftProfit.ts 状態 / 相場取得 / 収支
    services/trade2/pricing.ts           trade2 search + fetch → 最安 (直列 + 間隔ガード)
-->
<script setup lang="ts">
import { onMounted } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import ItemSummary from "../components/craft-profit/ItemSummary.vue";
import PlanTable from "../components/craft-profit/PlanTable.vue";
import { useCraftProfit } from "./craft-profit/useCraftProfit";

const c = useCraftProfit();

onMounted(() => {
  void c.loadMarket();
});

async function pasteFromClipboard(): Promise<void> {
  try {
    const t = await navigator.clipboard.readText();
    if (t) {
      c.text.value = t;
      c.analyze();
    }
  } catch {
    /* クリップボード権限なし: 手貼りに任せる */
  }
}
</script>

<template>
  <section class="h-full flex flex-col px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)] overflow-y-auto">
    <header class="mb-3">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">クラフト収支</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        ゲーム内で装備に Ctrl+C → ここに貼り付け。マジック装備ならエッセンス (保証モッド) で作れるレア、レア装備なら
        パーフェクトエッセンスの結果ごとに、完成品の trade2 最安値と収支 (高貴建て) を出します。
      </p>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
        素材価格: poe2scout{{ c.league.value ? ` (${c.league.value.Value})` : "" }} / 完成品: trade2 の同ベース・同 mod 以上 (保証モッドは最低ロール) の最安
        <span v-if="c.marketError.value" class="text-amber-300">— poe2scout 取得失敗: {{ c.marketError.value }}</span>
      </p>
    </header>

    <div class="flex gap-3 items-start">
      <textarea
        v-model="c.text.value"
        rows="7"
        spellcheck="false"
        placeholder="Item Class: Rings / アイテムクラス: 指輪 … (Ctrl+C したテキストをそのまま)"
        class="flex-1 font-mono text-[11px] p-2 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
      ></textarea>
      <div class="flex flex-col gap-2 w-56">
        <button
          type="button"
          @click="pasteFromClipboard"
          class="px-3 py-1.5 rounded border border-[var(--exile-color-border-brass)] text-[12px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]"
        >
          📋 クリップボードから貼り付け
        </button>
        <button
          type="button"
          @click="c.analyze()"
          class="px-3 py-1.5 rounded bg-[var(--exile-color-accent-focus)] text-black text-[12px] font-medium hover:bg-[var(--exile-color-accent-focus-hover)]"
        >
          解析
        </button>
        <label class="text-[11px] text-[var(--exile-color-text-secondary)]">
          ベース購入価格 (高貴、自前なら 0)
          <input
            v-model.number="c.baseCost.value"
            type="number"
            min="0"
            step="0.1"
            class="mt-1 w-full px-2 py-1 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] text-[12px] tabular-nums"
          />
        </label>
      </div>
    </div>

    <p v-if="c.parseError.value" class="mt-2 text-[12px] text-amber-300">⚠️ {{ c.parseError.value }}</p>

    <div v-if="c.item.value" class="mt-3 space-y-3">
      <ItemSummary :item="c.item.value" />

      <div class="flex items-center gap-3">
        <button
          type="button"
          @click="c.priceAll()"
          :disabled="c.pricing.value || c.rows.value.length === 0"
          class="px-3 py-1.5 rounded bg-[var(--exile-color-accent-focus)] text-black text-[12px] font-medium hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-50"
        >
          {{ c.pricing.value ? `相場を調査中… ${c.progress.value.done} / ${c.progress.value.total}` : "🔍 全候補の相場を調べる" }}
        </button>
        <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">trade2 のレート制限のため 1 件あたり約 10 秒かかります</span>
      </div>
      <p v-if="c.rateLimitedUntil.value" class="text-[12px] text-amber-300">
        ⚠️ trade2 にレート制限されました。{{ new Date(c.rateLimitedUntil.value).toLocaleTimeString() }} 以降に「全候補の相場を調べる」を押し直してください (残りは未調査のままです)
      </p>

      <PlanTable
        :rows="c.rows.value"
        :base-cost="c.baseCost.value"
        :pricing="c.pricing.value"
        :profit-of="c.profitOf"
        @price="(row, op) => c.priceOne(row, op)"
        @open="(url) => openUrl(url)"
      />
    </div>
  </section>
</template>
