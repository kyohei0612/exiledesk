<!--
  HeldCursor.vue — 持っている物の絵をマウスのカーソルに付ける (エミュの CraftStage から共有へ、2026-10-26 オーナー「パソコン版持ってるかわからんから MOD 選択したら持ってるようにエミュと同じ仕様で」、シミュ部長 30)。
  絵の URL を渡すだけ (null なら出さない)。拡大の打ち消し (toCss) とマウスを中で追う。スマホ (768px 未満) では出さない。
  最後のマウスの位置は部品の外で 1 つだけ覚える (持った直後に左上へ一瞬出ないように)
-->
<script lang="ts">
import { ref } from "vue";
import { toCss } from "../../../utils/zoom";

/** 最後のマウスの位置 (CSS px)。最初に部品ができた時に 1 回だけ window に付ける */
const last = ref({ x: 0, y: 0 });
let watching = false;
function watchPointer(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("mousemove", (e: MouseEvent) => { last.value = { x: toCss(e.clientX), y: toCss(e.clientY) }; }, { passive: true });
}
</script>

<script setup lang="ts">
import { usePhone } from "../../../utils/use-phone";

defineProps<{ /** 持っている物の絵 (null・空なら出さない) */ src?: string | null }>();
const phone = usePhone();
watchPointer();
</script>

<template>
  <img
    v-if="src && !phone"
    :src="src"
    alt=""
    data-rec-part="held-icon"
    class="pointer-events-none fixed z-[200] h-10 w-10 object-contain drop-shadow-[0_0_6px_rgba(250,204,21,0.8)]"
    :style="{ left: `${last.x + 8}px`, top: `${last.y + 8}px` }"
  />
</template>
