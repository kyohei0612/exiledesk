<!--
  VideoExtra.vue — 動画用の別の画面の入れ物 (POE2Tube 要望 ⑪、2026-09-29)

  URL の view= (craft-stage.ts の extra) で開く。1280×720 を窓に合わせて拡大 (VideoStage と同じ)、背景も同じ。
  中身: view=tiers → [[VideoTiers.vue]]、view=compare → [[VideoCompare.vue]]、2026-09-29 (要望 ⑰): view=resists / ttk / hit / dps、2026-09-30 (要望 ㉒-B): view=layers / armour / evasion / es / bases。Esc で閉じる。
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import VideoTiers from "./VideoTiers.vue";
import VideoCompare from "./VideoCompare.vue";
import VideoResists from "./VideoResists.vue";
import VideoTtk from "./VideoTtk.vue";
import VideoHit from "./VideoHit.vue";
import VideoDps from "./VideoDps.vue";
import VideoLayers from "./VideoLayers.vue";
import VideoArmour from "./VideoArmour.vue";
import VideoEvasion from "./VideoEvasion.vue";
import VideoEs from "./VideoEs.vue";
import VideoBases from "./VideoBases.vue";
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
      <VideoTiers v-if="ex?.kind === 'tiers'" :base="ex.base" :mod="ex.mod" :ilvl="ex.ilvl" :hl="ex.hl" />
      <VideoCompare v-else-if="ex?.kind === 'compare'" :a="ex.a" :b="ex.b" :a-step="ex.aStep" :b-step="ex.bStep" :a-pob="ex.aPob" :b-pob="ex.bPob" />
      <VideoResists v-else-if="ex?.kind === 'resists'" :r="ex.r" :act="ex.act" :penalty="ex.penalty" />
      <VideoTtk v-else-if="ex?.kind === 'ttk'" :a="ex.a" :a-step="ex.aStep" :a-label="ex.aLabel" :b="ex.b" :b-step="ex.bStep" :b-label="ex.bLabel" />
      <VideoHit v-else-if="ex?.kind === 'hit'" :pob="ex.pob" :step="ex.step" :elem="ex.elem" :res="ex.res" :dmg="ex.dmg" />
      <VideoDps v-else-if="ex?.kind === 'dps'" :pob="ex.pob" :step="ex.step" />
      <VideoLayers v-else-if="ex?.kind === 'layers'" :d="ex.d" :hit="ex.hit" :kind="ex.dmgKind" :acc="ex.acc" :outcome="ex.outcome" :red="ex.red" :lvl="ex.lvl" />
      <VideoArmour v-else-if="ex?.kind === 'armour'" :ar="ex.ar" :labels="ex.labels" :max="ex.max" :hit="ex.hit" />
      <VideoEvasion v-else-if="ex?.kind === 'evasion'" :ev="ex.ev" :deflect="ex.deflect" :acc="ex.acc" :lvl="ex.lvl" :n="ex.n" :red="ex.red" />
      <VideoEs v-else-if="ex?.kind === 'es'" :life="ex.life" :es="ex.es" :dmg="ex.dmg" :hits="ex.hits" :kind="ex.esKind" :until="ex.until" />
      <VideoBases v-else-if="ex?.kind === 'bases'" :slot="ex.slot" :early="ex.early" :late="ex.late" />
    </div>
  </div>
</template>
