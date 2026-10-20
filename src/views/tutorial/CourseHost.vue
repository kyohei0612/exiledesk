<!--
  CourseHost.vue — クラフトステージ (CraftStage.vue) の中のチュートリアル (使い方・コツ・コース) の差し込み口 (2026-10-20 R4、案 docs/org/emulator/notes/2026-10-20-r4-craftstage-hosts.md)。
  CraftStage は置き場所 (part) を決めるだけで、中身はこの部品が持つ。
    header      … 題の下の説明 (CraftStage の説明の v-if の並びの中から呼ぶ)
    main        … 使い方の動画 (Web の使い方・コツのページ) と、動画のクラフトのコース一覧
    under-item  … アイテムの下: コースの今の手 (スマホ) とコースの案内
    above-shelf … 棚のすぐ上: コースの今の手 (PC)
    overlay     … 動画モード (VideoStage) と動画用の別の画面 (VideoExtra)
  「← クラフトへ戻る」とチュートリアルのタブはモードの切り替え (ジェムコラプトを閉じる) なので CraftStage に残す。
-->
<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import { tr } from "../../i18n/lang";
import { craftStage, TUTORIAL_LOCKED } from "../../state/craft-stage";
import GuideVideoCard from "./GuideVideoCard.vue";
import StageCourseGuide from "./StageCourseGuide.vue";
import VideoExtra from "./VideoExtra.vue";
const VideoStage = defineAsyncComponent(() => import("./VideoStage.vue")); // 後から読む (2026-10-19 スマホ強化: 最初に読む JS を縮める。その画面・カードを出す時に初めて読む)
const StageCourses = defineAsyncComponent(() => import("./StageCourses.vue"));
const StageTopicGuide = defineAsyncComponent(() => import("./StageTopicGuide.vue"));

defineProps<{ part: "header" | "main" | "under-item" | "above-shelf" | "overlay"; phone?: boolean; guidePage?: boolean }>();
const s = craftStage;
</script>

<template>
  <p v-if="part === 'header'" class="mt-1 text-xs text-[var(--exile-color-text-secondary)] max-md:hidden">{{ guidePage ? tr("使い方の動画と、カレンシーの動きを実際に使って覚えるコース", "A how-to video and courses where you learn each currency by using it") : tr("カレンシーを 1 つずつ実際に使って、どう動くかを覚えます", "Use each currency for real, one at a time, to learn what it does") }}</p>
  <template v-else-if="part === 'main'">
    <GuideVideoCard v-if="guidePage" />
    <StageCourses v-if="s.ready.value && s.mode.value === 'tutorial' && !s.replay.value && !TUTORIAL_LOCKED" class="mb-4" /><!-- 動画のクラフトのコース (2026-10-17、白から自分で作る) -->
  </template>
  <!-- コースの案内はアイテムの下。スマホは今の手もアイテムのすぐ下 (2026-10-17 オーナー) -->
  <template v-else-if="part === 'under-item'"><StageTopicGuide v-if="phone && !s.replay.value && s.mode.value === 'hand'" part="now" class="w-full" /><StageCourseGuide v-if="!s.replay.value && s.mode.value === 'hand'" class="mt-2 w-[480px] max-md:w-full" /></template>
  <StageTopicGuide v-else-if="part === 'above-shelf' && !phone && !s.replay.value && s.mode.value === 'hand'" part="now" /><!-- コースの今の手 (棚のすぐ上) -->
  <template v-else-if="part === 'overlay'">
    <VideoStage v-if="s.video.value && s.ready.value" />
    <!-- 動画用の別の画面 (URL の view=、要望 ⑪) -->
    <VideoExtra v-if="s.extra.value && s.ready.value" />
  </template>
</template>
