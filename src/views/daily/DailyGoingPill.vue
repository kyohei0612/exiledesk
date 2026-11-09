<!--
  DailyGoingPill.vue — 挑戦中にエミュ・シミュへ移った先の札「挑戦中 残り xx:xx・挑戦へ戻る」(D-37g)。押すとお題のページ (「続きから始める」) へ戻る (11-09 夜オーナー「即ツリーじゃなくてここのページにこさせる」)。
  時間は止まらない (D-32)。今日の挑戦が時間内で諦めていない時だけ、デイリーのページの外で出す。
  中身の上に細い帯で置く (浮かせるとエミュのベースの名前などに重なった、11-09)。差し込みは WebApp の <main> の上
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
  <div v-if="shown" data-daily-going class="daily-going" role="status">
    <span>{{ tr("デイリーの挑戦中", "Daily challenge on") }} <b class="daily-going-clock">{{ tr(`残り ${clock}`, `${clock} left`) }}</b></span>
    <button type="button" class="g-btn-red sm" data-daily-going-back @click="openDailyPage({ view: 'detail', q: id })">{{ tr("挑戦へ戻る", "Back to the challenge") }}</button>
  </div>
</template>

<style scoped>
.daily-going {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--exile-color-border-subtle);
  font-size: 14px;
}
.daily-going-clock {
  font-variant-numeric: tabular-nums;
}
.daily-going button {
  min-height: 36px;
}
</style>
