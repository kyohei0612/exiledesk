<!--
  TreeLoadingCover.vue — 木を開いて組み直している間の「レシピ読み込み中…」(S-196、PC・スマホ共通。11-10 オーナー「ツリー組みなおしてるならレシピ読み込み中を画面に出して全ての動作できなくさせないとダメだな」)。
  画面全体を覆い、押す・指・ホイール・キーを全部止める (ヘッダーも含む)。組み終わったら外す。中身は use-tree-open の treeLoading。
  地は透けない (S-196e、11-15 オーナー「きんの指輪がでてたね」: 前は 85% の黒で、下の白紙の木と「未設定 1 つ」が透けて見えた)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { tr } from "../../../i18n/lang";
import { claimCover, coverFromBoot, treeLoading } from "./tree-loading";

const KINDS = ["keydown", "keyup", "keypress", "wheel", "touchstart", "touchmove", "pointerdown", "mousedown", "click", "dblclick", "contextmenu"] as const;
/** 読み込み中は操作を窓の手前で止める (覆いの外のキー・ホイールも) */
/** (スイッチ sharedOpenCover、S-196f2) 組み終えた後も木の箱が描かれるまで (3 秒まで) 覆ったまま。前は外れてから木が出るまで 0.5 秒ほどヘッダーだけの頁が押せた */
const held = ref(false);
watch(treeLoading, (v, was) => {
  held.value = false;
  if (v || !was || !coverFromBoot()) return;
  held.value = true;
  const t0 = performance.now(), look = (): void => { if (!held.value) return; if (document.querySelector("[data-tree-box]") || performance.now() - t0 > 3000) held.value = false; else requestAnimationFrame(look); };
  requestAnimationFrame(look);
});
const busy = computed(() => treeLoading.value || held.value);
const stop = (e: Event): void => { if (!busy.value) return; e.preventDefault(); e.stopImmediatePropagation(); };
const on = (): void => { for (const k of KINDS) window.addEventListener(k, stop, { capture: true, passive: false }); };
const off = (): void => { for (const k of KINDS) window.removeEventListener(k, stop, { capture: true }); };
watch(busy, (v) => { off(); if (v) on(); }, { immediate: true });
const cover = claimCover(); // 頁の外枠と木の頁の両方に置いた時は先に置いた 1 つだけ描く (S-196f2)
const shown = computed(() => busy.value && cover.first());
onBeforeUnmount(() => { off(); cover.drop(); });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="shown"
      data-tree-loading-cover
      role="status"
      aria-live="polite"
      class="fixed inset-0 z-[400] grid cursor-wait place-items-center bg-[var(--exile-color-bg-canvas)] px-4"
    >
      <div class="g-panel flex items-center gap-3 px-6 py-4 text-[15px] tracking-[0.08em] text-[var(--exile-color-text-title)]">
        <span class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
        {{ tr("レシピ読み込み中…", "Loading recipe…") }}
      </div>
    </div>
  </Teleport>
</template>
