<!--
  ChangelogDialog.vue — 更新内容 (更新した後に 1 回だけ) と 更新履歴 (バージョンを押した時) の窓 (2026-10-10)。
  中身と出す決まりは state/changelog.ts。アプリ (App.vue) と Web (WebApp.vue) の両方に置く
-->
<script setup lang="ts">
import { computed } from "vue";
import { APP_VERSION, CHANGELOG, changelogNew, changelogOpen } from "../state/changelog";
import { tr, isEn } from "../i18n/lang";

const list = computed(() => (changelogOpen.value === "new" ? changelogNew.value : CHANGELOG));
const close = (): void => { changelogOpen.value = null; };
</script>

<template>
  <Teleport to="body">
    <div v-if="changelogOpen" class="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4" @click.self="close" @keydown.esc="close">
      <!-- 幅は画面まで (2026-10-10 スマホで右にはみ出して「閉じる」が見えなかった) -->
      <div class="g-panel flex max-h-[80vh] w-full max-w-[38rem] min-w-0 flex-col overflow-hidden">
        <div class="flex items-baseline gap-2 px-4 pt-2">
          <b class="g-brush text-[20px] text-[var(--exile-color-text-title)]">{{ changelogOpen === "new" ? tr("更新しました", "What's new") : tr("更新履歴", "Changelog") }}</b>
          <span class="text-[12px] text-[var(--exile-color-text-tertiary)]">{{ tr("今の版", "Current version") }} v{{ APP_VERSION }}</span>
          <span v-if="isEn" class="text-[11px] text-[var(--exile-color-text-tertiary)]">(notes are in Japanese)</span>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-2">
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
        </div>
        <div class="flex items-center gap-3 px-4 pb-2 pt-1">
          <button v-if="changelogOpen === 'new'" type="button" class="btn-link" @click="changelogOpen = 'all'">{{ tr("これまでの更新履歴", "Full changelog") }}</button>
          <button type="button" class="g-btn sm ml-auto" @click="close">{{ tr("閉じる", "Close") }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
