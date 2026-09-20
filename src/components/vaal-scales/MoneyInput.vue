<script setup lang="ts">
import { computed } from "vue";
import { displayCurrency, fmtNum } from "../../state/display-currency";
import NumStep from "../NumStep.vue";

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
/** v-model は高貴建て (number | null)。表示と入力は選択中の表示通貨 */
const model = defineModel<number | null>({ default: null });

/** 欄に出す値 (表示通貨建て)。入力欄なので丸めすぎない (3 桁まで) */
const shown = computed<number | null>({
  get: () => {
    const d = displayCurrency.toDisplay(model.value);
    return d == null ? null : Math.round(d * 1000) / 1000;
  },
  set: (v) => {
    model.value = v == null ? null : displayCurrency.fromDisplay(v);
  },
});

/** 灰色に出す参考値 (表示通貨建て)。▲▼ はここから動かす */
const phValue = computed<number | null>(() => displayCurrency.toDisplay(props.placeholderExalted));
const ph = computed<string>(() => {
  if (props.placeholderExalted != null) {
    const d = phValue.value;
    return d == null ? props.placeholder || "—" : fmtNum(d);
  }
  return props.placeholder || "—";
});
</script>

<template>
  <span class="inline-flex items-baseline gap-1 whitespace-nowrap">
    <NumStep v-model="shown" :placeholder-value="phValue" :placeholder-text="ph" :width="width" :disabled="disabled" />
    <span v-if="unit" class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ displayCurrency.label.value }}</span>
  </span>
</template>
