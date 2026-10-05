<!--
  StageTargetSummary.vue — シミュレーションの ① 狙う MOD (完成図) (2026-10-05)

  オーナー「付く MOD 選んだ時の UI が分かりづらい、MOD 解析と同じ表示の仕方させるか」→
  「狙う MOD がシミュレーションの枠に入っていて、その下の枠にまた MOD 選択枠があって分かれているのかと思う。枠は一緒の枠で、
  ベースの所に出している表示を ① の MOD の所でするべきで、ベースには非表示でいい。そこに付きやすさの % も出そう、T2 以上なら確率が上がる」。
  クラフト計算機の MOD 解析 ([[ModBreakdown.vue]]) と同じく、左にプレ・右にサフィ、種類の札 + 文 + 段。番号は付ける順番。
  editable の時は ① で選んでいる間: 段のプルダウン・＋ (あるいは)・× (外す)・どれか N つ。
  付きやすさ = その段以上の重み ÷ 同じ側の全部の重み (このアイテムレベルで出る段、普通の MOD は差したルーンの MOD 込み、冒涜は冒涜の置き場)。
  同じ系統の除外は見ない目安。エッセンスは確定なので出さない
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage } from "../../state/craft-stage";
import { fillHashes, jaOfMod } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { ESSENCE_KIND, essenceKindOf } from "../../services/mods/essence-kind";
import { effectiveCls } from "../../services/craft-stage/stage-core";

const props = defineProps<{ /** ① で選んでいる間 (段・＋・×・どれか N つを出す) */ editable?: boolean }>();
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

/** 付きやすさ (その段以上が、同じ側の 1 回の抽選で出る割合) */
function shareOf(modId: string, minTierIndex: number): number | null {
  const d = s.data.value, it = s.item.value;
  const m = d?.mods.get(modId);
  if (!d || !it || !m || CRAFTED_SOURCES.has(m.source)) return null;
  const pools = effectiveCls(it).pools;
  const pool = m.source === "desecrated" ? pools.desecrated : pools.normal;
  const ids = m.type === "suffix" ? pool?.suffixes : pool?.prefixes;
  if (!ids?.length) return null;
  const lv = s.itemLevel.value;
  const w = (id: string, min: number): number => (d.mods.get(id)?.tiers ?? []).reduce((a, t, i) => a + (i >= min && t.ilvl <= lv ? t.weight : 0), 0);
  const total = ids.reduce((a, id) => a + w(id, 0), 0);
  return total > 0 ? w(modId, minTierIndex) / total : null;
}
const pct = (x: number): string => (x >= 0.1 ? `${(x * 100).toFixed(0)}%` : x >= 0.001 ? `${(x * 100).toFixed(1)}%` : "<0.1%");

/** 段のプルダウン (このアイテムレベルで届く段、良い順) */
function tierOptions(modId: string): Array<{ i: number; label: string }> {
  const m = s.data.value?.mods.get(modId);
  if (!m) return [];
  return m.tiers.map((t, i) => ({ i, ilvl: t.ilvl, label: `T${m.tiers.length - i} 以上` })).filter((x) => x.ilvl <= s.itemLevel.value).reverse();
}

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
        modId: x.modId, minTierIndex: x.minTierIndex, kind, no: alt ? null : no, alt, group: t.modId,
        side: (xm ?? m)?.type === "suffix" ? "S" : "P",
        text: xm ? fillHashes(jaOfMod(xm), xt ? tierDisplayRanges(xt) : []).replace(/\n/g, " / ") : x.modId,
        rank: xm ? `T${xm.tiers.length - x.minTierIndex} 以上` : "",
        share: shareOf(x.modId, x.minTierIndex),
      };
    };
    const need = Math.max(1, Math.min(t.need ?? 1, 1 + (t.alts?.length ?? 0)));
    return [{ ...row(t, false), need }, ...(t.alts ?? []).map((a) => ({ ...row(a, true), need }))];
  });
});
type Row = (typeof rows.value)[number];

/** 外す: あるいはの候補はその候補だけ、本体は手順ごと (候補も一緒に) */
function drop(r: Row): void {
  if (r.alt) s.simTargets.value = s.simTargets.value.map((t) => (t.modId === r.group ? { ...t, alts: (t.alts ?? []).filter((a) => a.modId !== r.modId) } : t));
  else s.simTargets.value = s.simTargets.value.filter((t) => t.modId !== r.modId);
}
function setTier(r: Row, idx: number): void {
  s.simTargets.value = s.simTargets.value.map((t) => (t.modId !== r.group ? t
    : !r.alt ? { ...t, minTierIndex: idx } : { ...t, alts: (t.alts ?? []).map((a) => (a.modId === r.modId ? { ...a, minTierIndex: idx } : a)) }));
}
function setNeed(host: string, n: number): void {
  s.simTargets.value = s.simTargets.value.map((t) => (t.modId === host ? { ...t, need: n } : t));
}

/**
 * 1 つの枠を争う物はグループにまとめる (フラクチャーの候補全部 / 手順の本体 + あるいは)。2 つ以上の時だけ点線の枠で「どれか N つ」。
 * どれか N つは N 枠、フラクチャーの候補は 1 枠。グループの付きやすさは候補の合計
 */
const columns = computed(() => (["P", "S"] as const).map((side) => {
  const list = rows.value.filter((r) => r.side === side);
  const groups: Array<{ key: string; no: number | null; kind: Kind; host: string; need: number; members: Row[]; share: number | null }> = [];
  for (const r of list) {
    const key = r.kind === "fracture" ? "fracture" : r.group;
    const g = groups.find((x) => x.key === key);
    if (g) g.members.push(r);
    else groups.push({ key, no: r.no, kind: r.kind, host: r.group, need: r.kind === "fracture" ? 1 : r.need, members: [r], share: null });
  }
  for (const g of groups) g.share = g.members.every((m) => m.share == null) ? null : Math.min(1, g.members.reduce((a, m) => a + (m.share ?? 0), 0));
  const used = groups.reduce((a, g) => a + g.need, 0);
  return { title: side === "P" ? "プレフィックス" : "サフィックス", groups, used };
}));
const canAlt = (k: Kind): boolean => k === "normal" || k === "desecrated";
</script>

<template>
  <div class="grid min-w-0 gap-x-6 gap-y-1 text-[12px] md:grid-cols-2">
    <div v-for="col in columns" :key="col.title" class="min-w-0">
      <p class="mb-0.5 border-b border-white/10 pb-0.5 text-[11px] font-bold" :class="col.used > 3 ? 'text-rose-300' : 'opacity-70'">
        {{ col.title }} ({{ col.used }}/3)<span v-if="col.used > 3" class="ml-1 font-normal">枠が足りない</span>
      </p>
      <p v-if="!col.groups.length" class="py-0.5 opacity-40">{{ props.editable ? "下の一覧の「T○ 以上」で足す" : "なし" }}</p>
      <div v-for="g in col.groups" :key="g.key" class="flex items-start gap-1.5 py-0.5">
        <span class="w-4 shrink-0 pt-px text-right font-bold text-amber-200">{{ g.no ?? "" }}</span>
        <span class="shrink-0 rounded border px-1 text-[10px]" :class="KINDS[g.kind].cls">{{ KINDS[g.kind].label }}</span>
        <div class="min-w-0 flex-1" :class="g.members.length > 1 ? 'rounded border border-dashed border-amber-400/50 bg-amber-500/[0.06] px-1.5 py-0.5' : ''">
          <!-- 2 つ以上: 見出し (どれか N つ・合計の付きやすさ) と、横に並べて折り返す候補 -->
          <p v-if="g.members.length > 1" class="mb-0.5 flex flex-wrap items-center gap-1 text-[10px] font-bold text-amber-200">
            どれか
            <template v-if="props.editable && g.kind !== 'fracture'">
              <button v-for="n in g.members.length" :key="n" type="button" class="rounded px-1 leading-tight" :class="g.need === n ? 'bg-amber-500/40 text-amber-50 ring-1 ring-amber-300' : 'border border-amber-400/30 opacity-70 hover:opacity-100'" :title="`候補のうち ${n} つ付けば当たり (枠を ${n} つ使う)`" @click="setNeed(g.host, n)">{{ n }}</button>
            </template>
            <template v-else>{{ g.need }}</template>
            つ<template v-if="g.kind === 'desecrated' && g.need > 1"> (冒涜で 1 つ、残り {{ g.need - 1 }} つは高貴)</template>
            <span v-if="g.share != null" class="ml-1 font-normal tabular-nums text-amber-100/80">付きやすさ 合計 {{ pct(g.share) }}</span>
          </p>
          <div :class="g.members.length > 1 ? 'flex flex-wrap items-center gap-x-1.5 gap-y-0.5' : 'flex items-center gap-1.5'">
            <span v-for="r in g.members" :key="r.modId" class="inline-flex min-w-0 max-w-full items-center gap-1" :class="g.members.length > 1 ? 'rounded bg-black/30 px-1' : ''">
              <span class="truncate" :title="r.text">{{ r.text }}</span>
              <select v-if="props.editable && tierOptions(r.modId).length > 1" class="shrink-0 rounded-sm bg-amber-500/25 px-0.5 text-[10px] font-bold text-amber-100" title="段を変える (その段以上が当たり)" :value="r.minTierIndex" @change="setTier(r, Number(($event.target as HTMLSelectElement).value))">
                <option v-for="o in tierOptions(r.modId)" :key="o.i" :value="o.i" class="bg-[#14120e]">{{ o.label }}</option>
              </select>
              <span v-else class="shrink-0 rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ r.rank }}</span>
              <span v-if="r.share != null" class="shrink-0 text-[10px] tabular-nums opacity-70" title="1 回の抽選でこの段以上が出る割合 (同じ側の重み)">{{ pct(r.share) }}</span>
              <button v-if="props.editable" type="button" class="shrink-0 px-0.5 text-[11px] leading-none opacity-50 hover:text-rose-300 hover:opacity-100" :title="r.alt ? 'この候補を外す' : 'この MOD を外す (あるいはの候補ごと)'" @click="drop(r)">×</button>
            </span>
            <!-- 「＋」は MOD のすぐ横 (2026-10-05 オーナー) -->
            <button v-if="props.editable && canAlt(g.kind)" type="button" class="shrink-0 rounded border border-amber-400/40 px-1 text-[11px] leading-none text-amber-200 hover:bg-amber-500/15" title="あるいは (この MOD の代わりに付いても当たりにする MOD を選ぶ)" @click="s.simAltFor.value = g.host">＋</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
