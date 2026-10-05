<!--
  StageTargetSummary.vue — シミュレーションで選んだ MOD (完成図) をベースの横に (2026-10-05)

  オーナー「付く MOD 選んだ時の UI が分かりづらい、選択したらどっかに表示させた方がいい。ベースの横に表示させるか。
  MOD 解析と同じ表示の仕方させるか」。クラフト計算機の MOD 解析 ([[ModBreakdown.vue]]) と同じく、左にプレ・右にサフィ、
  種類の札 + 文 + 段。札の色と名前は MOD 解析に合わせる。番号は ② の付ける順番
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage } from "../../state/craft-stage";
import { fillHashes, jaOfMod } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";

const s = craftStage;

type Kind = "fracture" | "normal" | "desecrated" | "essence";
/** 札 (MOD 解析と同じ色。フラクチャーは 🔒 固定済みに合わせる) */
const KINDS: Record<Kind, { label: string; cls: string }> = {
  fracture: { label: "🔒 フラクチャー", cls: "border-white/40 text-white" },
  normal: { label: "クラフトで付く", cls: "border-emerald-400/60 text-emerald-200" },
  desecrated: { label: "冒涜", cls: "border-violet-400/60 text-violet-200" },
  essence: { label: "エッセンス", cls: "border-sky-400/60 text-sky-200" },
};

const rows = computed(() => {
  const d = s.data.value;
  if (!d) return [];
  let n = 0;
  return s.simTargets.value.flatMap((t) => {
    const m = d.mods.get(t.modId);
    const kind: Kind = t.method === "fracture" ? "fracture"
      : m?.source === "desecrated" || t.method === "desecrate" ? "desecrated"
      : m && CRAFTED_SOURCES.has(m.source) ? "essence" : "normal";
    const no = t.method === "fracture" ? null : ++n;
    const row = (x: { modId: string; minTierIndex: number }, alt: boolean) => {
      const xm = d.mods.get(x.modId);
      const xt = xm?.tiers[x.minTierIndex];
      return {
        modId: x.modId, kind, no: alt ? null : no, alt, group: t.modId,
        side: (xm ?? m)?.type === "suffix" ? "S" : "P",
        text: xm ? fillHashes(jaOfMod(xm), xt ? tierDisplayRanges(xt) : []).replace(/\n/g, " / ") : x.modId,
        rank: xm ? `T${xm.tiers.length - x.minTierIndex} 以上` : "",
      };
    };
    return [row(t, false), ...(t.alts ?? []).map((a) => row(a, true))];
  });
});
/** フラクチャーの候補は「どれか 1 つ」なので枠は 1 つで数える */
const fractureMany = computed(() => rows.value.filter((r) => r.kind === "fracture").length >= 2);
const columns = computed(() => (["P", "S"] as const).map((side) => {
  const list = rows.value.filter((r) => r.side === side);
  // 「どれか」の候補は本体と同じ枠
  const used = list.filter((r) => r.kind !== "fracture" && !r.alt).length + (list.some((r) => r.kind === "fracture") ? 1 : 0);
  return { title: side === "P" ? "プレフィックス" : "サフィックス", list, used };
}));
</script>

<template>
  <div v-if="rows.length" class="grid min-w-0 flex-1 gap-x-6 gap-y-1 text-[12px] md:grid-cols-2">
    <div v-for="col in columns" :key="col.title" class="min-w-0">
      <p class="mb-0.5 border-b border-white/10 pb-0.5 text-[11px] font-bold opacity-70">{{ col.title }} ({{ col.used }}/3)</p>
      <p v-if="!col.list.length" class="opacity-40">なし</p>
      <div v-for="r in col.list" :key="r.modId" class="flex items-center gap-1.5 py-px">
        <span class="w-4 shrink-0 text-right font-bold text-amber-200">{{ r.no ?? "" }}</span>
        <span class="shrink-0 rounded border px-1 text-[10px]" :class="KINDS[r.kind].cls">{{ KINDS[r.kind].label }}<template v-if="(r.kind === 'fracture' && fractureMany) || r.alt || rows.some((x) => x.alt && x.group === r.modId)"> (どれか)</template></span>
        <span class="min-w-0 flex-1 truncate" :title="r.text">{{ r.text }}</span>
        <span class="shrink-0 rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ r.rank }}</span>
        <button v-if="s.simShowMods.value && !r.alt && (r.kind === 'normal' || r.kind === 'desecrated')" type="button" class="shrink-0 rounded border border-amber-400/40 px-1 text-[11px] leading-none text-amber-200 hover:bg-amber-500/15" title="あるいは (この MOD の代わりに付いても当たりにする MOD を選ぶ)" @click="s.simAltFor.value = r.modId">＋</button>
        <span v-else class="w-[18px] shrink-0" />
      </div>
    </div>
  </div>
</template>
