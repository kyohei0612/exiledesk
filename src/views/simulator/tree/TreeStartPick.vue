<!--
  TreeStartPick.vue — ツリーの右の欄: 始まりの形 (2026-10-22 オーナー「始まりの MOD を決めさせる、ほかは自由」。前はフラクチャー 1 つだけ)。
  ツリーはフラクチャーの後だけを扱う (オーナー 10-22) ので、始まりはレア + 始まりに付いている MOD (段は指名、✦ = フラクチャー、1 つまで) + 差したルーン + 乱数の MOD の数。
  マジックの始まりは画面から外した (形の rarity は別軸のために残す)。付けるのはエンジンの force (ルーンの MOD はそのルーンを差して付く)。作れない時は見本の理由を出す
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import NumStep from "../../../components/NumStep.vue";
import { applyCurrency, freshItem, mulberry32, RUNES, runeEffectFor, socketCapOf } from "../../../services/craft-stage/engine";
import { migrateStart, startOf, type Aim, type TreeStart } from "../../../services/simulator/tree/tree-model";
import { startItemOf } from "../../../services/simulator/tree/tree-sample";
import { craftStage as s } from "../../../state/craft-stage";
import { nameOf, tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import TreeModPick from "./TreeModPick.vue";

const emit = defineEmits<{ close: [] }>();
const t = useTree();
const st = computed(() => startOf(t.doc.value));

/** 始まりの形を書き換える (前の版の fracture は先に start へ移す。画面で決めるのはレアだけ。1 つ戻すで戻せる) */
function change(fn: (x: TreeStart) => void): void { t.edit((d) => { migrateStart(d); d.start!.rarity = "rare"; fn(d.start!); }); }
/** 同じ MOD は段だけ替える */
function add(a: Aim): void {
  change((x) => { const m = x.mods.find((y) => y.modId === a.modId); if (m) m.tier = a.tier; else x.mods.push({ modId: a.modId, tier: a.tier }); });
}
const remove = (i: number): void => change((x) => { x.mods.splice(i, 1); });
/** フラクチャーは 1 つまで (ゲームと同じ)。押した行に印を移す / もう一度で外す */
const toggleFracture = (i: number): void => change((x) => { const on = !x.mods[i]!.fractured; for (const m of x.mods) delete m.fractured; if (on) x.mods[i]!.fractured = true; });

/** 差せるルーン (今のゲームに有るルーンのうち、このベースのレアに差せる物。ソウルコアなどは出さない) とソケットの上限 */
const fresh = computed(() => (s.data.value ? freshItem(s.data.value, t.doc.value.base, t.doc.value.itemLevel, "rare") : null));
const cap = computed(() => (fresh.value ? socketCapOf(fresh.value.base, fresh.value.cls.category) : 0));
const runeChoices = computed(() => {
  const d = s.data.value, it = fresh.value;
  if (!d || !it || !cap.value) return [];
  return Object.entries(RUNES).filter(([en, r]) => r.kind === "rune" && r.available !== false && applyCurrency(d, { ...it, sockets: 1 }, `rune:${en}`, mulberry32(1)).applied)
    .map(([en, r]) => ({ en, name: nameOf({ en, ja: r.ja }), effect: (() => { const e = runeEffectFor(r, it.cls.category); return e ? tr(e.ja, e.en) : ""; })() }));
});
const runeName = (en: string): string => runeChoices.value.find((r) => r.en === en)?.name ?? en;
const runes = computed(() => st.value.runes ?? []);
const addRune = (en: string): void => { if (en) change((x) => { x.runes = [...(x.runes ?? []), en]; }); };
const removeRune = (i: number): void => change((x) => { x.runes = (x.runes ?? []).filter((_, j) => j !== i); if (!x.runes.length) delete x.runes; });

/** 乱数の MOD の数 (素の高貴を n 回。レアは 6 つまでなので 0〜5) */
const RANDOM_MAX = 5;
const rand = ref<number | null>(t.doc.value.startRandom ?? 0);
function setRand(v: number | null): void {
  rand.value = v === null ? null : Math.max(0, Math.min(RANDOM_MAX, Math.round(v)));
  if (rand.value !== null) t.setStartRandom(rand.value);
}
/** 作れない時の理由 (エンジンの force・ルーンの理由。枠が足りない・同じ系統・ソケットが足りないなど) */
const problem = computed(() => (s.data.value ? startItemOf(s.data.value, t.doc.value, mulberry32(1)).note : null));
</script>

<template>
  <div data-tree-start-pick class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="flex items-center gap-2">
      <b class="flex-1 text-[14px]">{{ tr("始まりの形 (レア)", "Starting item (Rare)") }}</b>
      <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
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
    <!-- ルーン (ソケットの上限まで。セールの凱旋のサフィックス +1・コルの狩りのマークスマン MOD など) -->
    <div v-if="cap" data-tree-start-runes class="flex flex-col gap-1 text-[13px]">
      <div class="flex items-center gap-2">
        <span class="flex-1">{{ tr(`ルーン (${runes.length} / ${cap})`, `Runes (${runes.length} / ${cap})`) }}</span>
        <select v-if="runes.length < cap" data-tree-start-rune-add class="h-7 max-w-[60%] rounded-md border border-white/15 bg-black/40 px-1 text-[12px]" :value="''" @change="addRune(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
          <option value="">{{ tr("＋ ルーンを差す", "+ Socket a rune") }}</option>
          <option v-for="r in runeChoices" :key="r.en" :value="r.en">{{ r.name }}{{ r.effect ? ` — ${r.effect}` : "" }}</option>
        </select>
      </div>
      <div v-for="(en, i) in runes" :key="`${en}-${i}`" data-tree-start-rune class="flex min-w-0 items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1">
        <span class="min-w-0 flex-1 truncate text-violet-200" :title="en">{{ runeName(en) }}</span>
        <button type="button" class="shrink-0 px-1 opacity-60 hover:opacity-100" :title="tr('外す', 'Remove')" @click="removeRune(i)">×</button>
      </div>
    </div>
    <label class="flex items-center gap-2 text-[13px]" :title="tr('始まりの MOD のほかに乱数で付いている MOD の数 (素の高貴を n 回打った形)', 'Random mods besides the ones above (as if exalts were used n times)')">
      <span class="flex-1">{{ tr("ほかに乱数の MOD", "Other random mods") }}</span>
      <NumStep data-tree-start-random :model-value="rand" integer width="w-20" :placeholder-value="0" @update:model-value="setRand" />
    </label>
    <p v-if="problem" data-tree-start-problem class="rounded-md border border-rose-400/50 bg-[#2a1416] px-2 py-1 text-[12px] text-rose-100">{{ tr(`この形は作れない: ${problem}`, `Can't make this: ${problem}`) }}</p>
    <TreeModPick mode="start" :current="null" embedded :title="tr('始まりの MOD を足す', 'Add a starting mod')" @pick="add" />
  </div>
</template>
