<!--
  BuildItemHoverCard.vue — 忍者ビルドコピーの装備の名前にカーソルを乗せた時のカード (2026-09-26)

  オーナー:「これも同じように詳細カードよろしくね、ゲーム内仕様の」。
  ゲームのアイテム画面の並び: 名前とベース → 部位・品質・アイテムレベル → 差したルーン → 固有 → 明示 → コラプト。
  枠と位置決めは [[GameItemCard.vue]] (ユニーク・カレンシー・ジェムと共通)。MOD 文の日本語はクライアント原本 ([[unique-mod-ja.ts]])。
-->
<script setup lang="ts">
import { computed, onMounted } from "vue";
import GameItemCard from "../decor/GameItemCard.vue";
import RichText from "../decor/RichText.vue";
import { jaUniqueText, loadUniqueHoverDict } from "../../services/mods/unique-mod-ja";
import { jaTypeName, jaUniqueName } from "../../services/trade2/localize";
import { jaCurrency } from "../../i18n/currencies-ja";
import type { BuildItem } from "../../services/build-copy/pob";

const props = defineProps<{ item: BuildItem; x: number; y: number; layerKey: number; pinned: boolean; z: number }>();
onMounted(() => void loadUniqueHoverDict());

const unique = computed(() => props.item.rarity === "UNIQUE" || props.item.rarity === "RELIC");
const tone = computed(() => (unique.value ? "unique" : props.item.rarity === "RARE" ? "rare" : props.item.rarity === "MAGIC" ? "magic" : "currency"));
// レアの固有名はでたらめな組み合わせで日本語が無いので、見出しはベースの日本語名、固有名は下に小さく
const name = computed(() => (unique.value ? jaUniqueName(props.item.name) : props.item.base ? jaTypeName(props.item.base) : props.item.name));
const sub = computed(() => (unique.value && props.item.base ? jaTypeName(props.item.base) : null));
</script>

<template>
  <GameItemCard :show="true" :x="x" :y="y" :name="name" :sub="sub" :tone="tone" :width="400" :layer-key="layerKey" :pinned="pinned" :z="z">
    <p class="g-dim text-[12px]">{{ item.slot }}<template v-if="item.rarity === 'RARE' && item.name"> · {{ item.name }}</template></p>
    <p v-if="item.quality" class="g-dim">品質: <span class="g-mod">+{{ item.quality }}%</span></p>
    <p v-if="item.itemLevel" class="g-dim">アイテムレベル: <span class="g-white">{{ item.itemLevel }}</span></p>
    <template v-if="item.runes.length">
      <div class="g-sep" />
      <p v-for="(r, i) in item.runes" :key="'r' + i" class="g-dim">ソケット: <span class="g-white">{{ jaCurrency(r) }}</span></p>
    </template>
    <template v-if="item.implicits.length">
      <div class="g-sep" />
      <p v-for="(m, i) in item.implicits" :key="'i' + i" class="g-mod"><RichText :text="jaUniqueText(m)" /></p>
    </template>
    <div class="g-sep" />
    <p v-for="(m, i) in item.mods" :key="'m' + i" class="g-mod"><RichText :text="jaUniqueText(m)" /></p>
    <p v-if="!item.mods.length" class="g-dim">MOD なし</p>
    <template v-if="item.corrupted">
      <div class="g-sep" />
      <p class="text-[#d20000]">コラプト</p>
    </template>
  </GameItemCard>
</template>
