<!--
  AdSlot.vue — 広告の枠 (utils/ads.ts)。本番は審査が通るまで何も出さない (場所も取らない)。
  開発版は枠の大きさと出し直しの回数だけ見せる (本物の広告は読まない)。tick が変わった時と、画面に出た時に出し直す (60 秒以内なら見送り)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AD_FRAMES, AD_MIN_GAP_S, adShow, adSlots } from "../../utils/ads";
import { tr } from "../../i18n/lang";

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
    class="grid shrink-0 place-items-center rounded bg-ad-paper text-center text-[11px] leading-snug text-ad-ink transition"
    :class="flash ? 'ring-4 ring-sky-400' : ''"
    :style="{ width: `${w}px`, height: `${h}px`, maxWidth: '100%' }"
  >
    <div>
      <b class="block text-[13px]">{{ tr("広告 (開発版だけ)", "Ad (dev only)") }}</b>
      <span class="block opacity-70">{{ w }} × {{ h }}</span>
      <span class="mt-1 block">{{ tr(`表示 ${st?.n ?? 0} 回目`, `Shown ${st?.n ?? 0} times`) }}</span>
      <span class="block opacity-70">{{ wait ? tr(`あと ${wait} 秒は出し直さない`, `No refresh for ${wait} s`) : tr("次のページで出し直す", "Refreshes on the next page") }}</span>
      <span v-if="st?.skipped" class="block opacity-60">{{ tr(`60 秒以内で見送り ${st.skipped} 回`, `Skipped within 60 s: ${st.skipped}`) }}</span>
    </div>
  </div>
</template>
