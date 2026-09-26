<!--
  CurrencyHoverCard.vue — カレンシーランキングの名前にカーソルを乗せた時のカード (2026-09-26)

  ユニーク装備価格推移と同じ枠と位置決め ([[GameItemCard.vue]])。オーナー:「ユニークとカレンシー UI 回り結構似てるから
  細かい所一緒にしてほしい」「ホバーしたときの効果だけど詳細にデータ取ってほしい。合金とか…ちゃんとエッセンスとしての効果」
  「クライアントデーター照合して英語も日本語にしてね」。英語名は出さない。
  中身は [[currency-hover.ts]] (クライアント原本)。無ければ今までの効果の辞書 (effectFor)。
-->
<script setup lang="ts">
import { computed, onMounted } from "vue";
import GameItemCard from "../decor/GameItemCard.vue";
import RichText from "../decor/RichText.vue";
import type { RankedItem } from "../../api/poe2scout";
import { jaCurrency } from "../../i18n/currencies-ja";
import { effectFor } from "../../views/currency/format";
import { currencyHoverOf, loadCurrencyHover } from "../../services/currency/currency-hover";

const props = defineProps<{ item: RankedItem | null; x: number; y: number; layerKey: number; pinned: boolean; z: number }>();

onMounted(() => void loadCurrencyHover());

/** 一覧を何行まで出すか (ヴェリシウムは数百行ある) */
const MAX_LINES = 12;

const data = computed(() => {
  const it = props.item;
  if (!it) return null;
  const h = currencyHoverOf(it.text);
  const old = effectFor(it);
  return {
    name: h?.n || jaCurrency(it.text),
    stack: h?.s ?? old?.s ?? null,
    level: old?.lv ?? null,
    desc: h?.e?.length ? h.e : (old?.e ?? []),
    groups: (h?.g ?? []).map((g) => ({ h: g.h, l: g.l.slice(0, MAX_LINES), more: Math.max(0, g.l.length - MAX_LINES) })),
  };
});
</script>

<template>
  <GameItemCard :show="!!item" :x="x" :y="y" :name="data?.name ?? ''" tone="currency" :width="360" :layer-key="layerKey" :pinned="pinned" :z="z">
    <template v-if="item && data">
      <img v-if="item.icon" :src="item.icon" :alt="data.name" class="mx-auto h-14 object-contain mb-1" referrerpolicy="no-referrer" />
      <p v-if="data.stack" class="g-dim">スタック数: <span class="g-white">{{ data.stack }}</span></p>
      <p v-if="data.level" class="g-dim">装備条件: <span class="g-white">{{ data.level }}</span></p>
      <template v-if="data.desc.length">
        <div class="g-sep" />
        <p v-for="(l, i) in data.desc" :key="'d' + i" class="g-desc"><RichText :text="l" /></p>
      </template>
      <template v-for="(g, gi) in data.groups" :key="'g' + gi">
        <div class="g-sep" />
        <p class="g-head2">{{ g.h }}</p>
        <p v-for="(l, i) in g.l" :key="'l' + i" class="g-mod"><RichText :text="l" /></p>
        <p v-if="g.more" class="g-dim text-[11px]">ほか {{ g.more }} 件</p>
      </template>
      <p v-if="!data.desc.length && !data.groups.length" class="g-dim text-[12px] mt-1">説明のデータがありません</p>
    </template>
  </GameItemCard>
</template>
