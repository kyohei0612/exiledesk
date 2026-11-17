<script setup lang="ts">
/**
 * TurnSideways.vue — スマホで木を組む画面 (シミュの木・デイリーの挑戦、U-53d) が縦持ちの間、上のヘッダー (スマホの形) は出したまま、
 * その下を「画面の向きのロックを解除し、スマホを横にしてください」と「横向きで表示」の案内にする (スイッチ phonePcView、2026-11-17)。
 * 横にすると消えて、同じページのまま PC の画面で遊べる (utils/phone-pc-view.ts)。iPhone の Safari は向きを固定できないので案内で止める。挑戦の時間は止まらない。
 * 「横向きで表示」は端末は縦のまま中身を 90 度回して PC の画面を描く (utils/turn-page.ts)。回している間は右上に「横向き表示をやめる」。
 * 縦持ちの間は頁の幅はスマホのまま (案内の字は px)。ヘッダーから他の画面へ移れる (オーナー 11-17「ヘッダーはあったがええな」)。
 */
import { computed, onBeforeUnmount, watch } from "vue";
import { tr } from "../../i18n/lang";
import { guideOn, portrait, treeShown } from "../../utils/phone-pc-view";
import { setTurned, turned } from "../../utils/turn-page";
import { dailyPage } from "../../state/web-page";
import { openDailyPage, openTreePage } from "../../web/page";

const on = computed(() => guideOn(turned.value));
// 回すのは、端末を本当に横にした時・木を組む画面を離れた時にやめる
watch([portrait, treeShown], ([p, t]) => { if (!p || !t) setTurned(false); });
// 案内を出したら頁の上へ (ヘッダーのすぐ下から案内が見えるように)
watch(on, (v) => { if (v) window.scrollTo(0, 0); });
onBeforeUnmount(() => setTurned(false));
/**
 * 戻る (オーナー 11-17「戻るボタンもな」): このサイトの中で前の画面があればブラウザの戻る (= 木の前に居た所)。
 * 無い時 (共有の URL で直に開いた等) は、デイリーの挑戦ならお題の画面、シミュの木なら完成形の MOD の段へ。挑戦の時間は止まらない
 */
function back(): void {
  const idx = (history.state as { edIdx?: unknown } | null)?.edIdx;
  if (typeof idx === "number" && idx > 0) { history.back(); return; }
  const d = dailyPage.value;
  if (d?.view === "start" && d.q) openDailyPage({ view: "detail", q: d.q });
  else openTreePage("mods");
}
</script>

<template>
  <!-- 回している間は右上に戻すボタン (もう一度押すとやめる) -->
  <button v-if="turned" type="button" class="g-btn sm turn-sideways-back" data-turn-sideways-unrotate @click="setTurned(false)">{{ tr("横向き表示をやめる", "Stop sideways view") }}</button>
  <div v-if="on" data-turn-sideways role="alertdialog" :aria-label="tr('画面の向きのロックを解除し、スマホを横にしてください', 'Turn off rotation lock and turn your phone sideways')" class="turn-sideways">
    <div class="turn-sideways-phone" aria-hidden="true"><span /></div>
    <p class="turn-sideways-title">{{ tr("画面の向きのロックを解除し、スマホを横にしてください", "Turn off rotation lock and turn your phone sideways") }}</p>
    <!-- ロックを外せない・外したくない時: 端末は縦のまま、中身を横向きに回して描く (オーナー 11-17「回転ボタンは９０度ロック中でも変えてくれる？」→「ならあったがええ」) -->
    <div class="turn-sideways-acts">
      <button type="button" class="g-btn turn-sideways-btn" data-turn-sideways-back @click="back">{{ tr("← 戻る", "← Back") }}</button>
      <button type="button" class="g-btn-red turn-sideways-btn" data-turn-sideways-rotate @click="setTurned(true)">{{ tr("横向きで表示", "Show sideways") }}</button>
    </div>
    <p class="turn-sideways-note">{{ tr("ロックを外さずに遊ぶ時に。押したらスマホを左へ倒して持つ。挑戦の時間は止まりません。", "To play without turning off the lock. After tapping, hold the phone turned to the left. The challenge clock keeps running.") }}</p>
  </div>
</template>

<style scoped>
/* ヘッダー (スマホの形、h-11 = 44px) の下を全部覆う。ヘッダーは押せるまま */
.turn-sideways {
  position: fixed;
  inset: 44px 0 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 0 28px 44px;
  background: var(--exile-color-bg-canvas, #0b0a08);
  color: var(--exile-color-text-primary, #e8dcc0);
  text-align: center;
  touch-action: none;
}
/* 縦の板が横へ倒れる絵 (縦 ⇄ 横をゆっくり行き来。動きを減らす設定の時は倒れた形で止める) */
.turn-sideways-phone {
  width: 44px;
  height: 76px;
  border: 4px solid currentColor;
  border-radius: 9px;
  opacity: 0.85;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding-bottom: 5px;
  animation: turn-sideways-tilt 1.6s ease-in-out 0.3s infinite alternate;
}
.turn-sideways-phone span {
  width: 12px;
  height: 3px;
  border-radius: 3px;
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
  margin: 4px 0 0;
  max-width: 22em;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--exile-color-text-title, #e6c77a);
}
/* 戻る (左・控えめ) と横向きで表示 (右・主) を横に並べる。入らない幅 (320 など) は折り返す */
.turn-sideways-acts {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}
.turn-sideways-btn {
  min-height: 48px;
  padding: 0 24px;
  font-size: 16px;
}
.turn-sideways-note {
  max-width: 24em;
  font-size: 13px;
  line-height: 1.6;
  opacity: 0.65;
}
/* 回している間の戻すボタン: 回した箱 (body) の右上に留める */
.turn-sideways-back {
  position: fixed;
  top: 6px;
  right: 8px;
  z-index: 9999;
}
</style>
