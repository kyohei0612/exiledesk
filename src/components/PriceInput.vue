<!--
  PriceInput.vue — 手で入れる値段の欄 (数字 + 単位のプルダウン) (2026-10-05)

  オーナー「単位は自分で決めさせて、プルダウンで高貴・カオス・神、デフォはカオス」「こういう所も単位選べるようにでしょ、
  チェック漏れてっぞ、他もないか探してくれ」「小数点ではしないで、数値で 1 2 3 等」。手で値段を入れる欄はどこもこれを使う。
  - v-model の値は使う側の単位 (base、既定は神)。欄に出す数字は選んだ単位で、整数に丸める
  - 単位は欄ごと (unit-key) に覚える。最初はカオス。換算は今の相場 (display-currency.ts の rateOf)
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { rateOf, type DisplayCurrency } from "../state/display-currency";

const props = withDefaults(defineProps<{
  modelValue: number | null | undefined;
  /** v-model の値の単位 */
  base?: DisplayCurrency;
  /** 単位を覚えるための名前 (欄ごと) */
  unitKey?: string;
  placeholder?: string;
  title?: string;
}>(), { base: "divine", unitKey: "", placeholder: "値段", title: "" });
const emit = defineEmits<{ "update:modelValue": [v: number | null] }>();

const UNITS: Array<{ k: DisplayCurrency; ja: string }> = [{ k: "exalted", ja: "高貴" }, { k: "chaos", ja: "カオス" }, { k: "divine", ja: "神" }];
const KEY = props.unitKey ? `exiledesk.priceUnit.${props.unitKey}` : "";
const unit = ref<DisplayCurrency>("chaos");
try { const u = KEY ? localStorage.getItem(KEY) : null; if (u === "exalted" || u === "chaos" || u === "divine") unit.value = u; } catch { /* 無くてよい */ }
watch(unit, (u) => { try { if (KEY) localStorage.setItem(KEY, u); } catch { /* 無くてよい */ } });

/** 欄に出す数字 (選んだ単位、整数) */
const shown = computed(() => {
  const v = props.modelValue;
  return typeof v === "number" && Number.isFinite(v) ? Math.round((v * rateOf(props.base)) / rateOf(unit.value)) : "";
});
function onInput(e: Event): void {
  const raw = (e.target as HTMLInputElement).value;
  const n = raw === "" ? null : Math.round(Number(raw));
  emit("update:modelValue", n == null || !Number.isFinite(n) || n < 0 ? null : (n * rateOf(unit.value)) / rateOf(props.base));
}
</script>

<template>
  <span class="inline-flex items-center gap-1">
    <input type="number" min="0" step="1" inputmode="numeric" :placeholder="placeholder" :title="title || undefined" :value="shown" class="w-20 rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-right" @input="onInput" />
    <select v-model="unit" class="rounded border border-white/15 bg-black/30 px-1 py-0.5" title="単位 (高貴 / カオス / 神)">
      <option v-for="x in UNITS" :key="x.k" :value="x.k">{{ x.ja }}</option>
    </select>
  </span>
</template>
