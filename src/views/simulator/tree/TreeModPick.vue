<!--
  TreeModPick.vue — ツリーの右の欄: 木のベースの MOD から 1 つ選ぶ (2026-10-22 表面だけ)。
  当たり = 「この MOD の T 何以上」、フラクチャー = 「この MOD のこの段」。行はエンジンの MOD 一覧 (use-tree.ts の rows) そのまま
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTree, type ModRow } from "./use-tree";
import type { Aim } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import { jaTypeName } from "../../../i18n/item-names-ja";

/** title: 見出しを替える (メモの窓では「欲しい MOD を足す」)。autofocus: 開いたら探す欄に入る */
const props = defineProps<{ mode: "hit" | "start"; current: Aim | null; title?: string; autofocus?: boolean; embedded?: boolean }>();
const emit = defineEmits<{ pick: [aim: Aim]; close: [] }>();
const t = useTree();

const query = ref("");
const search = ref<HTMLInputElement | null>(null);
onMounted(() => { if (props.autofocus) search.value?.focus(); });
const open = ref<string | null>(props.current?.modId ?? null);
/**
 * 当たりは一般の MOD と冒涜専用 MOD (骨の手の当たり、10-22 オーナー「冒涜は冒涜で付与」)、始まりの MOD は創生の樹など (カレンシーでは付かない物) と
 * ルーンの MOD (付けるとエンジンの force がそのルーンを差す) も。普通の MOD が先 (10-22 靴・手袋を白紙から組んで、創生の樹が一番上に並び探しにくかった)
 */
const groups = computed(() => (props.mode === "hit" ? ["normal", "desecrated"] : ["normal", "essence", "special", "rune"]));
const sections = computed(() => {
  // 「移動速度」でも「移動スピード」(MOD の文) に当たる (10-22 白紙から組んで 0 件だった)
  const qs = [...new Set([query.value.trim().toLowerCase()].flatMap((q) => [q, q.replace(/速度/g, "スピード"), q.replace(/スピード/g, "速度")]))];
  const hit = (r: ModRow): boolean => qs.some((q) => !q || r.template.toLowerCase().includes(q) || r.text.toLowerCase().includes(q));
  return (["prefix", "suffix"] as const).map((side) => ({
    side,
    title: side === "prefix" ? tr("プレフィックス", "Prefixes") : tr("サフィックス", "Suffixes"),
    rows: t.rows.value.filter((r) => r.side === side && groups.value.includes(r.group) && hit(r))
      .sort((a, b) => groups.value.indexOf(a.group) - groups.value.indexOf(b.group) || b.share - a.share),
  }));
});
/**
 * 段の MOD と段の番号。同じ系統のまとめ行 (例「呪印スキルのレベル / 投射物スキルのレベル」) は段ごとに別の MOD なので、その段の modId と rank から
 * (前は並びの何番目を段にしていて、投射物の T2 を押すと呪印が付いた、10-22)
 */
const aimOf = (r: ModRow, tt: ModRow["tiers"][number]): Aim => ({ modId: tt.modId ?? r.id, tier: Number(tt.rank.slice(1)) });
const isCurrent = (r: ModRow, tt: ModRow["tiers"][number]): boolean => { const a = aimOf(r, tt); return props.current?.modId === a.modId && props.current.tier === a.tier; };
const tierLabel = (tier: number): string => (props.mode === "start" || tier === 1 ? `T${tier}` : tr(`T${tier} 以上`, `T${tier}+`));
</script>

<template>
  <div data-tree-mod-pick class="flex min-h-0 flex-col gap-2">
    <div class="flex items-center gap-2">
      <b class="flex-1 text-[14px]">{{ title ?? (mode === "hit" ? tr("付く MOD (当たり) を選ぶ", "Pick the mod to hit") : tr("始まりの MOD を足す", "Add a starting mod")) }}</b>
      <button v-if="!embedded" type="button" class="g-btn sm" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <p class="text-[12px] opacity-70">{{ tr(`${jaTypeName(t.doc.value.base)} (アイテムレベル ${t.doc.value.itemLevel})`, `${t.doc.value.base} (item level ${t.doc.value.itemLevel})`) }}</p>
    <input ref="search" v-model="query" type="search" class="h-8 w-full rounded-lg border border-white/15 bg-black/40 px-2 text-[13px] outline-none focus:border-amber-400/60" :placeholder="tr('MOD を探す', 'Search mods')" />
    <div class="min-h-0 flex-1 overflow-y-auto pr-1">
      <section v-for="sec in sections" :key="sec.side" class="mb-3">
        <p class="mb-1 text-[12px] font-bold text-[var(--exile-color-text-secondary)]">{{ sec.title }}</p>
        <div v-for="r in sec.rows" :key="r.id" class="mb-1 rounded-md bg-white/[0.04]">
          <button type="button" class="flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left" :aria-expanded="open === r.id" @click="open = open === r.id ? null : r.id">
            <span class="min-w-0 flex-1 truncate text-[13px] text-[#c8c8ff]" :title="r.text">{{ r.template }}</span>
            <span v-if="r.group === 'essence'" class="shrink-0 rounded-sm bg-sky-500/25 px-1 text-[10px] text-sky-100">{{ tr("エッセンス", "Essence") }}</span>
            <span v-else-if="r.group === 'special'" class="shrink-0 rounded-sm bg-teal-500/25 px-1 text-[10px] text-teal-100">{{ tr("創生の樹など", "Genesis Tree etc.") }}</span>
            <span v-else-if="r.group === 'rune'" class="max-w-[40%] shrink-0 truncate rounded-sm bg-violet-500/25 px-1 text-[10px] text-violet-100" :title="r.runeJa">{{ tr(`ルーン ${r.runeJa ?? ""}`, `Rune ${r.runeJa ?? ""}`) }}</span>
            <span class="shrink-0 rounded-sm bg-emerald-600/80 px-1 text-[11px] font-bold text-white">{{ r.tiers.length }}</span>
          </button>
          <div v-if="open === r.id" class="flex flex-wrap gap-1 px-2 pb-2">
            <button v-for="tt in r.tiers" :key="`${tt.modId ?? r.id}|${tt.rank}`" type="button" class="max-w-full truncate rounded-md border px-2 py-1 text-[12px]"
              :class="isCurrent(r, tt) ? 'border-amber-400/80 bg-amber-500/20 text-amber-100' : 'border-white/15 hover:border-amber-400/60'"
              :title="`${tt.text} (Lv ${tt.ilvl})`" @click="emit('pick', aimOf(r, tt))">{{ tierLabel(aimOf(r, tt).tier) }}{{ tt.modId ? ` ${tt.text}` : "" }}</button>
          </div>
        </div>
        <p v-if="!sec.rows.length" class="text-[12px] opacity-50">{{ tr("無し", "None") }}</p>
      </section>
    </div>
  </div>
</template>
