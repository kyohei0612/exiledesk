<!--
  StageBasePage.vue — Web 版のベース選びのページ (?page=base、2026-10-18 オーナー「広告入れてる前提のページ作り」。[[ads-page-model]])。
  前は設定の欄で下に開く一覧 (StageBasePicker.vue、アプリ版は今もそれ)。ページにして、右の列 (チャンネル) を外した画面いっぱいに一覧、両脇に縦長の広告の枠
  (2026-10-12 オーナー「ベース選択の時は右側の固定バーも突っ切っていい」「ベース初手選ぶときも」)。
  選ぶとクラフトへ戻る。まだ選んでいない時 (初めて・白に戻した後) は戻るボタンを出さない
-->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import BaseCatalog from "../../components/items/BaseCatalog.vue";
import AdSlot from "../../components/ui/AdSlot.vue";
import { craftStage as s } from "../../state/craft-stage";
import { basePage, baseUnpicked } from "../../state/web-page";
import { sideAdW } from "../../utils/ads";
import { tr } from "../../i18n/lang";
import { useStageBase } from "./use-stage-base";

defineProps<{ phone: boolean }>();
const { pickSimBase } = useStageBase();
const sideW = sideAdW();
const catalog = ref<InstanceType<typeof BaseCatalog> | null>(null);

function back(): void { basePage.value = false; }
function pick(en: string): void {
  const first = baseUnpicked.value;
  basePage.value = false;
  if (first || en !== s.base.value) pickSimBase(en);
}
// 開いたら一番上から、戻ったら前の位置へ (ページを移ったのと同じに。2026-10-12 広告のお試しと同じ)
let before = 0;
function onKey(e: KeyboardEvent): void { if (e.key === "Escape" && !baseUnpicked.value) back(); }
onMounted(() => {
  before = window.scrollY;
  window.scrollTo(0, 0);
  window.addEventListener("keydown", onKey);
  // 選び直しの時は、今のベースの一覧が全部と「もっと見る」の帯の少し下まで見える所へ送る (前の下に開く一覧と同じ BaseCatalog の reveal。2026-10-18 オーナー)
  if (!baseUnpicked.value) void nextTick(() => catalog.value?.reveal());
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  const y = baseUnpicked.value ? 0 : before;
  void nextTick(() => window.scrollTo(0, y));
});
</script>

<template>
  <section data-base-page class="flex items-start gap-4">
    <div v-if="!phone" class="sticky top-3 shrink-0 empty:hidden"><AdSlot id="base-left" :w="sideW" :h="600" /></div>
    <div class="min-w-0 flex-1">
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[17px] tracking-[0.18em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("ベースを選ぶ", "Choose a base") }}</h1>
        <span v-if="!baseUnpicked" class="flex items-center gap-2">
          <button type="button" data-base-page-back class="g-btn sm max-md:min-h-10" @click="back">{{ tr("← クラフトへ戻る", "← Back to craft") }}</button>
          <span class="text-[12px] opacity-60 max-md:hidden">{{ tr("Esc でも戻る", "Esc also goes back") }}</span>
        </span>
      </div>
      <!-- 未選択の時は前のベース・種類を選んだ状態にしない・人気のベースを上に (StageBasePicker.vue と同じ) -->
      <div class="rounded-lg bg-black/30 p-4 max-md:p-2"><BaseCatalog ref="catalog" :data="s.data.value" :selected="baseUnpicked ? '' : s.base.value" :popular="baseUnpicked" @pick="pick" /></div>
    </div>
    <div v-if="!phone" class="sticky top-3 shrink-0 empty:hidden"><AdSlot id="base-right" :w="sideW" :h="600" /></div>
  </section>
</template>
