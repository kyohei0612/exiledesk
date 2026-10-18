<!--
  AdSlot.vue — 広告の枠 (utils/ads.ts)。本番は審査が通るまで何も出さない (場所も取らない)。
  開発版は枠の大きさと出し直しの回数だけ見せる (本物の広告は読まない)。tick が変わった時と、画面に出た時に出し直す (60 秒以内なら見送り)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AD_FRAMES, AD_MIN_GAP_S, adShow, adSlots } from "../../utils/ads";

const props = defineProps<{ id: string; w: number; h: number; tick?: number }>();
const flash = ref(false);
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
function show(): void {
  if (!adShow(props.id)) return;
  flash.value = true;
  setTimeout(() => (flash.value = false), 600);
}
onMounted(() => {
  if (!AD_FRAMES) return;
  show();
  timer = setInterval(() => (now.value = Date.now()), 1000);
});
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
watch(() => props.tick, () => { if (AD_FRAMES) show(); });
const st = computed(() => adSlots.get(props.id));
const wait = computed(() => (st.value ? Math.max(0, AD_MIN_GAP_S - Math.floor((now.value - st.value.at) / 1000)) : 0));
</script>

<template>
  <div
    v-if="AD_FRAMES"
    data-ad-slot
    class="grid shrink-0 place-items-center rounded bg-[#efece6] text-center text-[11px] leading-snug text-[#3a352c] transition"
    :class="flash ? 'ring-4 ring-sky-400' : ''"
    :style="{ width: `${w}px`, height: `${h}px`, maxWidth: '100%' }"
  >
    <div>
      <b class="block text-[13px]">広告 (開発版だけ)</b>
      <span class="block opacity-70">{{ w }} × {{ h }}</span>
      <span class="mt-1 block">表示 {{ st?.n ?? 0 }} 回目</span>
      <span class="block opacity-70">{{ wait ? `あと ${wait} 秒は出し直さない` : "次のページで出し直す" }}</span>
      <span v-if="st?.skipped" class="block opacity-60">60 秒以内で見送り {{ st.skipped }} 回</span>
    </div>
  </div>
</template>
