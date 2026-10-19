<!--
  StageBasePage.vue — Web 版のベース選びのページ (?page=base、2026-10-18 オーナー「広告入れてる前提のページ作り」。[[ads-page-model]])。
  前は設定の欄で下に開く一覧 (StageBasePicker.vue、アプリ版は今もそれ)。ページにして、右の列 (チャンネル) を外した画面いっぱいに一覧 (両脇の縦長の枠は WebApp.vue がクラフト以外のページ全部に置く)
  (2026-10-12 オーナー「ベース選択の時は右側の固定バーも突っ切っていい」「ベース初手選ぶときも」)。
  選ぶとクラフトへ戻る。まだ選んでいない時 (初めて・白に戻した後) は戻るボタンを出さない
-->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import BaseCatalog from "../../components/items/BaseCatalog.vue";
import { craftStage as s, SIM_LOCKED } from "../../state/craft-stage";
import { basePage, baseUnpicked } from "../../state/web-page";
import { tr } from "../../i18n/lang";
import { useStageBase } from "./use-stage-base";
import { revealBottom } from "../../utils/keep-place";
import StageRecipeStart from "./StageRecipeStart.vue";

defineProps<{ phone: boolean }>();
const { pickSimBase, startFromRecipe } = useStageBase();
const catalog = ref<InstanceType<typeof BaseCatalog> | null>(null);

function back(): void { basePage.value = false; }
/**
 * 何から始めるか (2026-10-18 オーナー「エミュレーターかシミュレーターか。デフォはエミュレーター」)。シミュレーターのベース選びもこのページ (広告の枠のある別のページ)。
 * 切り替えた先でまだベースを選んでいなければ、このページのまま (そのモードのベース選び)
 */
function setMode(m: "hand" | "sim"): void { if (s.mode.value === m) return; s.hold(null); basePage.value = false; s.mode.value = m; }
function pick(en: string): void {
  const first = baseUnpicked.value;
  basePage.value = false;
  if (first || en !== s.base.value) pickSimBase(en);
  if (s.mode.value === "sim") setTimeout(revealSimMods, 120);
}
/**
 * シミュレーター: ベースを選んだら、すぐ狙う MOD を選べるように、2 の枠の下の線 + 少しの隙間が見える所まで送る
 * (2026-10-18 オーナー「MOD の枠の下枠と例の隙間少し開けたところまで進んであげんと可哀そう」。ベースの一覧の reveal と同じ考え)。枠が画面より高ければ枠の上で止める
 */
function revealSimMods(): void {
  const el = document.querySelector<HTMLElement>("[data-sim-cur]");
  if (el) revealBottom(el);
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
    <div class="min-w-0 flex-1">
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[17px] tracking-[0.18em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("ベースを選ぶ", "Choose a base") }}</h1>
        <span v-if="!baseUnpicked" class="flex items-center gap-2">
          <button type="button" data-base-page-back class="g-btn sm max-md:min-h-10" @click="back">{{ tr("← クラフトへ戻る", "← Back to craft") }}</button>
          <span class="text-[12px] opacity-60 max-md:hidden">{{ tr("Esc でも戻る", "Esc also goes back") }}</span>
        </span>
      </div>
      <!-- 何から始めるか (シミュレーターが開いている開発版だけ。本番はエミュレーターだけなので出さない) -->
      <div v-if="!SIM_LOCKED" class="mb-3 flex gap-1 max-md:w-full" role="tablist">
        <button type="button" role="tab" :aria-selected="s.mode.value === 'hand'" class="g-tab min-w-[170px] max-md:min-w-0 max-md:flex-1 max-md:!text-[12px]" :class="s.mode.value === 'hand' ? 'on' : ''" @click="setMode('hand')">{{ tr("エミュレーター", "Emulator") }}</button>
        <button type="button" role="tab" :aria-selected="s.mode.value === 'sim'" data-base-page-sim class="g-tab min-w-[170px] gap-1.5 !inline-flex max-md:min-w-0 max-md:flex-1 max-md:!text-[12px]" :class="s.mode.value === 'sim' ? 'on' : ''" @click="setMode('sim')">{{ tr("シミュレーター", "Simulator") }}<span class="text-[10px] font-normal opacity-70">β</span></button>
      </div>
      <!-- シミュレーターは保存したレシピから始めるのも先に (前は設定の欄。2026-10-09 オーナー「ここの時点でレシピとかの選択させるような UI じゃないと」) -->
      <StageRecipeStart v-if="s.mode.value === 'sim' && baseUnpicked" compact class="mb-3" @start="startFromRecipe" />
      <!--
        初めて来た人へ: 一言と「すぐ試す」(2026-10-19 スマホ強化。来た人の半分がベースを選ばずに帰っていた。何のサイトか・何をすると何が起きるかが無かった)。
        ベースを選んでいない時 (初めて・白に戻した後) のエミュレーターだけ。押すと金の指輪 (人気の一番上) ですぐ打てる画面へ
      -->
      <div v-if="baseUnpicked && s.mode.value === 'hand'" data-base-intro class="mb-3 flex items-center gap-4 rounded-lg border border-[var(--exile-color-border-brass)]/40 bg-black/40 px-4 py-3 max-md:flex-col max-md:gap-2 max-md:px-3 max-md:text-center">
        <div class="min-w-0 flex-1">
          <p class="g-antique text-[15px] leading-snug text-[var(--exile-color-text-title)] max-md:text-[14px]">{{ tr("PoE2 のクラフトを、ゲームと同じ決まりで 1 手ずつ試せます", "Try PoE2 crafting one step at a time, with the same rules as the game") }}</p>
          <p class="mt-1 text-[12px] leading-snug text-[var(--exile-color-text-secondary)]">{{ tr("ベースを選んで、カレンシーを押して持ち、アイテムを押すと 1 回使います。タダで何回でも", "Pick a base, tap a currency to hold it, then tap the item to use it. Free, as many times as you like") }}</p>
        </div>
        <button type="button" data-base-quick class="g-btn-red min-h-11 shrink-0 px-2 text-[14px] max-md:w-full" @click="pick('Gold Ring')">{{ tr("金の指輪ですぐ試す", "Try now with a Gold Ring") }}</button>
      </div>
      <!-- 未選択の時は前のベース・種類を選んだ状態にしない・人気のベースを上に (StageBasePicker.vue と同じ) -->
      <div class="rounded-lg bg-black/30 p-4 max-md:p-2"><BaseCatalog ref="catalog" :data="s.data.value" :selected="baseUnpicked ? '' : s.base.value" :popular="baseUnpicked" @pick="pick" /></div>
    </div>
  </section>
</template>
