<!--
  CountInput.vue — 「空欄なら灰色の既定値を使う」数の入力欄 (2026-09-20)

  収支の「使った数」「売れた数」用。空欄でも灰色の値 (1 回の数 × 回数、期待値) が
  そのまま計算に入っているので、矢印やスピナーはその値から 1 ずつ動かす
  (オーナー指示:「灰色が 12.5 なら上は 13・14・15、下は 12・11・10」)。
  それまでは空欄から 0 → 1 と数え直していた。

  値の意味は今まで通り: 空欄 = null = 自動 (灰色の値を使う)。
-->
<script setup lang="ts">
import { usePlaceholderStep } from "../composables/usePlaceholderStep";

const props = withDefaults(
  defineProps<{
    /** 灰色に出す既定値 (空欄の時に計算へ入る値) */
    placeholderValue?: number | null;
    /** 灰色の表示 (桁の丸め方は呼ぶ側に任せる) */
    placeholderText?: string;
    width?: string;
  }>(),
  { placeholderValue: null, placeholderText: "0", width: "w-24" },
);
const model = defineModel<number | null>({ default: null });
const step = usePlaceholderStep();

/** 上下キー。空欄なら灰色の値から 1 ずつ */
function onKeydown(ev: KeyboardEvent): void {
  step.onKeydown(ev, model.value, props.placeholderValue, (v) => {
    model.value = v;
  });
}

function onInput(ev: Event): void {
  const stepped = step.stepValue(ev, model.value == null, props.placeholderValue);
  if (stepped !== undefined) {
    model.value = stepped;
    return;
  }
  const raw = (ev.target as HTMLInputElement).value.trim();
  if (raw === "") {
    model.value = null;
    return;
  }
  const v = Number(raw);
  if (Number.isFinite(v) && v >= 0) model.value = v;
}
</script>

<template>
  <input
    :value="model ?? ''"
    type="number"
    min="0"
    step="1"
    :placeholder="placeholderText"
    :class="['num', width]"
    @beforeinput="step.onBeforeInput"
    @keydown="onKeydown"
    @input="onInput"
  />
</template>
