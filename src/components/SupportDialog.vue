<!--
  SupportDialog.vue — 「支援する」で開く、支援の方法を選ぶ窓 (2026-10-10)。アプリ (App.vue) と Web (WebApp.vue) の両方に置く。
  押すとそのサービスのページを開くだけ (支払いはそのサービスの中で)
-->
<script setup lang="ts">
import { SUPPORT_LINKS, supportOpen } from "../state/support";
import { openExternal } from "../services/trade2/open-external";
import { tr } from "../i18n/lang";
import ModalShell from "./ui/ModalShell.vue";

const close = (): void => { supportOpen.value = false; };
function go(url: string): void { void openExternal(url); close(); }
</script>

<template>
  <!-- 窓の動きは ModalShell (2026-10-10 オーナー「動きが統一されてない所」) -->
  <ModalShell :open="supportOpen" :title="tr('支援する', 'Support')" width="w-full max-w-[26rem]" body-class="px-4 py-2" @close="close">
    <p class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("ExileDesk の開発を応援してもらえると嬉しいです。好きな方法を選んでください。", "Your support helps ExileDesk keep growing. Pick whichever way you like.") }}</p>
    <div class="flex flex-col gap-2 py-3">
      <button
        v-for="l in SUPPORT_LINKS"
        :key="l.id"
        type="button"
        class="g-plain flex items-center gap-3 rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] px-3 py-2 text-left transition-colors hover:border-[var(--exile-color-accent-focus)]"
        @click="go(l.url)"
      >
        <span class="min-w-0 flex-1">
          <b class="block text-[14px] text-[var(--exile-color-text-title)]">{{ l.name }}</b>
          <span class="block text-[11px] text-[var(--exile-color-text-tertiary)]">{{ l.note }}</span>
        </span>
        <span class="shrink-0 rounded border border-[var(--exile-color-border-brass)] px-1.5 text-[11px] text-[var(--exile-color-accent-focus)]">{{ l.kind }}</span>
      </button>
    </div>
    <template #footer>
      <button type="button" class="g-btn sm ml-auto" @click="close">{{ tr("閉じる", "Close") }}</button>
    </template>
  </ModalShell>
</template>
