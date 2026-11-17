<script setup lang="ts">
/**
 * TurnSideways.vue — PC 版で挑戦している間 (D-70c) にスマホが縦持ちなら、画面全体に「スマホを横にしてください」を被せる (スイッチ dailyPcView、2026-11-17)。
 * iPhone の Safari は向きを固定できない (Screen Orientation の lock が効かない) ので、横にした時だけ遊べる形にする。挑戦の時間は止まらない。
 * 向きは頁の形 (orientation の media query) で見る: viewport は幅 1280 に固定なので、縦持ちは頁が縦長、横持ちは横長になる。
 * 頁の幅が 1280 なので字の大きさは vw で決める (画面いっぱいに縮めて出しても読める大きさ)。
 */
import { onBeforeUnmount, onMounted, ref } from "vue";
import { tr } from "../../i18n/lang";
import { pcViewOn } from "../../utils/daily-pc-view";

const portrait = ref(false);
let mq: MediaQueryList | null = null;
const read = (): void => { portrait.value = !!mq?.matches; };
onMounted(() => {
  mq = typeof matchMedia === "function" ? matchMedia("(orientation: portrait)") : null;
  read();
  mq?.addEventListener("change", read);
});
onBeforeUnmount(() => mq?.removeEventListener("change", read));
</script>

<template>
  <div v-if="pcViewOn && portrait" data-turn-sideways role="alertdialog" aria-modal="true" :aria-label="tr('スマホを横にしてください', 'Turn your phone sideways')" class="turn-sideways">
    <div class="turn-sideways-phone" aria-hidden="true"><span /></div>
    <p class="turn-sideways-title">{{ tr("スマホを横にしてください", "Turn your phone sideways") }}</p>
    <p class="turn-sideways-sub">{{ tr("PC 版は横持ちで遊べます。挑戦の時間は止まりません。", "The PC view plays in landscape. The challenge clock keeps running.") }}</p>
  </div>
</template>

<style scoped>
.turn-sideways {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3vw;
  padding: 0 8vw;
  background: rgb(8 7 6 / 0.94);
  color: var(--exile-color-text-primary, #e8dcc0);
  text-align: center;
  touch-action: none;
}
/* 縦の板が横へ倒れる絵 (縦 ⇄ 横をゆっくり行き来。動きを減らす設定の時は倒れた形で止める) */
.turn-sideways-phone {
  width: 14vw;
  height: 24vw;
  border: 1.2vw solid currentColor;
  border-radius: 2.4vw;
  opacity: 0.85;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding-bottom: 1.4vw;
  animation: turn-sideways-tilt 1.6s ease-in-out 0.3s infinite alternate;
}
.turn-sideways-phone span {
  width: 3vw;
  height: 0.8vw;
  border-radius: 1vw;
  background: currentColor;
}
@keyframes turn-sideways-tilt {
  from { transform: rotate(0deg); }
  to { transform: rotate(-90deg); }
}
@media (prefers-reduced-motion: reduce) {
  .turn-sideways-phone { animation: none; transform: rotate(-90deg); }
}
.turn-sideways-title {
  font-size: 6.5vw;
  font-weight: 700;
  line-height: 1.3;
  color: var(--exile-color-text-title, #e6c77a);
}
.turn-sideways-sub {
  font-size: 3.6vw;
  line-height: 1.5;
  opacity: 0.8;
}
</style>
