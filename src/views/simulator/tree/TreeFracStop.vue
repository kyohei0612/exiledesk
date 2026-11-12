<!--
  TreeFracStop.vue — 確定フラクチャーが置けない時のポップアップ (S-43a、スイッチ treeSureFracNeedMod)。
  出すかどうかと訳は tree-frac-stop.ts (stopSureFrac)。形は手の窓の赤い枠の確かめ「この手以降は削除されます」に合わせ、ボタンは「閉じる」だけ。
  後ろを押す・Esc でも閉じる (手の窓は開いたまま)。TreeOverlays.vue に 1 つ置く
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { tr } from "../../../i18n/lang";
import { fracStop } from "./tree-frac-stop";

const close = (): void => { fracStop.value = null; };
// Esc はこの窓だけ閉じる (下の手の窓まで閉じない = 先に受けて止める)
function onKey(e: KeyboardEvent): void { if (fracStop.value && e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(); } }
onMounted(() => window.addEventListener("keydown", onKey, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey, true));
</script>

<template>
  <div v-if="fracStop" data-tree-frac-stop :data-why="fracStop" role="dialog" aria-modal="true" class="fixed inset-0 z-[330] flex items-center justify-center bg-black/60 px-4" @click.self="close">
    <div class="w-full max-w-sm rounded-xl border border-rose-400/60 bg-[#1d0f10] px-4 py-3 text-center">
      <p data-tree-frac-stop-text class="text-[16px] font-bold text-rose-100">
        {{ fracStop === "desecrated" ? tr("冒涜で付いた MOD にはフラクチャーを打てません。", "Desecrated mods can't be fractured.") : tr("フラクチャー予定の MOD がまだ付いていません。", "The mod you chose to fracture isn't on this item yet.") }}
      </p>
      <div class="mt-3 flex">
        <button type="button" data-tree-frac-stop-close class="g-btn !min-h-11 flex-1" @click="close">{{ tr("閉じる", "Close") }}</button>
      </div>
    </div>
  </div>
</template>
