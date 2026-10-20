<!--
  SimHost.vue — クラフトステージ (CraftStage.vue) の中のシミュレーターの差し込み口 (2026-10-20 R4、案 docs/org/emulator/notes/2026-10-20-r4-craftstage-hosts.md)。
  CraftStage は置き場所 (part) を決めるだけで、中身はシミュ部のこの部品が持つ。
    header … 題の下の説明 (CraftStage の説明の v-if の並びの中から呼ぶ)
    tools  … ベースを選ぶ前の道具の帯 (#sim-tools の中。選んだ後は StageSimPanel が Teleport で置く)
    main   … シミュレーターの本体 (StageSimPanel。一度ベースを選んだら消さずに隠す)
-->
<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import { tr } from "../../i18n/lang";
import { craftStage } from "../../state/craft-stage";
import { useStageBase } from "../craft-stage/use-stage-base";
import HelpTip from "../../components/ui/HelpTip.vue";
import Icon from "../../components/ui/Icon.vue";
import CurrencyPicker from "../../components/vaal-scales/CurrencyPicker.vue";
import StageRecipeStart from "./StageRecipeStart.vue";
const StageSimPanel = defineAsyncComponent(() => import("./StageSimPanel.vue"));

defineProps<{ part: "header" | "tools" | "main" }>();
const s = craftStage;
const { simNoBase, preRecipeOpen, startFromRecipe } = useStageBase();
</script>

<template>
  <p v-if="part === 'header'" class="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--exile-color-text-secondary)] max-md:hidden">{{ tr("ベースと狙う MOD を決めて打ち方を組み、何百人分も作って 1 個あたりの費用を出す", "Pick a base and target mods, plan the steps, then craft hundreds of copies to get the cost per item") }}
    <HelpTip :title="tr('シミュレーター', 'Simulator')" :width="320">
      <p>{{ tr("1 ベース → 2 狙う MOD → 始め方と順番 → 打ち方 (パターン) の順に決めて「回す」。", "Set 1 Base → 2 Target mods → start and order → steps (pattern), then press “Run”.") }}</p>
      <p class="mt-1 text-[var(--exile-color-text-secondary)]">{{ tr("確率はクラフト計算機と同じ規則。値段は今の相場。", "Chances follow the craft calculator's rules. Prices are current market prices.") }}</p>
    </HelpTip>
  </p>
  <!-- ベースを選ぶ前も同じ帯を出す (2026-10-09 オーナー「ここはずっと出してていい」)。選んだ後は StageSimPanel の物に替わる -->
  <template v-else-if="part === 'tools' && s.mode.value === 'sim' && simNoBase">
    <CurrencyPicker sim />
    <span class="relative">
      <button type="button" class="g-btn sm inline-flex items-center gap-1 max-md:min-h-10" :aria-expanded="preRecipeOpen" :title="tr('保存したレシピから始める', 'Start from a saved recipe')" @click="preRecipeOpen = !preRecipeOpen">{{ tr("レシピ", "Recipes") }}<Icon :name="preRecipeOpen ? 'chevron-up' : 'chevron-down'" class="size-4" /></button>
      <div v-if="preRecipeOpen" class="fixed inset-0 z-30 bg-black/60 md:hidden" @click="preRecipeOpen = false"></div>
      <div v-if="preRecipeOpen" class="absolute right-0 top-full z-40 mt-1 w-[26rem] rounded-xl border border-white/15 bg-[#14110d] p-3 text-[12px] shadow-2xl max-md:fixed max-md:inset-x-3 max-md:top-14 max-md:w-auto max-md:max-h-[80vh] max-md:overflow-y-auto">
        <StageRecipeStart compact @start="startFromRecipe" />
      </div>
    </span>
    <button type="button" disabled class="g-btn sm inline-flex items-center gap-1.5 max-md:min-h-10" :title="tr('ベースを選んでから', 'Choose a base first')"><Icon name="rotate" class="size-4" /><span class="max-md:hidden">{{ tr("リセット", "Reset") }}</span></button>
    <button type="button" disabled class="g-btn sm inline-flex items-center gap-1.5 max-md:min-h-10" :title="tr('戻せる操作がまだ無い', 'Nothing to undo yet')"><Icon name="undo" class="size-4" /><span class="max-md:hidden">{{ tr("1 つ戻す", "Undo") }}</span></button>
  </template>
  <!-- 手で打つ画面と行き来しても入れた物が残るように、一度ベースを選んだら消さずに隠す (2026-10-05 オーナー「ステージと実験行き来できるように、行き来したらもっかい最初からになった」) -->
  <StageSimPanel v-else-if="part === 'main' && s.ready.value && s.simPicked.value" v-show="s.mode.value === 'sim' && !s.replay.value" class="mb-4" />
</template>
