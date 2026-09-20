<!--
  MoneyInput.vue — 金額入力 (2026-09-12)
  v-model は高貴建て (number | null)。表示と入力は選択中の表示通貨 (state/display-currency)。
  通貨を切り替えると内部値はそのままで表示だけ換算される。
-->
<script setup lang="ts">
import { computed } from "vue";
import { displayCurrency, fmtNum } from "../../state/display-currency";
import { usePlaceholderStep } from "../../composables/usePlaceholderStep";

const props = withDefaults(
  defineProps<{
    /** 空欄時に薄く出す高貴建ての参考値 (自動取得値など)。null なら "—" */
    placeholderExalted?: number | null;
    placeholder?: string;
    disabled?: boolean;
    width?: string;
    /** 単位ラベルを右に出すか */
    unit?: boolean;
  }>(),
  { placeholderExalted: null, placeholder: "", disabled: false, width: "w-24", unit: true },
);
const model = defineModel<number | null>({ default: null });

/** 欄に出す値 (表示通貨建て)。空欄なら "" */
const shown = computed<string | number>(() => {
  const d = displayCurrency.toDisplay(model.value);
  if (d == null) return "";
  // 入力欄なので丸めすぎない (3 桁まで)。
  // 数値で返す: 文字列だと Vue の v-model (type="number") が入力中の「0.0」を数値 0 と "0" の違いで書き戻し、
  // 「0.05」と打つと「05」= 5 になっていた (2026-09-15)
  return Math.round(d * 1000) / 1000;
});

/**
 * 灰色の既定値から動かす (オーナー指示 2026-09-20)。
 * 空欄でも灰色の値が計算に入っているので、矢印やスピナーはそこから 1 ずつ動かす。
 */
const step = usePlaceholderStep();

/** 上下キー。空欄なら灰色の値から、値が入っていればそこから 1 ずつ (表示通貨建て) */
function onKeydown(ev: KeyboardEvent): void {
  step.onKeydown(ev, displayCurrency.toDisplay(model.value), displayCurrency.toDisplay(props.placeholderExalted), (v) => {
    model.value = displayCurrency.fromDisplay(v);
  });
}

function onInput(ev: Event): void {
  const wasEmpty = model.value == null;
  const stepped = step.stepValue(ev, wasEmpty, displayCurrency.toDisplay(props.placeholderExalted));
  if (stepped !== undefined) {
    model.value = displayCurrency.fromDisplay(stepped);
    return;
  }
  const t = (ev.target as HTMLInputElement).value.trim();
  if (t === "") {
    model.value = null;
    return;
  }
  const v = Number(t);
  if (!Number.isFinite(v)) return;
  model.value = displayCurrency.fromDisplay(v);
}
const ph = computed<string>(() => {
  if (props.placeholderExalted != null) {
    const d = displayCurrency.toDisplay(props.placeholderExalted);
    return d == null ? props.placeholder || "—" : fmtNum(d);
  }
  return props.placeholder || "—";
});
</script>

<template>
  <span class="inline-flex items-baseline gap-1 whitespace-nowrap">
    <input
      :value="shown"
      type="number"
      min="0"
      step="any"
      @beforeinput="step.onBeforeInput"
      @keydown="onKeydown"
      @input="onInput"
      :placeholder="ph"
      :disabled="disabled"
      :class="[
        'text-right text-[12px] px-1.5 py-0.5 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] focus:outline-none focus:border-[var(--exile-color-accent-focus)] tabular-nums disabled:opacity-40',
        width,
      ]"
    />
    <span v-if="unit" class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ displayCurrency.label.value }}</span>
  </span>
</template>
