<!--
  GearGrid.vue — 装備の部位を絵で選ぶ (2026-09-29、スロットのタブの代わり)
  部位ごとに一番多いユニーク (ユニークの絵・橙) と一番多いレアのベース (ベースの絵・黄) と、よく付いている MOD を 2 つ。
  クリックでその部位の MOD 一覧へ。スキル・持ち物は上の切り替えタブ (前はここのマスの 1 つだった)。
-->
<script setup lang="ts">
import type { AggregatedAscendancy, ModEntry, SlotKey } from "../../services/craft-v2/types";
import { SLOT_TABS } from "../../views/craft-v2/helpers";
import { uniqueArt } from "../../services/assets/unique-art";
import { baseArt } from "../../services/craft-stage/base-art";

const props = defineProps<{ agg: AggregatedAscendancy }>();
const activeSlot = defineModel<SlotKey>("activeSlot", { required: true });

interface Face { art: string | null; name: string; count: number; kind: "unique" | "rare" }
/** その部位で一番多いユニークとレアのベース (人数の多い方を大きく) */
function facesOf(slot: SlotKey): Face[] {
  const u = props.agg.uniquesBySlot?.[slot]?.[0];
  const b = props.agg[slot].bases[0];
  const out: Face[] = [];
  if (u) out.push({ art: uniqueArt(u.nameEn) ?? u.icon ?? null, name: u.name, count: u.count, kind: "unique" });
  if (b) out.push({ art: baseArt(b.nameEn), name: b.name, count: b.count, kind: "rare" });
  return out.sort((x, y) => y.count - x.count);
}
/** レアによく付いている MOD (人数の多い順に 2 つ) */
function topMods(slot: SlotKey): ModEntry[] {
  return [...props.agg[slot].prefix, ...props.agg[slot].suffix].sort((a, b) => b.count - a.count).slice(0, 2);
}
</script>

<template>
  <div class="mb-4 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,190px),1fr))]">
    <button
      v-for="t in SLOT_TABS"
      :key="t.key"
      type="button"
      class="flex flex-col rounded-lg border bg-black/25 p-2 text-left transition hover:border-white/30 hover:bg-white/[0.04]"
      :class="activeSlot === t.key ? 'border-white/60 ring-1 ring-white/40' : 'border-white/10'"
      @click="activeSlot = t.key"
    >
      <span class="text-[11px] font-bold tracking-wider text-white/55">{{ t.label }}</span>
      <template v-for="(f, i) in facesOf(t.key)" :key="f.kind">
        <span class="mt-1 flex items-center gap-2" :class="i > 0 ? 'opacity-70' : ''">
          <span class="shrink-0 overflow-hidden rounded bg-black/40 p-0.5" :class="i === 0 ? 'h-14 w-14' : 'h-8 w-8'">
            <img v-if="f.art" :src="f.art" :alt="f.name" class="h-full w-full object-contain" loading="lazy" referrerpolicy="no-referrer" />
          </span>
          <span class="min-w-0">
            <span class="block truncate" :class="[f.kind === 'unique' ? 'text-rarity-unique' : 'text-rarity-rare', i === 0 ? 'text-[13px]' : 'text-[11px]']" :title="f.name">{{ f.name }}</span>
            <span class="block text-[10px] tabular-nums text-white/45">{{ f.kind === "unique" ? "ユニーク" : "レア" }} {{ f.count }}/{{ agg.sampleSize }} 人</span>
          </span>
        </span>
      </template>
      <span v-if="!facesOf(t.key).length" class="mt-2 text-[11px] text-white/35">データなし</span>
      <!-- よく付いている MOD (押さなくても中身の見当が付くように) -->
      <span v-for="m in topMods(t.key)" :key="m.rawTemplate + m.affix" class="mt-1 block truncate text-[10px] text-rarity-magic/90" :title="m.text"
        >{{ m.text }} <span v-if="m.usageTier ?? m.inferredTier" class="tabular-nums text-[var(--exile-color-accent-focus)]">T{{ m.usageTier ?? m.inferredTier }}</span> <span class="tabular-nums text-white/40">{{ m.count }}</span></span
      >
    </button>
  </div>
</template>
