<!--
  TreeStartPick.vue — ツリーの右の欄: 始まりの形 (2026-10-22 オーナー「始まりの MOD を決めさせる、ほかは自由」。前はフラクチャー 1 つだけ)。
  レアリティ・始まりに付いている MOD (段は指名、✦ = フラクチャー、1 つまで)・乱数の MOD の数。フラクチャーがあればレア (エンジンの決まり 10-06)。
  付けるのはエンジンの force (ルーンの MOD はそのルーンを差して付く)。作れない時は見本の理由を出す
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import NumStep from "../../../components/NumStep.vue";
import { mulberry32 } from "../../../services/craft-stage/engine";
import { migrateStart, startOf, type Aim, type TreeStart } from "../../../services/simulator/tree/tree-model";
import { startItemOf } from "../../../services/simulator/tree/tree-sample";
import { craftStage as s } from "../../../state/craft-stage";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import TreeModPick from "./TreeModPick.vue";

const emit = defineEmits<{ close: [] }>();
const t = useTree();
const st = computed(() => startOf(t.doc.value));
const fractured = computed(() => st.value.mods.some((m) => m.fractured));

/** 始まりの形を書き換える (前の版の fracture は先に start へ移す。1 つ戻すで戻せる) */
function change(fn: (x: TreeStart) => void): void { t.edit((d) => { migrateStart(d); fn(d.start!); }); }
/** 同じ MOD は段だけ替える */
function add(a: Aim): void {
  change((x) => { const m = x.mods.find((y) => y.modId === a.modId); if (m) m.tier = a.tier; else x.mods.push({ modId: a.modId, tier: a.tier }); });
}
const remove = (i: number): void => change((x) => { x.mods.splice(i, 1); });
/** フラクチャーは 1 つまで (ゲームと同じ)。押した行に印を移す / もう一度で外す */
const toggleFracture = (i: number): void => change((x) => { const on = !x.mods[i]!.fractured; for (const m of x.mods) delete m.fractured; if (on) x.mods[i]!.fractured = true; });
const setRarity = (r: TreeStart["rarity"]): void => change((x) => { x.rarity = r; });

/** 乱数の MOD の数 (レアは素の高貴、マジックは増強。レアは 6 つまでなので 0〜5) */
const RANDOM_MAX = 5;
const rand = ref<number | null>(t.doc.value.startRandom ?? 0);
function setRand(v: number | null): void {
  rand.value = v === null ? null : Math.max(0, Math.min(RANDOM_MAX, Math.round(v)));
  if (rand.value !== null) t.setStartRandom(rand.value);
}
/** 見本の始めのアイテム。作れない時の理由 (エンジンの force の理由。枠が足りない・同じ系統など)・マジックの枠を超えてレアになった時 */
const made = computed(() => (s.data.value ? startItemOf(s.data.value, t.doc.value, mulberry32(1)) : null));
const problem = computed(() => made.value?.note ?? null);
const raised = computed(() => !problem.value && !fractured.value && st.value.rarity === "magic" && made.value?.item.rarity === "rare");
</script>

<template>
  <div data-tree-start-pick class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="flex items-center gap-2">
      <b class="flex-1 text-[14px]">{{ tr("始まりの形", "Starting item") }}</b>
      <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <div class="flex gap-2" role="tablist">
      <button v-for="r in (['rare', 'magic'] as const)" :key="r" type="button" role="tab" :data-tree-start-rarity="r" class="g-tab flex-1 !min-w-0 disabled:cursor-not-allowed disabled:opacity-50"
        :aria-selected="(fractured ? 'rare' : st.rarity) === r" :class="(fractured ? 'rare' : st.rarity) === r ? 'on' : ''" :disabled="fractured && r === 'magic'"
        :title="fractured && r === 'magic' ? tr('フラクチャーがあるとレア', 'A fractured item is Rare') : undefined" @click="setRarity(r)">{{ r === "rare" ? tr("レア", "Rare") : tr("マジック", "Magic") }}</button>
    </div>
    <ul class="flex flex-col gap-1">
      <li v-for="(m, i) in st.mods" :key="m.modId" data-tree-start-row class="flex min-w-0 items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-[13px]">
        <button type="button" data-tree-start-fracture class="shrink-0 rounded-sm border px-1 text-[11px]" :class="m.fractured ? 'border-amber-400/80 bg-amber-500/25 text-amber-100' : 'border-white/15 opacity-60 hover:opacity-100'"
          :title="m.fractured ? tr('フラクチャーを外す', 'Unfracture') : tr('この MOD をフラクチャーにする (1 つまで)', 'Make this the fractured mod (one only)')" @click="toggleFracture(i)">✦</button>
        <span class="min-w-0 flex-1 truncate text-[#c8c8ff]" :title="t.startModLabel(m)">{{ t.startModLabel(m) }}</span>
        <button type="button" class="shrink-0 px-1 opacity-60 hover:opacity-100" :title="tr('外す', 'Remove')" @click="remove(i)">×</button>
      </li>
      <li v-if="!st.mods.length" class="text-[12px] opacity-60">{{ tr("付いている MOD 無し (下の一覧から足す)", "No mods yet (add from the list below)") }}</li>
    </ul>
    <label class="flex items-center gap-2 text-[13px]" :title="tr('始まりの MOD のほかに乱数で付いている MOD の数 (レアは高貴、マジックは増強を n 回打った形)', 'Random mods besides the ones above (as if exalts, or augments on Magic, were used n times)')">
      <span class="flex-1">{{ tr("ほかに乱数の MOD", "Other random mods") }}</span>
      <NumStep data-tree-start-random :model-value="rand" integer width="w-20" :placeholder-value="0" @update:model-value="setRand" />
    </label>
    <p v-if="problem" data-tree-start-problem class="rounded-md border border-rose-400/50 bg-[#2a1416] px-2 py-1 text-[12px] text-rose-100">{{ tr(`この形は作れない: ${problem}`, `Can't make this: ${problem}`) }}</p>
    <p v-if="raised" data-tree-start-raised class="text-[12px] text-amber-200">{{ tr("マジックの枠 (プレ 1・サフィ 1) を超えるのでレアで始まる", "Over the Magic limit (1 prefix, 1 suffix), so it starts Rare") }}</p>
    <TreeModPick mode="start" :current="null" embedded :title="tr('始まりの MOD を足す', 'Add a starting mod')" @pick="add" />
  </div>
</template>
