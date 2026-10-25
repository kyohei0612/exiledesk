<!--
  SimPcOnly.vue — スマホ (768px 未満) でシミュのページを URL で開いた時の一言 (2026-10-25 オーナー「A でいこう」、本番に出す前。
  ツリーは縦の画面では操作できないので形ごと作り直すまで出さない、メモ sim-decisions の「スマホのツリーは作り直す前提」)。上のタブはデザインの ModeTabs が隠す。
  スイッチ simPhone が入っていれば、ツリーのページはスマホ版 (質問で進める形、phone/PhoneTreePage)。レシピのページはまだ一言のまま
-->
<script setup lang="ts">
import { tr } from "../../i18n/lang";
import { flag } from "../../web/release-flags";
import { recipesPage } from "../../state/web-page";
import PhoneTreePage from "./phone/PhoneTreePage.vue";

const SIM_PHONE = flag("simPhone");
</script>

<template>
  <PhoneTreePage v-if="SIM_PHONE && !recipesPage" />
  <div v-else data-sim-pc-only class="g-panel px-4 py-6 text-center text-[14px] text-[var(--exile-color-text-secondary)]">
    {{ tr("シミュレーターは PC で開いてください", "Please open the simulator on a PC") }}
  </div>
</template>
