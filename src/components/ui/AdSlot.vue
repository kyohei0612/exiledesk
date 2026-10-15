<!--
  AdSlot.vue — 広告の枠 (Web だけ。並びと入れ替えの決まりは utils/ads.ts、設定は web/ads-config.ts)。
  本物に差し替える所はここ: 運営者 ID と広告ユニットの番号があれば AdSense の <ins>、無ければ仮の枠 (「広告 (仮)」)。
  出すのは画面に付いた時と tick (画面を移った) が変わった時だけ。60 秒以内なら見送って前の物を出したまま。
  AdSense は 1 つの <ins> を出し直せないので、出し直す時は key を変えて作り直してから push する
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { adRotation, adShow } from "../../utils/ads";
import { AD_CLIENT, adUnitOf } from "../../web/ads-config";
import { tr } from "../../i18n/lang";

const props = defineProps<{ id: string; w: number; h: number; tick?: number }>();
const unit = computed(() => adUnitOf(props.id));
/** 出した回数 (key に使う) */
const shown = ref(0);
const dev = !!import.meta.env.DEV;
const st = computed(() => adRotation.slots.get(props.id));

const box = ref<HTMLElement | null>(null);
/** 画面に出ている時だけ出す・数える (隠した右の列や、付いた直後に別の画面へ移って外れる枠は数えない) */
function show(): void {
  const el = box.value;
  if (!el || !el.isConnected || !el.getClientRects().length) return;
  if (!adShow(props.id)) return;
  shown.value++;
  if (unit.value) void nextTick(() => { try { ((window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle ??= []).push({}); } catch { /* 読めない時は空の枠 */ } });
}
// 付いた直後は 1 コマ待つ (同じ時に画面が切り替わると、すぐ外れる枠がある)
onMounted(() => requestAnimationFrame(show));
watch(() => props.tick, show, { flush: "post" });
</script>

<template>
  <div ref="box" class="shrink-0 overflow-hidden" :style="{ width: `${w}px`, height: `${h}px` }" :data-ad-slot-id="id">
    <ins
      v-if="unit"
      :key="shown"
      class="adsbygoogle"
      style="display: block"
      :style="{ width: `${w}px`, height: `${h}px` }"
      :data-ad-client="AD_CLIENT"
      :data-ad-slot="unit"
    />
    <!-- 仮の枠 (審査中・開発版)。AdSense の白い出し方に近い地 -->
    <div v-else class="grid h-full w-full place-items-center rounded border border-dashed border-black/30 bg-[#efece6] text-center text-[11px] leading-snug text-[#3a352c]">
      <div>
        <b class="block text-[13px]">{{ tr("広告 (仮)", "Ad (placeholder)") }}</b>
        <span class="block opacity-70">{{ w }} × {{ h }}</span>
        <span v-if="dev" class="mt-1 block opacity-70">{{ tr(`表示 ${st?.n ?? 0} 回`, `Shown ${st?.n ?? 0}`) }}<template v-if="st?.skipped"> · {{ tr(`見送り ${st.skipped}`, `skipped ${st.skipped}`) }}</template></span>
      </div>
    </div>
  </div>
</template>
