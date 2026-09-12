<!--
  MoneyInput.vue — 金額入力 (2026-09-12)
  v-model は高貴建て (number | null)。表示と入力は選択中の表示通貨 (state/display-currency)。
  通貨を切り替えると内部値はそのままで表示だけ換算される。
-->
<script setup lang="ts">
import { computed } from "vue";
import { displayCurrency, fmtNum } from "../../state/display-currency";

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

const shown = computed<string | number | null>({
  get: () => {
    const d = displayCurrency.toDisplay(model.value);
    if (d == null) return "";
    // 入力欄なので丸めすぎない (3 桁まで)
    return String(Math.round(d * 1000) / 1000);
  },
  set: (raw: string | number | null) => {
    // type="number" の v-model は Vue が数値に変換して渡す (文字列とは限らない) ので、両方受ける
    const t = raw == null ? "" : String(raw).trim();
    if (t === "") {
      model.value = null;
      return;
    }
    const v = Number(t);
    if (!Number.isFinite(v)) return;
    model.value = displayCurrency.fromDisplay(v);
  },
});
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
      v-model="shown"
      type="number"
      min="0"
      step="any"
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
