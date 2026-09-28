<!--
  VideoExtra.vue — 動画用の別の画面の入れ物 (POE2Tube 要望 ⑪、2026-09-29)

  URL の view= (craft-stage.ts の extra) で開く。1280×720 を窓に合わせて拡大 (VideoStage と同じ)、背景も同じ。
  中身: view=tiers → [[VideoTiers.vue]]、view=compare → [[VideoCompare.vue]]。Esc で閉じる。
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import VideoTiers from "./VideoTiers.vue";
import VideoCompare from "./VideoCompare.vue";
import { craftStage } from "../../state/craft-stage";

const ex = craftStage.extra;
const rootEl = ref<HTMLElement | null>(null);
const scale = ref(1);
const fit = () => { const el = rootEl.value; if (el) scale.value = Math.min(el.clientWidth / 1280, el.clientHeight / 720); };
let ro: ResizeObserver | null = null;
const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") ex.value = null; };
onMounted(() => { fit(); ro = new ResizeObserver(fit); if (rootEl.value) ro.observe(rootEl.value); window.addEventListener("keydown", onKey); });
onBeforeUnmount(() => { ro?.disconnect(); window.removeEventListener("keydown", onKey); });
</script>

<template>
  <div ref="rootEl" class="fixed inset-0 z-[400] grid place-items-center overflow-hidden bg-black">
    <div class="stage-video-bg relative h-[720px] w-[1280px] shrink-0 overflow-hidden" :style="{ transform: `scale(${scale})` }">
      <VideoTiers v-if="ex?.kind === 'tiers'" :base="ex.base" :mod="ex.mod" :ilvl="ex.ilvl" />
      <VideoCompare v-else-if="ex?.kind === 'compare'" :a="ex.a" :b="ex.b" :a-step="ex.aStep" :b-step="ex.bStep" />
    </div>
  </div>
</template>
