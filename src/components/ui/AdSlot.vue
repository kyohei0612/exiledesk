<!--
  AdSlot.vue — 広告の枠のお試し (?adpreview=1 の時だけ。utils/ad-preview.ts)。本物の広告は読まず、大きさと出し直しの回数だけ見せる。
  tick が変わった時と、画面に出た時に出し直す (60 秒以内なら見送り)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { adShow, adSlots, AD_MIN_GAP_S } from "../../utils/ad-preview";

const props = defineProps<{ id: string; w: number; h: number; tick?: number }>();
const flash = ref(false);
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
function show(): void {
  if (adShow(props.id)) {
    flash.value = true;
    setTimeout(() => (flash.value = false), 600);
  }
}
onMounted(() => {
  show();
  timer = setInterval(() => (now.value = Date.now()), 1000);
});
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
watch(() => props.tick, show);
const st = computed(() => adSlots.get(props.id));
const wait = computed(() => (st.value ? Math.min(AD_MIN_GAP_S, Math.max(0, AD_MIN_GAP_S - Math.floor((now.value - st.value.at) / 1000))) : 0));
</script>

<template>
  <div
    class="grid shrink-0 place-items-center rounded border border-dashed border-black/30 bg-[#efece6] text-center text-[11px] leading-snug text-[#3a352c] transition"
    :class="flash ? 'ring-4 ring-sky-400' : ''"
    :style="{ width: `${w}px`, height: `${h}px` }"
  >
    <div>
      <b class="block text-[13px]">広告 (お試し)</b>
      <span class="block opacity-70">{{ w }} × {{ h }}</span>
      <span class="mt-1 block">表示 {{ st?.n ?? 0 }} 回目</span>
      <span class="block opacity-70">{{ wait ? `あと ${wait} 秒は出し直さない` : "次の切り替えで出し直す" }}</span>
      <span v-if="st?.skipped" class="block opacity-60">60 秒以内で見送り {{ st.skipped }} 回</span>
    </div>
  </div>
</template>
