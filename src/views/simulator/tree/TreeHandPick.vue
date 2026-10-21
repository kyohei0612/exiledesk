<!--
  TreeHandPick.vue — ツリーの右の欄: 次に打つ手 (カレンシー + お告げ + 触媒のカタリスト) を選ぶ (2026-10-22 表面だけ、金の指輪で使う手だけ)。
  決めると矢印の先に結果の箱が出る (手の種類で必ず付く物。tree-model の OUTS_OF)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { CATALYSING, kindOfCurrency, nameOfKey, SIDE_OMENS, TREE_CATALYSTS, TREE_CURRENCIES, WHITTLING } from "../../../services/simulator/tree/tree-hands";
import type { Hand, HandKind } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ current: Hand | null }>();
const emit = defineEmits<{ pick: [hand: Hand, kind: HandKind]; clear: []; close: [] }>();

const currency = ref(props.current?.currency ?? "");
const kind = computed(() => kindOfCurrency(currency.value));
const sides = computed(() => SIDE_OMENS[kind.value]);
const side = ref<string | null>(props.current?.omens.find((o) => Object.values(SIDE_OMENS).some((p) => p?.includes(o))) ?? null);
const catalysing = ref(props.current?.omens.includes(CATALYSING) ?? false);
const whittling = ref(props.current?.omens.includes(WHITTLING) ?? false);
const catalyst = ref<string>(props.current?.catalyst ?? TREE_CATALYSTS[0]);
const quality = ref(props.current?.quality ?? 20);

const KIND_JA: Record<HandKind, [string, string]> = {
  add: ["当たり + 外れ", "Hit + Miss"], remove: ["外れが消えた + 狙いが消えた", "Miss removed + Target lost"], swap: ["当たり + 狙いが消えた + 外れ", "Hit + Target lost + Miss"],
};
const GROUPS: Array<{ title: [string, string]; kind: HandKind }> = [
  { title: ["カオス", "Chaos"], kind: "swap" }, { title: ["高貴", "Exalt"], kind: "add" }, { title: ["消去", "Annul"], kind: "remove" },
];

function choose(key: string): void {
  if (kindOfCurrency(key) !== kind.value) { side.value = null; catalysing.value = false; whittling.value = false; }
  currency.value = key;
}
const hand = computed((): Hand | null => {
  if (!currency.value) return null;
  const omens = [
    ...(sides.value && side.value && sides.value.includes(side.value) ? [side.value] : []),
    ...(kind.value === "add" && catalysing.value ? [CATALYSING] : []),
    ...(kind.value === "swap" && whittling.value ? [WHITTLING] : []),
  ];
  const cat = kind.value === "add" && catalysing.value;
  return { currency: currency.value, omens, catalyst: cat ? catalyst.value : null, quality: cat ? Math.max(1, Math.min(40, Math.round(quality.value) || 20)) : 0 };
});
function ok(): void { if (hand.value) emit("pick", hand.value, kind.value); }
</script>

<template>
  <div data-tree-hand-pick class="flex flex-col gap-3 text-[13px]">
    <div class="flex items-center gap-2">
      <b class="flex-1 text-[14px]">{{ tr("次に打つ手", "Next craft") }}</b>
      <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <div v-for="g in GROUPS" :key="g.kind">
      <p class="mb-1 text-[12px] font-bold text-[var(--exile-color-text-secondary)]">{{ tr(g.title[0], g.title[1]) }}</p>
      <div class="flex flex-wrap gap-1">
        <button v-for="c in TREE_CURRENCIES.filter((x) => x.kind === g.kind)" :key="c.key" type="button" class="rounded-md border px-2 py-1 text-[12px]"
          :class="currency === c.key ? 'border-amber-400/80 bg-amber-500/20 text-amber-100' : 'border-white/15 hover:border-amber-400/60'" :aria-pressed="currency === c.key" @click="choose(c.key)">{{ nameOfKey(c.key) }}</button>
      </div>
    </div>

    <div v-if="currency" class="flex flex-col gap-2 rounded-md bg-white/[0.04] p-2">
      <p class="text-[12px] font-bold text-[var(--exile-color-text-secondary)]">{{ tr("お告げ", "Omens") }}</p>
      <div v-if="sides" class="flex flex-wrap gap-1">
        <button type="button" class="rounded-md border px-2 py-1 text-[12px]" :class="!side ? 'border-amber-400/80 bg-amber-500/20' : 'border-white/15'" @click="side = null">{{ tr("側なし", "No side") }}</button>
        <button v-for="o in sides" :key="o" type="button" class="rounded-md border px-2 py-1 text-[12px]" :class="side === o ? 'border-amber-400/80 bg-amber-500/20 text-amber-100' : 'border-white/15'" @click="side = o">{{ nameOfKey(o) }}</button>
      </div>
      <label v-if="kind === 'add'" class="flex min-h-7 cursor-pointer items-center gap-2"><input v-model="catalysing" type="checkbox" />{{ nameOfKey(CATALYSING) }}</label>
      <div v-if="kind === 'add' && catalysing" class="flex flex-wrap items-center gap-2 pl-5">
        <select v-model="catalyst" class="h-8 rounded-md border border-white/15 bg-black/40 px-1">
          <option v-for="c in TREE_CATALYSTS" :key="c" :value="c">{{ nameOfKey(c) }}</option>
        </select>
        <span class="flex items-center gap-1">{{ tr("品質", "Quality") }}<input v-model.number="quality" type="number" min="1" max="40" class="h-8 w-14 rounded-md border border-white/15 bg-black/40 px-1 text-right" />%</span>
        <span class="w-full text-[11px] opacity-60">{{ tr("打つたびにこの品質まで上げ直す (触媒は 1 回で品質を使い切る)", "Re-raised to this quality every time (Catalysing uses up the quality)") }}</span>
      </div>
      <label v-if="kind === 'swap'" class="flex min-h-7 cursor-pointer items-center gap-2"><input v-model="whittling" type="checkbox" />{{ nameOfKey(WHITTLING) }}</label>
      <p v-if="kind === 'remove' && !sides" class="text-[12px] opacity-60">{{ tr("無し", "None") }}</p>
    </div>

    <p v-if="currency" class="text-[12px] opacity-70">{{ tr("結果の箱", "Result boxes") }}: {{ tr(KIND_JA[kind][0], KIND_JA[kind][1]) }}</p>
    <div class="flex flex-wrap gap-2">
      <button type="button" data-tree-hand-ok class="g-btn sm" :disabled="!hand" @click="ok">{{ current ? tr("この手に替える", "Use this craft") : tr("この手を打つ", "Add this craft") }}</button>
      <button v-if="current" type="button" class="g-btn sm" @click="emit('clear')">{{ tr("この手を消す (下も消える)", "Remove this craft (and below)") }}</button>
    </div>
  </div>
</template>
