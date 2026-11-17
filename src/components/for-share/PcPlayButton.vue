<script setup lang="ts">
/**
 * PcPlayButton.vue — スマホのデイリーの「PC 版を表示して挑戦」(D-70c、スイッチ phonePcView、2026-11-17)。
 * スマホの端末 (phoneDevice) の時だけ出す。押すと呼ぶ側の go (PC の挑戦ボタンと同じ働き) を呼ぶ。
 * 挑戦のページは木を組む画面なので、スマホの端末では PC の画面になる (WebApp・utils/phone-pc-view.ts)。出せない時 (スイッチが切れている・PC のブラウザ) は slot の字をそのまま出す。
 */
import { flag } from "../../web/release-flags";
import { tr } from "../../i18n/lang";
import { phoneDevice } from "../../utils/phone-pc-view";

defineProps<{ resume?: boolean }>();
const emit = defineEmits<{ go: [] }>();
const on = flag("phonePcView") && phoneDevice();
</script>

<template>
  <button v-if="on" type="button" class="g-btn-red min-h-11 self-start px-5 text-[15px]" data-daily-pc-play @click="emit('go')">
    {{ resume ? tr("PC 版を表示して続ける", "Resume in PC view") : tr("PC 版を表示して挑戦", "Play in PC view") }}
  </button>
  <slot v-else />
</template>
