<!--
  BuildBulkTable.vue — 忍者ビルドコピーのルーン / リネージュサポートの表 (2026-09-26)
  同じ物はまとめて「× 個数」、単価と小計 (オーナー「被ってる奴は ×3 とか書いて値段」)。
  どれもゲームのカレンシー取引所で買えるので「トレード2へ」は付けない (オーナー 2026-09-26「取引所から買える奴はトレード2へ行かなくていい」)。
  リネージュサポートは名前にカーソルでジェムのカード (GemName)。
-->
<script setup lang="ts">
import { computed } from "vue";
import BaseCard from "../decor/BaseCard.vue";
import GemName from "../decor/GemName.vue";
import { displayCurrency } from "../../state/display-currency";
import type { BulkRow } from "../../views/build-copy/useBuildCopy";
import type { RankedItem } from "../../api/poe2scout";
import { hoverStack } from "../../state/hover-stack";
import { marketStore } from "../../state/market-store";
import { toCss } from "../../utils/zoom";

const props = defineProps<{ title: string; rows: BulkRow[]; empty: string; gem?: boolean }>();
const money = (ex: number) => displayCurrency.money(ex);
/** ルーンの名前にカーソル: カレンシーランキングと同じカード (相場の行から絵を借りる) */
function openCurrency(r: BulkRow, ev: MouseEvent): void {
  const it = marketStore.items.value.find((x) => x.Text === r.nameEn);
  const item = { apiId: it?.ApiId ?? r.nameEn, itemId: it?.ItemId ?? 0, text: r.nameEn, icon: it?.IconUrl ?? "", categoryApiId: it?.CategoryApiId ?? "", groupId: "", subJa: null, exaltedPrice: r.unit ?? 0, divinePrice: 0, chaosPrice: 0 } as RankedItem;
  hoverStack.openRoot({ kind: "currency", item }, toCss(ev.clientX), toCss(ev.clientY));
}
const subtotal = computed(() => props.rows.reduce((s, r) => s + (r.unit ?? 0) * r.count, 0));
</script>

<template>
  <BaseCard>
    <div class="p-4 pl-5">
      <div class="flex items-baseline justify-between mb-2">
        <h2 class="text-sm font-bold text-amber-100">{{ title }} <span class="text-[11px] font-sans tracking-normal text-[var(--exile-color-text-tertiary)]">カレンシー取引所で買えます</span></h2>
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
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.nameEn" class="border-t border-[var(--exile-color-border-subtle)]">
            <td class="py-1.5 pr-2">
              <GemName v-if="gem" :en="r.nameEn" :label="r.nameJa" />
              <span
                v-else
                class="underline decoration-dotted decoration-[var(--exile-color-text-tertiary)] underline-offset-4 cursor-help"
                @mouseenter="(ev) => openCurrency(r, ev)"
                @mouseleave="hoverStack.leave()"
                >{{ r.nameJa }}</span
              >
            </td>
            <td class="py-1.5 text-right tabular-nums text-[var(--exile-color-text-secondary)]">×{{ r.count }}</td>
            <td class="py-1.5 text-right tabular-nums whitespace-nowrap">{{ r.unit == null ? "相場なし" : money(r.unit) }}</td>
            <td class="py-1.5 text-right tabular-nums whitespace-nowrap text-[var(--exile-color-accent-focus)]">{{ r.unit == null ? "—" : money(r.unit * r.count) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </BaseCard>
</template>
