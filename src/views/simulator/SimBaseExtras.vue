<!--
  SimBaseExtras.vue — ① ベースを選ぶページ (StageBasePage.vue、エンジン部の画面) に差すシミュレーターの物 (2026-10-20 R2: ぶつかる所を割る、docs/org/dev/notes/2026-10-20-agent-friendly.md の 2)。
  part = "recipe": 「レシピから始める」(一覧の上)、"paste": 「貼り付け」のタイルで開く枠の中身 (BaseCatalog の #paste)。
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
import { nextTick } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { basePage } from "../../state/web-page";
import { useStageBase, SIM_ILVL_MAX } from "../craft-stage/use-stage-base";
import { simPasted } from "../../state/simulator/sim-state";
import StageRecipeStart from "./StageRecipeStart.vue";
import SimPasteRead from "./SimPasteRead.vue";
import type { PasteRead } from "../../services/simulator/paste-read";

defineProps<{ part: "recipe" | "paste" }>();
const { pickSimBase, startFromRecipe } = useStageBase();

/**
 * シミュレーター: 貼り付けたアイテムで始める = ① のベースと ② の狙いを一度に埋めて ② へ (2026-10-20 オーナー。前の ② の「貼り付けで写す」はここに一本化)。
 * ベースを選び直した時と同じに先 (始め方・順番・打ち方) は空から
 */
function startFromPaste(r: PasteRead): void {
  if (!r.item.base) return;
  basePage.value = false;
  pickSimBase(r.item.base.en);
  s.simTargets.value = r.targets;
  // アイテムレベルは ② の % と ③ に使う (点検 1)。品質・コラプト・未発現は ③ に「持ち越さない」と出すだけ
  const lv = r.item.itemLevel;
  simPasted.value = { ilvl: lv != null ? Math.max(1, Math.min(SIM_ILVL_MAX, lv)) : null, quality: r.item.quality?.value ?? null, corrupted: r.item.corrupted, unrevealed: r.item.mods.filter((m) => m.unrevealed).length };
  if (simPasted.value.ilvl != null) s.itemLevel.value = simPasted.value.ilvl;
  // ソケットの数: 貼った物にあればそれ、無ければ 0 (武器・防具は数を選ぶまで ② の一覧が出ない作り。2026-10-20 スナップ ①: 武器で止まって見えた)。
  // ベースを変えるとソケットは空に戻る (use-sim-targets の見張り) ので、その後に入れる
  const sk = r.item.sockets.count ?? 0;
  void nextTick(() => { s.simSockets.value = sk; });
  setTimeout(revealSimMods, 120);
}
</script>

<template>
  <!-- シミュレーターは保存したレシピから始めるのも先に (前は設定の欄。2026-10-09 オーナー「ここの時点でレシピとかの選択させるような UI じゃないと」)。
       選び直しの時も出す (2026-10-20 オーナー。前は初めてだけで、選んだ後は右上の「レシピ」から、の作りだった) -->
  <StageRecipeStart v-if="part === 'recipe'" compact @start="startFromRecipe" />
  <!-- シミュレーター: アイテムの貼り付けでベースと狙いを一度に (開発版だけ) -->
  <SimPasteRead v-else @start="startFromPaste" />
</template>
