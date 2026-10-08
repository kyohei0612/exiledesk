<!--
  StageBasePicker.vue — クラフトステージのベース選び (2026-09-29 作り直し)

  オーナー:「ベースのプルダウンの UI があまりにも悪い。全部一緒になってるからシンプルに使いやすく再設計」。
  今のベースを 1 行で出し、押すと下に開く。中身の一覧は共通の部品 [[BaseCatalog.vue]] (クラフト計算機と同じ)。
  種類は poe2db どおり STR / DEX / INT ごと、素の数値つき、ルーンフォージ等は出さない。フラスコ・スキルジェムも選べる。選ぶと閉じる。
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import BaseCatalog from "../../components/items/BaseCatalog.vue";
import { baseCatalog, CATALOG_CLS_JA } from "../../services/items/base-catalog";
import { baseArt } from "../../services/craft-stage/base-art";
import Icon from "../../components/ui/Icon.vue";
import type { PatchData } from "../../vendor/poe2htc/engine/types";

const props = defineProps<{ base: string; data: PatchData | null; /** まだ選んでいない (開いた状態で始まり、今のベースは出さない) */ unpicked?: boolean }>();
const emit = defineEmits<{ pick: [en: string] }>();

const current = computed(() => (props.data ? (baseCatalog(props.data, true).find((b) => b.en === props.base) ?? null) : null));
const open = ref(!!props.unpicked);
// ベースが決まったら閉じる (レシピを呼んだ時も。2026-10-09 レビュー: 一覧が開いたままで打ち方の段が画面の下に隠れた)
watch(() => props.unpicked, (v) => { open.value = !!v; });
function choose(en: string): void {
  open.value = false;
  if (en !== props.base || props.unpicked) emit("pick", en);
}
</script>

<template>
  <div class="w-full">
    <!-- 今のベース (押すと開く) -->
    <button type="button" class="group flex h-10 items-center gap-3 rounded-md px-2 text-left transition hover:bg-white/5" :class="open ? 'bg-white/[0.04]' : ''" :aria-expanded="open" @click="open = !open">
      <template v-if="unpicked"><b class="text-[15px] text-[var(--exile-color-accent-focus)]">ベースを選ぶ</b></template>
      <template v-else>
        <img v-if="baseArt(base)" :src="baseArt(base)!" alt="" class="size-8 object-contain" draggable="false" />
        <b class="font-display text-[15px] tracking-wide text-[var(--color-rarity-rare)]">{{ current?.ja ?? base }}</b>
        <span v-if="current" class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ CATALOG_CLS_JA.get(current.cls) ?? current.cls }}</span>
      </template>
      <span class="ml-1 inline-flex items-center gap-0.5 text-[12px] text-[var(--exile-color-text-tertiary)] group-hover:text-[var(--exile-color-text-secondary)]">{{ open ? "閉じる" : "変える" }}<Icon :name="open ? 'chevron-up' : 'chevron-down'" class="size-3.5" /></span>
    </button>
    <div v-if="open" class="mt-2 rounded-lg bg-black/30 p-4">
      <!-- 未選択の時は前のベース・種類を選んだ状態にしない (2026-10-05 オーナー「リセットの時ベース未選択から始めんかい」) -->
      <BaseCatalog :data="data" :selected="unpicked ? '' : base" extras @pick="choose" />
    </div>
  </div>
</template>
