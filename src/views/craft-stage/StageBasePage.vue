<!--
  StageBasePage.vue — Web 版のベース選びのページ (?page=base、2026-10-18 オーナー「広告入れてる前提のページ作り」。[[ads-page-model]])。
  前は設定の欄で下に開く一覧 (StageBasePicker.vue、アプリ版は今もそれ)。ページにして、右の列 (チャンネル) を外した画面いっぱいに一覧 (両脇の縦長の枠は WebApp.vue がクラフト以外のページ全部に置く)
  (2026-10-12 オーナー「ベース選択の時は右側の固定バーも突っ切っていい」「ベース初手選ぶときも」)。
  選ぶとクラフトへ戻る。まだ選んでいない時 (初めて・白に戻した後) は戻るボタンを出さない
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted } from "vue";
import BasePickBody from "../../components/for-share/BasePickBody.vue";
import ModeTabs from "../../components/for-share/ModeTabs.vue";
import { craftStage as s } from "../../state/craft-stage";
import { basePage, baseUnpicked } from "../../state/web-page";
import { tr } from "../../i18n/lang";
import { useStageBase } from "./use-stage-base";

defineProps<{ phone: boolean }>();
const { chosenBase, markChosen, pickSimBase } = useStageBase();

function back(): void { basePage.value = false; }
function pick(en: string): void {
  const first = baseUnpicked.value;
  basePage.value = false;
  if (first || en !== s.base.value) pickSimBase(en);
  else markChosen(en); // 今のベースを押し直した時はアイテムはそのまま、自分で選んだ物にだけする
}
/** 選んだ見た目にするのは人が自分で選んだベースの時だけ (既定の金の指輪は選んでいない扱い。2026-10-23 オーナー) */
const shown = computed(() => (!baseUnpicked.value && chosenBase.value === s.base.value ? s.base.value : ""));
// 開いたら一番上から、戻ったら前の位置へ (ページを移ったのと同じに。2026-10-12 広告のお試しと同じ)
let before = 0;
function onKey(e: KeyboardEvent): void { if (e.key === "Escape" && !baseUnpicked.value) back(); }
onMounted(() => {
  before = window.scrollY;
  window.scrollTo(0, 0);
  window.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  const y = baseUnpicked.value ? 0 : before;
  void nextTick(() => window.scrollTo(0, y));
});
</script>

<template>
  <section data-base-page class="flex items-start gap-4">
    <div class="min-w-0 flex-1">
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[17px] tracking-[0.18em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("ベースを選ぶ", "Choose a base") }}</h1>
        <span v-if="!baseUnpicked" class="flex items-center gap-2">
          <button type="button" data-base-page-back class="g-btn sm max-md:min-h-10" @click="back">{{ tr("← クラフトへ戻る", "← Back to craft") }}</button>
          <span class="text-[12px] opacity-60 max-md:hidden">{{ tr("Esc でも戻る", "Esc also goes back") }}</span>
        </span>
      </div>
      <!-- 何から始めるか。帯は共通の部品 (ModeTabs、2026-10-23 オーナー「帯を 1 つにして両方に」)。シミュレーターを押したらこのページを閉じてツリーへ -->
      <ModeTabs class="mb-3" @pick="(m) => m === 'sim' && back()" />
      <!-- 初めての人への帯 + ベース選びの枠は共通の部品 (BasePickBody、シミュの初手のベース選びと同じ作り。2026-10-23)。帯は人がまだベースを選んだ事の無い時のエミュレーターだけ -->
      <BasePickBody :selected="shown" :popular="baseUnpicked" :intro="baseUnpicked && !chosenBase && s.mode.value === 'hand'" @pick="pick" @quick="pick('Gold Ring')" />
    </div>
  </section>
</template>
