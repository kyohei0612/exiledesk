<!--
  SimBaseExtras.vue — ① ベースを選ぶページ (StageBasePage.vue、エンジン部の画面) に差すシミュレーターの物 (2026-10-20 R2: ぶつかる所を割る、docs/org/dev/notes/2026-10-20-agent-friendly.md の 2)。
  「レシピから始める」(一覧の上)。貼り付けのタイルは 2026-10-22 に消した (オーナー)。
  ベースを選んだ後に ② の枠まで送る revealSimMods もここ (ベースのページの pick が呼ぶ)
-->
<script lang="ts">
import { revealWhenReady } from "../../utils/keep-place";
/**
 * シミュレーター: ベースを選んだら、すぐ狙う MOD を選べるように、2 の枠の下の線 + 少しの隙間が見える所まで送る
 * (2026-10-18 オーナー「MOD の枠の下枠と例の隙間少し開けたところまで進んであげんと可哀そう」。ベースの一覧の reveal と同じ考え)。枠が画面より高ければ枠の上で止める
 */
export function revealSimMods(): void {
  // シミュレーターの画面は後から読む (2026-10-19 スマホ強化) ので、初めて開いた時はまだ枠が無い。出るまで待つ (keep-place.ts の revealWhenReady)。
  // 前は 0.12 秒後に 1 回だけ探していて、エミュレーターから切り替えた時に送られなかった (2026-10-19 オーナー「MOD 下までスクロールせんな」)
  revealWhenReady("[data-sim-cur]");
}
</script>

<script setup lang="ts">
import { useStageBase } from "../craft-stage/use-stage-base";
import StageRecipeStart from "./StageRecipeStart.vue";

const { startFromRecipe } = useStageBase();
</script>

<template>
  <!-- シミュレーターは保存したレシピから始めるのも先に (前は設定の欄。2026-10-09 オーナー「ここの時点でレシピとかの選択させるような UI じゃないと」)。
       選び直しの時も出す (2026-10-20 オーナー。前は初めてだけで、選んだ後は右上の「レシピ」から、の作りだった) -->
  <StageRecipeStart compact @start="startFromRecipe" />
</template>
