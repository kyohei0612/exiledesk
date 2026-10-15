<script setup lang="ts">
/**
 * 「ホーム画面に追加」のボタン (2026-10-15 オーナー「追加ボタンあれば押すだろうね」)。
 * Android / PC の Chrome・Edge はブラウザのインストールの案内を出す。iPhone / iPad は案内が無いので、共有 → ホーム画面に追加 の手順の窓を出す。
 * 入れた後 (ホーム画面から開いた時)・案内を出せないブラウザでは出さない (pwa.ts の installKind)
 */
import { install, installKind, iosHelpOpen } from "./pwa";
import { tr } from "../i18n/lang";
import ModalShell from "../components/ui/ModalShell.vue";

defineProps<{ phone?: boolean }>();
</script>

<template>
  <button v-if="installKind" type="button" class="g-btn sm" :class="phone ? '!min-h-8 text-[12px]' : ''" :title="tr('ホーム画面やデスクトップから、アプリのように開けます (オフラインでも動きます)', 'Open it like an app from your home screen or desktop (works offline)')" @click="install">{{ phone ? tr("ホームに追加", "Install") : tr("ホーム画面に追加", "Add to Home Screen") }}</button>
  <ModalShell :open="iosHelpOpen" :title="tr('ホーム画面に追加', 'Add to Home Screen')" width="w-full max-w-[22rem]" body-class="px-4 py-3" @close="iosHelpOpen = false">
    <ol class="flex list-decimal flex-col gap-2 pl-5 text-[13px]">
      <li>{{ tr("Safari の下 (iPad は上) の共有ボタン", "Tap the Share button at the bottom of Safari (top on iPad)") }} <svg viewBox="0 0 24 24" class="inline size-4 align-[-2px]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 11v9h12v-9" /></svg> {{ tr("を押す", "") }}</li>
      <li>{{ tr("「ホーム画面に追加」を選ぶ", "Choose \"Add to Home Screen\"") }}</li>
      <li>{{ tr("右上の「追加」を押す", "Tap \"Add\" in the top right") }}</li>
    </ol>
    <template #footer>
      <button type="button" class="g-btn sm ml-auto" @click="iosHelpOpen = false">{{ tr("閉じる", "Close") }}</button>
    </template>
  </ModalShell>
</template>
