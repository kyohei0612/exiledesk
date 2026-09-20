<!--
  NumStep.vue — 数字の入力欄 + 自前の ▲▼ (2026-09-20)

  灰色の既定値 (空欄でも計算に入っている値) から 1 ずつ動かすための共通の欄。
  ブラウザ既定のスピナーは消して、矢印キー・ホイール・▲▼ の 3 つとも自分で処理する。
  オーナー報告:「アプリだと灰色から 1 から始まる / 変わるところと変わらんところある」。
  既定のスピナーは動かし方を見分けられず、アプリ (WebView2) で当てにならなかった。

  v-model は表示単位の数 (null = 空欄 = 灰色の値を使う)。通貨の換算は呼ぶ側の仕事。
-->
<script setup lang="ts">
import { stepFrom } from "../composables/usePlaceholderStep";

const props = withDefaults(
  defineProps<{
    /** 灰色に出す既定値 (空欄の時に計算へ入る値) */
    placeholderValue?: number | null;
    /** 灰色の表示 */
    placeholderText?: string;
    width?: string;
    disabled?: boolean;
    /** 打ち込みを整数に丸めるか (数の欄は true、金額は false) */
    integer?: boolean;
  }>(),
  { placeholderValue: null, placeholderText: "—", width: "w-24", disabled: false, integer: false },
);
const model = defineModel<number | null>({ default: null });

function step(dir: 1 | -1): void {
  if (props.disabled) return;
  model.value = stepFrom(model.value, props.placeholderValue, dir);
}
function onKeydown(ev: KeyboardEvent): void {
  const dir = ev.key === "ArrowUp" ? 1 : ev.key === "ArrowDown" ? -1 : 0;
  if (dir === 0) return;
  // 既定の動き (空欄を 0 と見なして数え直す) は止めて、自分で動かす
  ev.preventDefault();
  step(dir as 1 | -1);
}
function onWheel(ev: WheelEvent): void {
  // 欄に入っている時だけ。ページのスクロールを奪わないように
  if (document.activeElement !== ev.currentTarget) return;
  ev.preventDefault();
  step(ev.deltaY < 0 ? 1 : -1);
}
function onInput(ev: Event): void {
  const raw = (ev.target as HTMLInputElement).value.trim();
  if (raw === "") {
    model.value = null;
    return;
  }
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0) return;
  model.value = props.integer ? Math.floor(v) : v;
}
</script>

<template>
  <span class="inline-flex items-stretch">
    <input
      :value="model ?? ''"
      type="number"
      min="0"
      :step="integer ? 1 : 'any'"
      :placeholder="placeholderText"
      :disabled="disabled"
      :class="['num', 'no-spin', width]"
      @keydown="onKeydown"
      @wheel="onWheel"
      @input="onInput"
    />
    <!-- 自前の ▲▼。既定のスピナーは .no-spin で消してある -->
    <span class="inline-flex flex-col justify-center ml-0.5 shrink-0">
      <button
        type="button"
        tabindex="-1"
        :disabled="disabled"
        class="numstep-btn"
        :title="`1 増やす (今の値か灰色の値から)`"
        @click="step(1)"
      >
        ▲
      </button>
      <button type="button" tabindex="-1" :disabled="disabled" class="numstep-btn" title="1 減らす" @click="step(-1)">▼</button>
    </span>
  </span>
</template>
