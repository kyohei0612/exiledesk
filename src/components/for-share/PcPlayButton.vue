<script setup lang="ts">
/**
 * PcPlayButton.vue — スマホのデイリーの「PC 版を表示して挑戦」(D-70c、スイッチ dailyPcView、2026-11-17)。
 * スマホの端末 (phoneDevice) の時だけ出す。押すと PC の画面にする印を立て、呼ぶ側の go (PC の挑戦ボタンと同じ働き) を呼ぶ。
 * 頁の幅が替わるのは挑戦のページ (daily-start) を出した時 (WebApp)。出せない時 (スイッチが切れている・PC のブラウザ) は slot の字をそのまま出す。
 */
import { flag } from "../../web/release-flags";
import { tr } from "../../i18n/lang";
import { pcWanted, phoneDevice } from "../../utils/daily-pc-view";

defineProps<{ resume?: boolean }>();
const emit = defineEmits<{ go: [] }>();
const on = flag("dailyPcView") && phoneDevice();
function press(): void {
  pcWanted.value = true;
  emit("go");
}
</script>

<template>
  <button v-if="on" type="button" class="g-btn-red min-h-11 self-start px-5 text-[15px]" data-daily-pc-play @click="press">
    {{ resume ? tr("PC 版を表示して続ける", "Resume in PC view") : tr("PC 版を表示して挑戦", "Play in PC view") }}
  </button>
  <slot v-else />
</template>
