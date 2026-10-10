<!--
  ChangelogDialog.vue — 更新内容 (更新した後に 1 回だけ) と 更新履歴 (バージョンを押した時) の窓 (2026-10-10)。
  中身と出す決まりは state/changelog.ts。アプリ (App.vue) と Web (WebApp.vue) の両方に置く
-->
<script setup lang="ts">
import { computed } from "vue";
import { APP_VERSION, CHANGELOG, changelogNew, changelogOpen } from "../state/changelog";
import { tr, isEn } from "../i18n/lang";
import ModalShell from "./ui/ModalShell.vue";

const list = computed(() => (changelogOpen.value === "new" ? changelogNew.value : CHANGELOG));
const close = (): void => { changelogOpen.value = null; };
</script>

<template>
  <!-- 窓の動きは ModalShell (2026-10-10 オーナー「動きが統一されてない所」: Esc が効いていなかった) -->
  <!-- 幅は画面まで (2026-10-10 スマホで右にはみ出して「閉じる」が見えなかった) -->
  <ModalShell :open="!!changelogOpen" width="w-full max-w-[38rem]" body-class="px-4 py-2" @close="close">
    <template #title>{{ changelogOpen === "new" ? tr("更新しました", "What's new") : tr("更新履歴", "Changelog") }}</template>
    <template #header>
      <span class="text-[12px] text-[var(--exile-color-text-tertiary)]">{{ tr("今の版", "Current version") }} v{{ APP_VERSION }}</span>
      <span v-if="isEn" class="text-[11px] text-[var(--exile-color-text-tertiary)]">(notes are in Japanese)</span>
    </template>
    <section v-for="(e, i) in list" :key="e.v" class="pb-2">
      <div v-if="i > 0" class="g-divider mb-2" />
      <p class="mb-1 flex items-baseline gap-2">
        <b class="text-[14px] text-[var(--exile-color-accent-focus)]">v{{ e.v }}</b>
        <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ e.date }}</span>
      </p>
      <ul class="space-y-0.5 text-[12px] leading-relaxed">
        <li v-for="(it, i) in e.items" :key="i" class="flex gap-2">
          <span class="shrink-0 text-[var(--exile-color-text-tertiary)]">・</span>
          <span class="min-w-0 break-words"><span v-if="it.area" class="mr-1 text-[var(--exile-color-text-secondary)]">{{ it.area }}:</span>{{ it.text }}</span>
        </li>
      </ul>
    </section>
    <template #footer>
      <button v-if="changelogOpen === 'new'" type="button" class="btn-link" @click="changelogOpen = 'all'">{{ tr("これまでの更新履歴", "Full changelog") }}</button>
      <button type="button" class="g-btn sm ml-auto" @click="close">{{ tr("閉じる", "Close") }}</button>
    </template>
  </ModalShell>
</template>
