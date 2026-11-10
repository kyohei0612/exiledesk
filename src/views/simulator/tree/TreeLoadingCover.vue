<!--
  TreeLoadingCover.vue — 木を開いて組み直している間の「レシピ読み込み中…」(S-196、PC・スマホ共通。11-10 オーナー「ツリー組みなおしてるならレシピ読み込み中を画面に出して全ての動作できなくさせないとダメだな」)。
  画面全体を覆い、押す・指・ホイール・キーを全部止める (ヘッダーも含む)。組み終わったら外す。中身は use-tree-open の treeLoading
-->
<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { tr } from "../../../i18n/lang";
import { treeLoading } from "./use-tree-open";

const KINDS = ["keydown", "keyup", "keypress", "wheel", "touchstart", "touchmove", "pointerdown", "mousedown", "click", "dblclick", "contextmenu"] as const;
/** 読み込み中は操作を窓の手前で止める (覆いの外のキー・ホイールも) */
const stop = (e: Event): void => { if (!treeLoading.value) return; e.preventDefault(); e.stopImmediatePropagation(); };
const on = (): void => { for (const k of KINDS) window.addEventListener(k, stop, { capture: true, passive: false }); };
const off = (): void => { for (const k of KINDS) window.removeEventListener(k, stop, { capture: true }); };
watch(treeLoading, (v) => { off(); if (v) on(); }, { immediate: true });
onBeforeUnmount(off);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="treeLoading"
      data-tree-loading-cover
      role="status"
      aria-live="polite"
      class="fixed inset-0 z-[400] grid cursor-wait place-items-center bg-black/85 px-4"
    >
      <div class="g-panel flex items-center gap-3 px-6 py-4 text-[15px] tracking-[0.08em] text-[var(--exile-color-text-title)]">
        <span class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
        {{ tr("レシピ読み込み中…", "Loading recipe…") }}
      </div>
    </div>
  </Teleport>
</template>
