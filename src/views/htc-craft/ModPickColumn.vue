<!--
  ModPickColumn.vue — 「ベースから選ぶ」の狙う MOD の 1 列 (プレ / サフィ) (2026-09-27)

  オーナー:「ベースで作る時の MOD の表示、DB みたいに普通の MOD、エッセンス、冒涜、変質とか分けて表示して欲しいな。
  今全部一緒でしょ。プレとサフィは分けて。あと色とか工夫して見やすくね」。
  列の中を種類ごとの見出しで分け、行の左端と札を種類の色にする (普通 = 緑 / エッセンス = 水色 / 冒涜 = 紫 / 異界 = 青緑)。
  冒涜の MOD は 1 つのアイテムに 1 つまで (異界の MOD も冒涜) なので、1 つ選ぶと他の冒涜は選べない。
-->
<script setup lang="ts">
import { computed } from "vue";
import type { ModGroup, ModRow, usePicker } from "./usePicker";

const props = defineProps<{
  title: string;
  rows: readonly ModRow[];
  /** 絞り込み (all = 全部) */
  filter: ModGroup | "all";
  count: number;
  limit: number;
  /** 冒涜の MOD をもう 1 つ選んでいる */
  desecTaken: boolean;
  pk: ReturnType<typeof usePicker>;
  named: (m: ModRow) => string;
  tierLabel: (m: ModRow, i: number) => string;
}>();
const emit = defineEmits<{ toggle: [m: ModRow] }>();

/** 種類ごとの見出し・色・説明 */
interface GroupStyle { label: string; how: string; head: string; bar: string; chip: string }
const GROUPS: Record<ModGroup, GroupStyle> = {
  normal: { label: "普通の MOD", how: "カオス・高貴で確率で狙う", head: "text-emerald-300", bar: "border-l-emerald-400/70", chip: "bg-emerald-500/15 text-emerald-200" },
  essence: { label: "エッセンス・合金", how: "パーフェクトエッセンス・合金で確定 (クラフト MOD は 1 つまで)", head: "text-sky-300", bar: "border-l-sky-400/70", chip: "bg-sky-500/15 text-sky-200" },
  desecrated: { label: "冒涜", how: "骨で冒涜して 3 択から (冒涜の MOD は 1 つまで)", head: "text-violet-300", bar: "border-l-violet-400/70", chip: "bg-violet-500/15 text-violet-200" },
  otherworldly: { label: "変質した鎖骨 (異界の MOD)", how: "変質した鎖骨の冒涜でだけ出る (冒涜の MOD として 1 つまで)", head: "text-teal-300", bar: "border-l-teal-400/70", chip: "bg-teal-500/15 text-teal-200" },
};
const ORDER: ModGroup[] = ["normal", "essence", "desecrated", "otherworldly"];

const groups = computed(() =>
  ORDER.filter((g) => props.filter === "all" || props.filter === g)
    .map((g) => ({ g, st: GROUPS[g], rows: props.rows.filter((r) => r.group === g) }))
    .filter((x) => x.rows.length),
);
const full = computed(() => props.count >= props.limit);
const isDesec = (m: ModRow): boolean => m.group === "desecrated" || m.group === "otherworldly";
/** 押せない理由 (入れた物は外せる) */
function blocked(m: ModRow): string | null {
  if (props.pk.isPicked(m.modId)) return null;
  if (full.value) return "枠がいっぱい";
  if (isDesec(m) && props.desecTaken) return "冒涜の MOD は 1 つまで";
  return null;
}
</script>

<template>
  <div>
    <p class="mb-1 flex items-center gap-2 border-b border-white/10 pb-1 font-bold">
      {{ title }}
      <span class="rounded-full px-1.5 text-[10.5px] font-normal" :class="full ? 'bg-amber-500/20 text-amber-200' : 'bg-white/5 opacity-70'">{{ count }} / {{ limit }} 枠</span>
    </p>
    <div class="max-h-[26rem] space-y-2 overflow-auto pr-1">
      <div v-for="x in groups" :key="x.g">
        <p class="sticky top-0 z-10 flex items-baseline gap-2 bg-[var(--exile-color-bg-canvas)]/95 py-0.5 text-[11px]">
          <b :class="x.st.head">{{ x.st.label }}</b>
          <span class="opacity-40">{{ x.rows.length }}</span>
          <span class="truncate text-[10px] opacity-50">{{ x.st.how }}</span>
        </p>
        <div class="space-y-0.5">
          <div
            v-for="m in x.rows"
            :key="m.modId"
            class="flex items-center gap-2 rounded-r-lg border-l-2 px-2 py-1"
            :class="[x.st.bar, pk.isPicked(m.modId) ? 'bg-amber-500/10 ring-1 ring-amber-400/40' : blocked(m) ? 'opacity-35' : 'cursor-pointer hover:bg-white/5']"
            :title="blocked(m) ?? ''"
            @click="!blocked(m) && emit('toggle', m)"
          >
            <span class="grid h-3.5 w-3.5 shrink-0 place-items-center rounded border text-[9px]" :class="pk.isPicked(m.modId) ? 'border-amber-400 bg-amber-400 text-black' : 'border-white/30'">{{ pk.isPicked(m.modId) ? "✓" : "" }}</span>
            <span class="min-w-0 flex-1">{{ named(m) }}</span>
            <span v-if="m.alloy" class="shrink-0 rounded px-1 text-[10px]" :class="x.st.chip">合金</span>
            <select
              v-if="pk.isPicked(m.modId)"
              class="shrink-0 rounded border border-white/20 bg-black/40 px-1 py-0.5"
              :value="pk.tierOf(m.modId)"
              @click.stop
              @change="pk.setTier(m.modId, Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="(_t, i) in m.tiers" :key="i" :value="i">{{ tierLabel(m, i) }}</option>
            </select>
          </div>
        </div>
      </div>
      <p v-if="!groups.length" class="py-2 text-center opacity-40">この種類の MOD はありません</p>
    </div>
  </div>
</template>
