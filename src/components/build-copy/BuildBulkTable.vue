<!--
  BuildBulkTable.vue — 忍者ビルドコピーのルーン / リネージュサポートの表 (2026-09-26)
  同じ物はまとめて「× 個数」、単価と小計、トレード2へ (オーナー「被ってる奴は ×3 とか書いて値段」)。
  リネージュサポートは名前にカーソルでジェムのカード (GemName)。
-->
<script setup lang="ts">
import { computed } from "vue";
import BaseCard from "../decor/BaseCard.vue";
import GemName from "../decor/GemName.vue";
import { displayCurrency } from "../../state/display-currency";
import type { BulkRow } from "../../views/build-copy/useBuildCopy";

const props = defineProps<{ title: string; rows: BulkRow[]; empty: string; gem?: boolean }>();
const emit = defineEmits<{ trade: [nameEn: string] }>();
const money = (ex: number) => displayCurrency.money(ex);
const subtotal = computed(() => props.rows.reduce((s, r) => s + (r.unit ?? 0) * r.count, 0));
</script>

<template>
  <BaseCard>
    <div class="p-4 pl-5">
      <div class="flex items-baseline justify-between mb-2">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">{{ title }}</h2>
        <span v-if="rows.length" class="tabular-nums text-[13px] text-[var(--exile-color-accent-focus)]">小計 {{ money(subtotal) }}</span>
      </div>
      <p v-if="!rows.length" class="text-[12px] text-[var(--exile-color-text-tertiary)]">{{ empty }}</p>
      <table v-else class="w-full text-[13px]">
        <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
          <tr>
            <th class="text-left font-normal pb-1"></th>
            <th class="text-right font-normal pb-1 w-12">数</th>
            <th class="text-right font-normal pb-1 w-24">単価</th>
            <th class="text-right font-normal pb-1 w-24">小計</th>
            <th class="text-right font-normal pb-1 w-24"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.nameEn" class="border-t border-[var(--exile-color-border-subtle)]">
            <td class="py-1.5 pr-2">
              <GemName v-if="gem" :en="r.nameEn" :label="r.nameJa" />
              <span v-else>{{ r.nameJa }}</span>
            </td>
            <td class="py-1.5 text-right tabular-nums text-[var(--exile-color-text-secondary)]">×{{ r.count }}</td>
            <td class="py-1.5 text-right tabular-nums whitespace-nowrap">{{ r.unit == null ? "相場なし" : money(r.unit) }}</td>
            <td class="py-1.5 text-right tabular-nums whitespace-nowrap text-[var(--exile-color-accent-focus)]">{{ r.unit == null ? "—" : money(r.unit * r.count) }}</td>
            <td class="py-1.5 pl-2 text-right whitespace-nowrap">
              <button type="button" class="rounded border border-[var(--exile-color-border-subtle)] px-2 py-0.5 text-[11px] hover:border-[var(--exile-color-accent-focus)] hover:text-[var(--exile-color-accent-focus)]" @click="emit('trade', r.nameEn)">
                トレード2へ
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </BaseCard>
</template>
