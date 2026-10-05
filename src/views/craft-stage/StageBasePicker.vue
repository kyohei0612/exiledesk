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
import type { PatchData } from "../../vendor/poe2htc/engine/types";

const props = defineProps<{ base: string; data: PatchData | null; /** まだ選んでいない (開いた状態で始まり、今のベースは出さない) */ unpicked?: boolean }>();
const emit = defineEmits<{ pick: [en: string] }>();

const current = computed(() => (props.data ? (baseCatalog(props.data, true).find((b) => b.en === props.base) ?? null) : null));
const open = ref(!!props.unpicked);
watch(() => props.unpicked, (v) => { if (v) open.value = true; });
function choose(en: string): void {
  open.value = false;
  if (en !== props.base || props.unpicked) emit("pick", en);
}
</script>

<template>
  <div class="w-full">
    <!-- 今のベース (押すと開く) -->
    <button type="button" class="flex items-center gap-2 rounded-lg border px-3 py-1 text-left hover:bg-white/5" :class="open ? 'border-amber-400/70 bg-amber-500/10' : 'border-white/20'" @click="open = !open">
      <span class="opacity-60">ベース</span>
      <template v-if="unpicked"><b class="text-[13px] text-amber-100">選んでください</b></template>
      <template v-else>
        <img v-if="baseArt(base)" :src="baseArt(base)!" alt="" class="h-7 w-7 object-contain" draggable="false" />
        <b class="text-[13px] text-amber-100">{{ current?.ja ?? base }}</b>
        <span v-if="current" class="opacity-50">{{ CATALOG_CLS_JA.get(current.cls) ?? current.cls }}</span>
      </template>
      <span class="ml-1 opacity-60">{{ open ? "▲ 閉じる" : "▼ 変える" }}</span>
    </button>
    <div v-if="open" class="mt-2 rounded-xl border border-white/10 bg-black/30 p-3">
      <!-- 未選択の時は前のベース・種類を選んだ状態にしない (2026-10-05 オーナー「リセットの時ベース未選択から始めんかい」) -->
      <BaseCatalog :data="data" :selected="unpicked ? '' : base" extras @pick="choose" />
    </div>
  </div>
</template>
