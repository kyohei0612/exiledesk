<!--
  ItemArt.vue — 装備の小さな絵 (2026-10-03、火力チェック)

  ユニーク / 遺物はユニークの絵 (unique-art)、無ければベースの絵 (base-art)。どちらも無い (画像パックがまだ無い・一覧に無い・読めなかった) 時は
  何も出さない (枠だけ残さない)。BuildItemRow (値段のタブ) / StageItemCard と同じ引き方を 1 つの部品にした物
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { baseArt } from "../../services/craft-stage/base-art";
import { uniqueArt } from "../../services/assets/unique-art";

const props = withDefaults(defineProps<{ /** 英語のユニーク名 (レアは固有名でも可、絵は引けない) */ name?: string | null; /** 英語のベース名 */ base?: string | null; rarity?: string | null; size?: number }>(), {
  name: null,
  base: null,
  rarity: null,
  size: 32,
});
const src = computed(() => {
  const r = (props.rarity ?? "").toUpperCase();
  return ((r === "UNIQUE" || r === "RELIC") && props.name ? uniqueArt(props.name) : null) ?? (props.base ? baseArt(props.base) : null);
});
const broken = ref(false);
watch(src, () => (broken.value = false));
</script>

<template>
  <img
    v-if="src && !broken"
    :src="src"
    alt=""
    loading="lazy"
    draggable="false"
    class="shrink-0 object-contain"
    :style="{ width: size + 'px', height: size + 'px' }"
    @error="broken = true"
  />
</template>
