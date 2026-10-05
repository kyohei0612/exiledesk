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
import { ESSENCE_KIND, essenceKindOf } from "../../services/mods/essence-kind";

const s = craftStage;

type Kind = "fracture" | "normal" | "desecrated" | "essence" | "perfect_essence";
/** 札 (MOD 解析と同じ色。フラクチャーは 🔒 固定済みに合わせる) */
const KINDS: Record<Kind, { label: string; cls: string }> = {
  fracture: { label: "🔒 フラクチャー", cls: "border-white/40 text-white" },
  normal: { label: "クラフトで付く", cls: "border-emerald-400/60 text-emerald-200" },
  desecrated: { label: "冒涜", cls: "border-violet-400/60 text-violet-200" },
  essence: { label: ESSENCE_KIND.essence.short, cls: "border-sky-400/60 text-sky-200" },
  perfect_essence: { label: ESSENCE_KIND.perfect_essence.short, cls: "border-indigo-400/60 text-indigo-200" },
};

const rows = computed(() => {
  const d = s.data.value;
  if (!d) return [];
  let n = 0;
  return s.simTargets.value.flatMap((t) => {
    const m = d.mods.get(t.modId);
    const kind: Kind = t.method === "fracture" ? "fracture"
      : m?.source === "desecrated" || t.method === "desecrate" ? "desecrated"
      : m && CRAFTED_SOURCES.has(m.source) ? essenceKindOf(m) ?? "perfect_essence" : "normal";
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
    const need = Math.max(1, Math.min(t.need ?? 1, 1 + (t.alts?.length ?? 0)));
    return [{ ...row(t, false), need }, ...(t.alts ?? []).map((a) => ({ ...row(a, true), need }))];
  });
});
/**
 * 1 つの枠を争う物はグループにまとめる (2026-10-05 オーナー「そのうちどれかの場合グループでまとめたい。2 MOD とか複数ある時分かりづらい」)。
 * グループ = フラクチャーの候補全部 / ② の手順 (本体 + あるいは)。2 つ以上の時だけ枠で囲んで「どれか 1 つ」
 */
type Row = (typeof rows.value)[number];
const columns = computed(() => (["P", "S"] as const).map((side) => {
  const list = rows.value.filter((r) => r.side === side);
  const groups: Array<{ key: string; no: number | null; kind: Kind; host: string; need: number; members: Row[] }> = [];
  for (const r of list) {
    const key = r.kind === "fracture" ? "fracture" : r.group;
    const g = groups.find((x) => x.key === key);
    if (g) g.members.push(r);
    else groups.push({ key, no: r.no, kind: r.kind, host: r.group, need: r.kind === "fracture" ? 1 : r.need, members: [r] });
  }
  // どれか N つは N 枠 (フラクチャーの候補は 1 枠)
  return { title: side === "P" ? "プレフィックス" : "サフィックス", groups, used: groups.reduce((a, g) => a + g.need, 0) };
}));
</script>

<template>
  <div v-if="rows.length" class="grid min-w-0 flex-1 gap-x-6 gap-y-1 text-[12px] md:grid-cols-2">
    <div v-for="col in columns" :key="col.title" class="min-w-0">
      <p class="mb-0.5 border-b border-white/10 pb-0.5 text-[11px] font-bold opacity-70">{{ col.title }} ({{ col.used }}/3)</p>
      <p v-if="!col.groups.length" class="opacity-40">なし</p>
      <div v-for="g in col.groups" :key="g.key" class="flex items-start gap-1.5 py-px">
        <span class="w-4 shrink-0 pt-px text-right font-bold text-amber-200">{{ g.no ?? "" }}</span>
        <span class="shrink-0 rounded border px-1 text-[10px]" :class="KINDS[g.kind].cls">{{ KINDS[g.kind].label }}</span>
        <!-- 2 つ以上は枠で囲んで「どれか 1 つ」 -->
        <div class="min-w-0 flex-1" :class="g.members.length > 1 ? 'rounded border border-dashed border-amber-400/50 bg-amber-500/[0.06] px-1.5 py-0.5' : ''">
          <!-- 2 つ以上は横に並べて折り返す (縦に積むと太くなる、2026-10-05 オーナー) -->
          <div v-if="g.members.length > 1" class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span class="text-[10px] font-bold text-amber-200">どれか {{ g.need }} つ:</span>
            <span v-for="r in g.members" :key="r.modId" class="inline-flex max-w-full items-center gap-1 rounded bg-black/30 px-1">
              <span class="truncate" :title="r.text">{{ r.text }}</span>
              <span class="shrink-0 rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ r.rank }}</span>
            </span>
            <button v-if="s.simShowMods.value && (g.kind === 'normal' || g.kind === 'desecrated')" type="button" class="shrink-0 rounded border border-amber-400/40 px-1 text-[11px] leading-none text-amber-200 hover:bg-amber-500/15" title="あるいは (この MOD の代わりに付いても当たりにする MOD を選ぶ)" @click="s.simAltFor.value = g.host">＋</button>
          </div>
          <div v-else class="flex items-center gap-1.5">
            <!-- 「＋」は MOD の名前のすぐ横 (2026-10-05 オーナー) -->
            <span class="min-w-0 truncate" :title="g.members[0]!.text">{{ g.members[0]!.text }}</span>
            <button v-if="s.simShowMods.value && (g.kind === 'normal' || g.kind === 'desecrated')" type="button" class="shrink-0 rounded border border-amber-400/40 px-1 text-[11px] leading-none text-amber-200 hover:bg-amber-500/15" title="あるいは (この MOD の代わりに付いても当たりにする MOD を選ぶ)" @click="s.simAltFor.value = g.host">＋</button>
            <span class="ml-auto shrink-0 rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ g.members[0]!.rank }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
