<!--
  PathPick.vue — シミュレーターの入口 ②③ (2026-10-22 オーナー「打つとお告げの欄が必ず出て、付く / 消える MOD を選ぶ。空打ちも」)。
  置き場はクラフト台の棚のお告げの欄の所 (CurrencyShelf の #held、HeldOmens の下)。行き先はエンジンの stepOutcomes そのまま。
  消える MOD が分かれる手 (カオス) は先に消える物、次に付く MOD と段を選ぶ。狙い以外は外れ MOD (札と色はツリーの外れ OUT_LOOK.junk)、付いた狙いはグレー
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import { modText, tr } from "../../../i18n/lang";
import { allMods, type StageMod } from "../../../services/craft-stage/engine";
import { pathAsk } from "../../../state/simulator/build-state";
import { useDismiss } from "../../../utils/use-dismiss";
import { OUT_LOOK } from "../tree/tree-names";
import { pathGroups, pathMiss, pathSearch, pickMiss, pickOutcome, targets } from "./use-build";
import { hitsTarget, type PickRow } from "../../../services/simulator/build/path-pick";

const panel = ref<HTMLElement | null>(null);
// 枠の外を押す・Esc で閉じる (打たない。2026-10-22 オーナー、全部の画面の決まり)
useDismiss(() => !!pathAsk.value && !pathSearch.value, [panel], () => { pathAsk.value = null; });
const gi = ref(0);
const query = ref("");
watch(pathGroups, () => { gi.value = 0; query.value = ""; pathMiss.value = ""; });
const group = computed(() => pathGroups.value?.[gi.value] ?? null);
const rows = computed(() => {
  const q = query.value.trim().toLowerCase();
  return (group.value?.rows ?? []).filter((r) => !q || r.added.some((m) => modText(m).toLowerCase().includes(q)));
});
const pct = (p: number): string => (p >= 0.1 ? `${(p * 100).toFixed(0)}%` : p >= 0.001 ? `${(p * 100).toFixed(1)}%` : `${(p * 100).toFixed(2)}%`);
const removedText = (ms: readonly StageMod[]): string => (ms.length ? ms.map((m) => modText(m)).join(" / ") : tr("消えない", "Nothing removed"));
/** もう付いている狙い (候補の行でもグレー) */
const heldTarget = (r: PickRow): boolean => !!s.item.value && r.added.some((m) => targets.value.some((t) => hitsTarget(m, t) && allMods(s.item.value!).some((x) => hitsTarget(x, t))));
const JUNK = OUT_LOOK.junk;
const canMiss = computed(() => (pathGroups.value ?? []).some((g) => g.rows.some((r) => r.tiers.some((t) => !t.hit))));
</script>

<template>
  <div v-if="pathAsk && pathGroups" ref="panel" data-path-pick class="mt-2 rounded-lg border border-[var(--exile-color-border-brass)]/50 bg-black/50 p-2 text-[13px]">
    <p class="mb-1.5 flex items-center gap-2">
      <b class="text-[var(--exile-color-text-title)]">{{ tr("付く MOD を選ぶ", "Choose the mod it adds") }}</b>
      <span class="min-w-0 flex-1 truncate text-[11px] opacity-60">{{ tr("乱数で引かずに、選んだ結果で打つ", "Uses the result you pick instead of a random roll") }}</span>
      <button type="button" class="g-plain px-1 opacity-60 hover:opacity-100" :title="tr('閉じる (Esc / 枠の外を押す)', 'Close (Esc / click outside)')" @click="pathAsk = null">×</button>
    </p>
    <!-- 消える MOD が分かれる手 (カオスなど): 先に消える物 -->
    <div v-if="pathGroups.length > 1" class="mb-2">
      <p class="mb-1 text-[12px] opacity-70">{{ tr("消える MOD", "Mod removed") }}</p>
      <div class="flex flex-wrap gap-1">
        <button v-for="(g, i) in pathGroups" :key="g.removedKey" type="button" data-path-remove class="g-plain rounded border px-2 py-1 text-left text-[12px] max-md:min-h-10" :class="gi === i ? 'border-[#c9a96a] bg-black/80' : 'border-white/10 bg-black/50 hover:border-white/30'" @click="gi = i">
          <span class="text-rose-200">− {{ g.removedKey === "void" ? tr("不成立 (変わらない)", "No effect") : removedText(g.removed) }}</span>
          <span class="ml-1 tabular-nums opacity-60">{{ pct(g.p) }}</span>
        </button>
      </div>
    </div>
    <div class="mb-1 flex items-center gap-2">
      <p class="flex-1 text-[12px] opacity-70">{{ tr("付く MOD (段を押すと打つ)", "Mod added (click a tier to use)") }}</p>
      <input v-if="(group?.rows.length ?? 0) > 8" v-model="query" type="search" class="h-7 w-40 rounded border border-white/15 bg-black/40 px-2 text-[12px] outline-none focus:border-amber-400/60" :placeholder="tr('MOD を探す', 'Search mods')" />
    </div>
    <div class="max-h-[300px] space-y-1 overflow-y-auto pr-1">
      <div v-for="r in rows" :key="r.key" data-path-row class="flex items-center gap-2 rounded border px-2 py-1" :class="[r.hit ? 'border-[#c9a96a]/70 bg-[#c9a96a]/10' : 'border-white/5 bg-black/40', heldTarget(r) ? 'opacity-40' : '']">
        <span v-if="r.added.length" class="w-5 shrink-0 text-[12px] font-bold" :class="r.added[0]!.side === 'prefix' ? 'text-[#e0846a]' : 'text-[#6aa8e8]'">{{ r.added[0]!.side === "prefix" ? "P" : "S" }}</span>
        <span class="min-w-0 flex-1 truncate text-[#c8c8ff]" :title="r.added.map((m) => modText(m)).join(' / ')">{{ r.added.length ? r.added.map((m) => modText(m)).join(" / ") : tr("何も付かない", "Nothing added") }}</span>
        <span v-if="r.hit" class="shrink-0 rounded-sm bg-[#c9a96a]/30 px-1 text-[10px] text-amber-100">{{ heldTarget(r) ? tr("付いた狙い", "Target (on)") : tr("狙い", "Target") }}</span>
        <span v-else-if="r.added.length" class="shrink-0 rounded-sm px-1 text-[10px]" :style="{ background: `rgba(${JUNK.c},0.22)`, color: `rgb(${JUNK.c})` }">{{ tr(`${JUNK.ja} MOD`, `${JUNK.en} mod`) }}</span>
        <span class="flex shrink-0 flex-wrap justify-end gap-1">
          <button v-for="t in r.tiers" :key="t.tierIndex + t.tierName" type="button" data-path-tier class="g-btn sm !min-h-0 !px-1.5 !py-0.5 tabular-nums max-md:!min-h-9" :class="r.hit && !t.hit ? 'opacity-60' : ''" :disabled="!!pathSearch" :title="t.hit ? tr(`この結果で打つ (出る割合 ${pct(t.p)})`, `Use with this result (chance ${pct(t.p)})`) : tr(`外れ MOD として打つ (出る割合 ${pct(t.p)})`, `Use as a miss mod (chance ${pct(t.p)})`)" @click="pickOutcome(t.outcome)">{{ t.tierName || tr("これ", "This") }} <span class="opacity-60">{{ pct(t.p) }}</span></button>
        </span>
      </div>
    </div>
    <div class="mt-2 flex items-center gap-2">
      <button type="button" data-path-miss class="g-btn sm max-md:min-h-10" :disabled="!canMiss || !!pathSearch" :title="tr('打ったが狙いは付かなかった 1 手 (外れ MOD が出る割合どおりに 1 つ付く)', 'A use that hits no target (one miss mod rolls at its normal chance)')" @click="pickMiss">{{ tr("空打ち (外れ)", "Miss (no target)") }}</button>
      <span v-if="pathSearch" class="text-[12px] opacity-80">{{ tr(`この結果になる手を探している… ${pathSearch.n.toLocaleString()}`, `Finding a roll with this result… ${pathSearch.n.toLocaleString()}`) }}</span>
    </div>
    <p v-if="pathMiss" class="mt-1.5 rounded border border-rose-400/50 bg-rose-500/15 px-2 py-1 text-center text-[12px] text-rose-200">{{ pathMiss }}</p>
  </div>
</template>
