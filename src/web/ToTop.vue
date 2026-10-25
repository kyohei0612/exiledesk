<!--
  ToTop.vue — スマホの「上へ戻る」ボタン (2026-10-25 オーナーがスマホの見え方を見て)。全部の画面の右下に付いてくる。少し下へ送った時だけ出し、押すと一番上へ。
  下に固定の帯 (data-bottom-bar・デイリーの data-daily-go) が出ている時はその上に浮かせて重ねない。PC (768px 以上) は出さない。WebApp.vue に 1 つ
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "../components/ui/Icon.vue";
import { tr } from "../i18n/lang";
import { usePhone } from "../utils/use-phone";

const phone = usePhone();
const shown = ref(false);
/** 下の帯の高さ (帯の上に浮かせる) */
const lift = ref(0);
/** これより下へ送ったら出す (画面の半分くらい) */
const SHOW_AT = 400;
function update(): void {
  shown.value = window.scrollY > SHOW_AT;
  let h = 0;
  for (const el of document.querySelectorAll<HTMLElement>("[data-bottom-bar], [data-daily-go]")) {
    if (getComputedStyle(el).position !== "fixed") continue;
    const r = el.getBoundingClientRect();
    if (r.height && r.bottom >= window.innerHeight - 1) h = Math.max(h, r.height);
  }
  lift.value = h;
}
const toTop = (): void => window.scrollTo({ top: 0, behavior: "smooth" });
let raf = 0;
const onScroll = (): void => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
onMounted(() => { window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", onScroll); update(); });
onBeforeUnmount(() => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); });
</script>

<template>
  <button
    v-if="phone"
    type="button"
    data-to-top
    class="g-btn fixed right-3 z-[140] grid size-11 place-items-center !p-0 transition-opacity duration-200"
    :class="shown ? 'opacity-100' : 'pointer-events-none opacity-0'"
    :style="{ bottom: `calc(${lift ? `${lift}px + 0.5rem` : 'max(0.75rem, env(safe-area-inset-bottom))'})` }"
    :aria-hidden="!shown"
    :tabindex="shown ? 0 : -1"
    :title="tr('上へ戻る', 'Back to top')"
    :aria-label="tr('上へ戻る', 'Back to top')"
    @click="toTop"
  ><Icon name="chevron-up" class="size-5" /></button>
</template>
