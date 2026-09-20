<!--
  WatchReplaceDialog.vue — 監視の枠が埋まっている時に「どれと入れ替えるか」を選ぶ

  オーナー指示 2026-09-20:「上限設定したら監視押せないけど押せるようにして、んで入れ替える先を
  選択できるように。ポップアップで表示させようか、キャンセルもできるように」。
-->
<script setup lang="ts">
import BaseCard from "./decor/BaseCard.vue";
import { jaSkill } from "../i18n/skills-ja";
import { cancelReplace, replaceWith, watchReplace } from "../state/watch-replace";
import { watchSettings } from "../state/watch-settings";
</script>

<template>
  <div
    v-if="watchReplace.pending.value"
    class="fixed inset-0 z-[105] flex items-center justify-center bg-black/70 backdrop-blur-[1px]"
    @click.self="cancelReplace"
  >
    <BaseCard class="max-w-lg mx-6">
      <div class="p-5 pl-6">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-1">
          どれと入れ替えますか?
        </h2>
        <p class="text-[12px] text-[var(--exile-color-text-secondary)] leading-relaxed mb-3">
          監視は {{ watchSettings.maxGems }} ジェムまでです。
          <span class="text-[var(--exile-color-accent-focus)]">{{ jaSkill(watchReplace.pending.value) }}</span>
          を入れる代わりに外すジェムを選んでください。
          <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">
            外したジェムの記録は消えません (7 日以内に戻せば続きから追えます)。
          </span>
        </p>
        <ul class="flex flex-col gap-1 max-h-72 overflow-y-auto">
          <li v-for="en in watchReplace.choices.value" :key="en">
            <button
              type="button"
              class="w-full text-left px-3 py-1.5 rounded border border-[var(--exile-color-border-subtle)] text-[13px] hover:border-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]"
              @click="replaceWith(en)"
            >
              <span>{{ jaSkill(en) }}</span>
              <span class="text-[11px] text-[var(--exile-color-text-tertiary)] ml-2">{{ en }}</span>
              <span class="text-[11px] text-rose-300 float-right">これを外す</span>
            </button>
          </li>
        </ul>
        <div class="mt-4">
          <button
            type="button"
            class="text-[12px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-text-secondary)]"
            @click="cancelReplace"
          >
            キャンセル (何も変えない)
          </button>
        </div>
      </div>
    </BaseCard>
  </div>
</template>
