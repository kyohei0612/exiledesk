<!--
  DailyGoingPill.vue — 挑戦中にエミュ・シミュへ移った先の札「挑戦中 残り xx:xx・挑戦へ戻る」(D-37g)。1 回押せば挑戦の木へ戻る。
  時間は止まらない (D-32)。今日の挑戦が時間内で諦めていない時だけ、デイリーのページの外で出す。差し込みは WebApp (デザイン部長、D-91)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { tr } from "../../i18n/lang";
import { dailyPage } from "../../state/web-page";
import { openDailyPage } from "../../web/page";
import { getTry, leftMs, todayId } from "./daily-api";

const now = ref(Date.now());
const tick = setInterval(() => (now.value = Date.now()), 1000);
onBeforeUnmount(() => clearInterval(tick));
const id = computed(() => todayId(now.value));
const left = computed(() => { const t = getTry(id.value); return t && !t.ended ? leftMs(t, now.value) : 0; });
/** デイリーのページの中は一覧の「続ける」・挑戦の帯があるので出さない */
const shown = computed(() => left.value > 0 && !dailyPage.value);
const clock = computed(() => { const s = Math.ceil(left.value / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; });
</script>

<template>
  <button v-if="shown" type="button" class="g-btn-red daily-going-pill" data-daily-going @click="openDailyPage({ view: 'start', q: id })">
    {{ tr(`挑戦中 残り ${clock}・挑戦へ戻る`, `Challenge on, ${clock} left · Back to it`) }}
  </button>
</template>

<style scoped>
.daily-going-pill {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 60;
  min-height: 44px;
  padding: 0 18px;
  font-variant-numeric: tabular-nums;
}
</style>
