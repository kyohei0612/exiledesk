<!--
  BaseHoverCard.vue — ベースのカードに乗せた時の詳しいカード (2026-10-10 オーナー「ベースもホバーで少しおいてからカード表示」)。
  一覧のカードでは切れていた素の数値・固有の効果を全部。窓の中に収める決まりは棚のカードと同じ ([[fit-card.ts]])
-->
<script setup lang="ts">
import { ref } from "vue";
import { CATALOG_CLS_JA, type CatalogRow } from "../../services/items/base-catalog";
import { useFitCard, type CardAnchor } from "../../utils/fit-card";

const props = defineProps<{ b: CatalogRow; anchor: CardAnchor; art: string | null; note?: string }>();
const box = ref<HTMLElement | null>(null);
const style = useFitCard(box, () => props.anchor, 320);
const lines = (s: string): string[] => (s ? s.split(/\s*[·/]\s*/).filter(Boolean) : []);
</script>

<template>
  <Teleport to="body">
    <div ref="box" class="pointer-events-none fixed z-[500] w-[320px] rounded-xl border border-amber-300/40 bg-[#0d0b08]/95 p-3 text-[13px] leading-relaxed shadow-[0_8px_30px_rgba(0,0,0,0.7)]" :style="style">
      <div class="flex items-center gap-3">
        <img v-if="art" :src="art" alt="" class="h-16 w-16 shrink-0 object-contain" />
        <div class="min-w-0">
          <p class="text-[15px] font-bold text-amber-100">{{ b.ja }}</p>
          <p class="text-[11px] opacity-60">{{ b.en }} · {{ CATALOG_CLS_JA.get(b.cls) ?? b.cls }}</p>
          <p v-if="b.lvl" class="text-[11px] opacity-60">要求 Lv {{ b.lvl }}</p>
        </div>
      </div>
      <div v-if="b.stats || b.implicit || note" class="mt-2 space-y-0.5 border-t border-white/10 pt-2">
        <p v-for="(l, i) in lines(b.stats)" :key="'s' + i" class="text-white/85">{{ l }}</p>
        <p v-for="(l, i) in (b.implicit ? b.implicit.split(' / ') : [])" :key="'i' + i" class="text-rarity-magic">{{ l }}</p>
        <p v-if="note" class="text-sky-300">{{ note }}</p>
      </div>
    </div>
  </Teleport>
</template>
