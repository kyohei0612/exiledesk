<!--
  BasePickBody.vue — ベースのページの中身 (初めての人への帯 + ベース選びの枠)。エミュのベースのページ (StageBasePage) とシミュの初手のベース選び
  (TreeGoalPage) で同じ作り・同じ並び (部位のタイル・節の見出し・装備とエフェクトの切り替え・人気を上)。2026-10-23 オーナー、シミュ部長の頼み。
  違うのは上の帯 (data-base-intro) だけ: 題・一言は props、「すぐ試す」のボタン (金の指輪) は quick で出し分け。既定はエミュの文
  使い方: <BasePickBody :selected="unpicked ? '' : base" :popular="unpicked" :intro="unpicked" :title="tr(…)" :lead="tr(…)" :quick="false" @pick="pick" />
-->
<script setup lang="ts">
import BaseCatalog from "../items/BaseCatalog.vue";
import { craftStage as s } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";

withDefaults(defineProps<{
  /** 今のベース (未選択は "") */
  selected: string;
  /** 人気のベースの段を上に出す (未選択の時) */
  popular?: boolean;
  /** 上の帯を出す (初めて・未選択の時) */
  intro?: boolean;
  /** 帯の題・一言 (既定はエミュの文) */
  title?: string;
  lead?: string;
  /** 「金の指輪ですぐ試す」を出す */
  quick?: boolean;
}>(), { popular: false, intro: false, title: undefined, lead: undefined, quick: true });
const emit = defineEmits<{ pick: [en: string] }>();
</script>

<template>
  <div>
    <!-- 初めて来た人へ: 一言と「すぐ試す」(2026-10-19 スマホ強化。来た人の半分がベースを選ばずに帰っていた。何のサイトか・何をすると何が起きるかが無かった) -->
    <div v-if="intro" data-base-intro class="mb-3 flex items-center gap-4 rounded-lg border border-[var(--exile-color-border-brass)]/40 bg-black/40 px-4 py-3 max-md:flex-col max-md:gap-2 max-md:px-3 max-md:text-center">
      <div class="min-w-0 flex-1">
        <p class="g-antique text-[15px] leading-snug text-[var(--exile-color-text-title)] max-md:text-[14px]">{{ title ?? tr("PoE2 のクラフトを、ゲームと同じ決まりで 1 手ずつ試せます", "Try PoE2 crafting one step at a time, with the same rules as the game") }}</p>
        <p class="mt-1 text-[12px] leading-snug text-[var(--exile-color-text-secondary)]">{{ lead ?? tr("ベースを選んで、カレンシーを押して持ち、アイテムを押すと 1 回使います。タダで何回でも", "Pick a base, tap a currency to hold it, then tap the item to use it. Free, as many times as you like") }}</p>
      </div>
      <button v-if="quick" type="button" data-base-quick class="g-btn-red min-h-11 shrink-0 px-2 text-[14px] max-md:w-full" @click="emit('pick', 'Gold Ring')">{{ tr("金の指輪ですぐ試す", "Try now with a Gold Ring") }}</button>
    </div>
    <!-- 未選択の時は前のベース・種類を選んだ状態にしない・人気のベースを上に -->
    <div class="rounded-lg bg-black/30 p-4 max-md:p-2"><BaseCatalog :data="s.data.value" :selected="selected" :popular="popular" @pick="(en) => emit('pick', en)" /></div>
  </div>
</template>
