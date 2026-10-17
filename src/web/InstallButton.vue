<!--
  InstallButton.vue — 上の帯の「ホーム画面に追加」(PWA、2026-10-17 オーナー「追加ボタンあれば押すだろうね」)。
  Chrome・Edge・Android はブラウザの追加の窓を出す。iPhone・iPad の Safari は手順の小さい窓 (共有 → ホーム画面に追加)。
  もう追加して開いている時と、どちらもできないブラウザでは出さない
-->
<script setup lang="ts">
import { ref } from "vue";
import { canInstall, install, iosSafari, standalone } from "./pwa";
import { tr } from "../i18n/lang";

defineProps<{ phone: boolean }>();
const tip = ref(false);
async function onClick(): Promise<void> {
  if (await install()) return;
  if (iosSafari) tip.value = !tip.value;
}
</script>

<template>
  <span v-if="!standalone && (canInstall || iosSafari)" class="relative" data-pwa-install>
    <button type="button" class="g-btn sm" :class="phone ? '!min-h-9 !px-0 text-[12px]' : ''" :title="tr('ホーム画面に追加して、アプリのように開く (オフラインでも使える)', 'Add to your home screen and open it like an app (works offline)')" @click="onClick">{{ phone ? tr("追加", "Install") : tr("ホーム画面に追加", "Add to home screen") }}</button>
    <span v-if="tip" class="absolute right-0 top-full z-50 mt-1 w-60 rounded-lg border border-white/15 bg-[var(--exile-color-surface-raised,#16130f)] p-2.5 text-left text-[12px] leading-relaxed text-[var(--exile-color-text-primary)] shadow-lg" @click="tip = false">
      {{ tr("Safari の下の「共有」ボタン (□↑) を押して、「ホーム画面に追加」を選んでください。", "Tap the Share button (□↑) in Safari, then choose “Add to Home Screen”.") }}
    </span>
  </span>
</template>
