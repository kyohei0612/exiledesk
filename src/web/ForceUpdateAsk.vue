<!--
  ForceUpdateAsk.vue — 強制更新のポップアップ (U-35、スイッチ forceUpdate)。出す・出さないと読み直しは web/force-update.ts。WebApp.vue に 1 つ置く。
  押すまで待つ (自動で入らない)。押せるのは「更新する」「後で更新する」の 2 つで、× ・Esc・後ろを押すでは閉じない (U-20・U-21 の外れ)。
  更新するを押した後は、新しい版を読み込むまで幕を出す (押しても何も起きないように見えないように)
-->
<script setup lang="ts">
import ModalShell from "../components/ui/ModalShell.vue";
import Icon from "../components/ui/Icon.vue";
import { tr } from "../i18n/lang";
import { forceAsk, forceGoing, forceLater, forceReload } from "./force-update";
</script>

<template>
  <ModalShell :open="forceAsk" :title="tr('新しい版があります', 'A new version is available')" :closable="false" layer="confirm" width="w-full max-w-md" body-class="px-4 py-3" rec="force-update">
    <p class="text-[13px] leading-relaxed text-[var(--exile-color-text-secondary)]">{{ tr("新しい版にします。今やっている所 (木・アイテム・打った手・開いている窓) はそのまま戻ります。", "Switch to the new version. What you are working on (trees, items, crafted steps, open windows) comes back as it is.") }}</p>
    <template #footer>
      <button type="button" data-force-later class="g-btn sm ml-auto" @click="forceLater">{{ tr("後で更新する", "Update later") }}</button>
      <button type="button" data-force-go class="g-btn sm" autofocus @click="forceReload"><Icon name="rotate" class="size-3.5" />{{ tr("更新する", "Update now") }}</button>
    </template>
  </ModalShell>
  <div v-if="forceGoing" data-force-going class="fixed inset-0 z-[320] flex items-center justify-center bg-black/70" role="status" aria-live="polite">
    <span class="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-black/60 px-4 py-2 text-[13px] text-amber-100/90">
      <span class="size-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-300/30 border-t-amber-300" aria-hidden="true" />
      {{ tr("新しい版を読み込んでいます", "Loading the new version") }}
    </span>
  </div>
</template>
