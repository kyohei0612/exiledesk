<!--
  TreeFracStop.vue — 確定フラクチャーが置けない時のポップアップ (S-43a、スイッチ treeSureFracNeedMod)。
  出すかどうかと訳は tree-frac-stop.ts (stopSureFrac)。形は手の窓の赤い枠の確かめ「この手以降は削除されます」に合わせ、ボタンは「閉じる」だけ。
  後ろを押す・Esc でも閉じる (手の窓は開いたまま)。TreeOverlays.vue に 1 つ置く
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { tr } from "../../../i18n/lang";
import { sureFracWhyText } from "../../../services/simulator/tree/tree-sure-frac";
import { fracStop } from "./tree-frac-stop";

const close = (): void => { fracStop.value = null; };
// Esc はこの窓だけ閉じる (下の手の窓まで閉じない = 先に受けて止める)
function onKey(e: KeyboardEvent): void { if (fracStop.value && e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(); } }
onMounted(() => window.addEventListener("keydown", onKey, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey, true));
</script>

<template>
  <div v-if="fracStop" data-tree-frac-stop :data-why="fracStop" role="dialog" aria-modal="true" class="fixed inset-0 z-[330] flex items-center justify-center bg-black/60 px-4" @click.self="close">
    <!-- 字は 1 行に収める (枠は字の幅に合わせる。狭い画面だけ折り返す) -->
    <div class="w-fit max-w-full rounded-xl border border-rose-400/60 bg-[#1d0f10] px-5 py-3 text-center">
      <p data-tree-frac-stop-text class="whitespace-nowrap text-[16px] font-bold text-rose-100 max-[34rem]:whitespace-normal">{{ fracStop ? sureFracWhyText(fracStop) : "" }}</p>
      <div class="mt-3 flex">
        <button type="button" data-tree-frac-stop-close class="g-btn !min-h-11 flex-1" @click="close">{{ tr("閉じる", "Close") }}</button>
      </div>
    </div>
  </div>
</template>
