<!--
  SupportDialog.vue — 「支援する」で開く、支援の方法を選ぶ窓 (2026-10-10)。アプリ (App.vue) と Web (WebApp.vue) の両方に置く。
  押すとそのサービスのページを開くだけ (支払いはそのサービスの中で)
-->
<script setup lang="ts">
import { SUPPORT_LINKS, supportOpen } from "../state/support";
import { openExternal } from "../services/trade2/open-external";

const close = (): void => { supportOpen.value = false; };
function go(url: string): void { void openExternal(url); close(); }
</script>

<template>
  <Teleport to="body">
    <div v-if="supportOpen" class="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4" @click.self="close">
      <div class="g-panel flex w-full max-w-[26rem] min-w-0 flex-col">
        <div class="px-4 pt-2">
          <b class="g-brush text-[20px] text-[var(--exile-color-text-title)]">支援する</b>
          <p class="mt-1 text-[12px] text-[var(--exile-color-text-secondary)]">ExileDesk の開発を応援してもらえると嬉しいです。好きな方法を選んでください。</p>
        </div>
        <div class="flex flex-col gap-2 px-4 py-3">
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
        <div class="flex px-4 pb-2"><button type="button" class="g-btn sm ml-auto" @click="close">閉じる</button></div>
      </div>
    </div>
  </Teleport>
</template>
