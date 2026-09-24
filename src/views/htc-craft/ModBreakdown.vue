<script setup lang="ts">
/**
 * ModBreakdown.vue — MOD 解析の結果を種類ごと・プレ / サフィごとに (2026-09-24)
 *
 * オーナー:「MOD 解析の時、クラフト MOD や特殊な MOD、クラフト可能 MOD を分けて説明付きで表示欲しい。
 * あとプレフィックスとサフィックスで綺麗に並べたりして欲しい」。
 *   - 左にプレフィックス、右にサフィックス。各列の中は 特殊 (樹 MOD) → 特殊 (冒涜のみ) → 作れない → クラフトで付く → エッセンス の順
 *   - 種類の札の色と説明は上の凡例 (その貼り付けに出た種類だけ)
 *   - 段は ここで選び直せる (ツリーの手でも選び直せる)
 *   - 作れない行 (樹 MOD 以外でこのベースに付かない物) も枠を使うので列に入れる。暗黙は下に 1 行
 */
import { computed } from "vue";
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { jaOfPastedLine } from "../../services/htc/mod-text";
import { zeroStart } from "./craft-settings";
import { htcModSides } from "../../services/htc/patch";
import { matchKey } from "../../services/htc/bridge-index";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();
const c = props.c;

type Kind = "tree" | "normal" | "desecrated" | "essence" | "cannot";
/** 種類ごとの札・色・説明 */
const KINDS: Record<Kind, { label: string; cls: string; note: string }> = {
  tree: { label: "特殊 (樹 MOD)", cls: "border-fuchsia-400/60 text-fuchsia-200", note: "創生の樹からしか出ない。クラフトでは付かないので、固定済みの品を買って始める" },
  normal: { label: "クラフトで付く", cls: "border-emerald-400/60 text-emerald-200", note: "カオス・高貴で確率で狙う。重さ (出やすさ) で確率が決まる" },
  // オーナー 2026-09-24:「冒涜でしか付かない MOD なら同じように特殊 MOD 扱いがいい。冒涜でも普通の MOD なら無視で
  // クラフトで付く、みたいな表現でいい」(冒涜するかどうかは作り方で決める)
  desecrated: { label: "特殊 (冒涜のみ)", cls: "border-violet-400/60 text-violet-200", note: "冒涜 (鎖骨) でしか付かない MOD。冒涜するかは作り方で決める" },
  essence: { label: "エッセンスで確定", cls: "border-sky-400/60 text-sky-200", note: "パーフェクトエッセンスで確定で付けられる (クラフト MOD)。1 つのアイテムに 1 つまで" },
  cannot: { label: "作れない", cls: "border-rose-500/60 text-rose-300", note: "このベースのクラフトでは付かない (出どころがデータに無い)。付いている物を買うしかない。枠は使う" },
};
const ORDER: Kind[] = ["tree", "desecrated", "cannot", "normal", "essence"];

interface Row { key: string; text: string; side: "P" | "S" | null; kind: Kind; fixed: boolean; tier: string | null; modId: string | null }

const ja = (t: string): string => jaOfPastedLine(t) ?? t;
const fixedIds = computed(() => new Set(c.fracturedTargets.value.map((t) => t.modId)));
const kindOf = (modId: string): Kind => {
  const src = c.data.value?.mods.get(modId)?.source;
  if (src && CRAFTED_SOURCES.has(src)) return "essence";
  return src === "desecrated" ? "desecrated" : "normal";
};
/** 樹 MOD 以外で、このベースに付かない行 */
const cannotLines = computed(() => {
  const tree = new Set(c.dropOnly.value.map((d) => d.text));
  return c.skipped.value.filter((t) => !tree.has(t));
});
/** 貼り付けの行 → どちら側の枠か (クライアント由来の表) */
function sideOfLine(text: string): "P" | "S" | null {
  const line = c.item.value?.lines.find((l) => l.text === text);
  const v = line ? htcModSides()[matchKey(line.template)] : undefined;
  return v === "P" || v === "S" ? v : null;
}
const rows = computed<Row[]>(() => [
  ...c.dropOnly.value.map((d, i): Row => ({
    key: `tree-${i}`, text: ja(d.text), side: d.side ?? null, kind: "tree", fixed: true, modId: null,
    tier: d.tier ? `T${d.tier.of - d.tier.index} (${d.tier.min}-${d.tier.max})` : null,
  })),
  // 作れない行も枠を使うので列に入れる (2026-09-24 金の指輪: 冒涜のミニオンのクールダウンが列の外に出て「サフィ 2」に見えた)
  // 貼り付けで冒涜の印が付いていた行は、このベースの冒涜の一覧に無くても「冒涜のみ」の特殊として出す
  ...cannotLines.value.map((t, i): Row => {
    const desecrated = c.item.value?.lines.find((l) => l.text === t)?.kind === "desecrated";
    return { key: `cannot-${i}`, text: ja(t), side: sideOfLine(t), kind: desecrated ? "desecrated" : "cannot", fixed: false, modId: null, tier: null };
  }),
  ...c.rows.value.map((r): Row => ({
    key: r.modId, text: r.text, side: r.side, kind: kindOf(r.modId), fixed: fixedIds.value.has(r.modId), modId: r.modId, tier: null,
  })),
].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || Number(b.fixed) - Number(a.fixed)));
const columns = computed(() => [
  { title: "プレフィックス", list: rows.value.filter((r) => r.side === "P") },
  { title: "サフィックス", list: rows.value.filter((r) => r.side === "S") },
]);
const unknownSide = computed(() => rows.value.filter((r) => r.side == null));
/** 凡例は出た種類だけ */
const legend = computed(() => ORDER.filter((k) => rows.value.some((r) => r.kind === k)));

/** その MOD の段 (良い順、ilvl で付かない段は出さない) */
function tiersOf(modId: string): Array<{ i: number; label: string }> {
  const m = c.data.value?.mods.get(modId);
  const lv = c.item.value?.itemLevel ?? zeroStart.value.itemLevel;
  return (m?.tiers ?? []).map((t, i) => ({ i, ilvl: t.ilvl, label: `T${m!.tiers.length - i} 以上 (${(t.ranges ?? []).map((x) => `${x[0]}-${x[1]}`).join(" / ")})` }))
    .filter((t) => t.ilvl <= lv).reverse();
}
const tierOf = (modId: string): number => c.targets.value.find((t) => t.modId === modId)?.minTierIndex ?? 0;
</script>

<template>
  <section class="mb-2 rounded-lg border border-white/15 bg-white/[0.04] p-3 text-xs">
    <p class="mb-2 opacity-50">MOD 解析 ({{ rows.length }} 個。段はツリーの手でも選び直せる)</p>
    <!-- 凡例 -->
    <div class="mb-3 grid max-w-6xl gap-1 md:grid-cols-2">
      <p v-for="k in legend" :key="k" class="flex items-start gap-2">
        <span class="shrink-0 rounded border px-1" :class="KINDS[k].cls">{{ KINDS[k].label }}</span>
        <span class="opacity-60">{{ KINDS[k].note }}</span>
      </p>
      <p v-if="rows.some((r) => r.fixed && r.kind !== 'tree')" class="flex items-start gap-2">
        <span class="shrink-0 rounded border border-white/30 px-1">🔒 固定済み</span>
        <span class="opacity-60">貼ったアイテムでフラクチャーされていた MOD。消去でも消えない</span>
      </p>
    </div>
    <!-- プレ / サフィ -->
    <div class="grid max-w-6xl gap-x-8 gap-y-3 md:grid-cols-2">
      <div v-for="col in columns" :key="col.title">
        <p class="mb-1 border-b border-white/10 pb-0.5 font-bold opacity-80">{{ col.title }} ({{ col.list.length }})</p>
        <p v-if="!col.list.length" class="opacity-40">なし</p>
        <div v-for="r in col.list" :key="r.key" class="flex flex-wrap items-center gap-2 py-0.5">
          <span class="shrink-0 rounded border px-1 text-[11px]" :class="KINDS[r.kind].cls">{{ KINDS[r.kind].label }}</span>
          <span class="min-w-0 flex-1">{{ r.fixed && r.kind !== "tree" ? "🔒 " : "" }}{{ r.text }}</span>
          <span v-if="r.tier" class="opacity-60">{{ r.tier }}</span>
          <template v-else-if="r.modId">
            <select v-if="tiersOf(r.modId).length > 1" class="rounded border border-white/20 bg-black/30 px-1" :value="tierOf(r.modId)"
              @change="c.setTier(r.modId, Number(($event.target as HTMLSelectElement).value))">
              <option v-for="t in tiersOf(r.modId)" :key="t.i" :value="t.i">{{ t.label }}</option>
            </select>
            <span v-else class="opacity-50">段は 1 つ</span>
          </template>
        </div>
      </div>
    </div>
    <p v-if="unknownSide.length" class="mt-2 opacity-70">側が分からない: {{ unknownSide.map((r) => r.text).join(" / ") }}</p>
    <p v-if="c.implicits.value.length" class="mt-1 opacity-50">暗黙 (ベースに元から付いている、作る対象外): {{ c.implicits.value.map(ja).join(" / ") }}</p>
  </section>
</template>
