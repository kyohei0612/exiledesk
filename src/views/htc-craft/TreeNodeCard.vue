<script setup lang="ts">
/**
 * TreeNodeCard.vue — 作り方のツリーの手 1 つ (2026-09-24)
 *
 * 打つ物 (その手に来た時の指輪で打てる物だけ) / 狙う MOD / ○の条件 / ○ と × の行き先 / 1 回で○になる確率。
 * 最初は何も入っていない (オーナー:「最初から入力はしない、考えてやらせる」)。中身は [[useCraftTree.ts]]。
 */
import { computed } from "vue";
import { catalystsFor } from "../../services/htc/quality";
import type { Goto, SimAction, SimNode } from "../../services/htc/sim-route";
import type { Side } from "../../services/htc/step-odds";
import { ACTION_KINDS, type useCraftTree } from "./useCraftTree";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft>; t: ReturnType<typeof useCraftTree>; node: SimNode; index: number }>();
const emit = defineEmits<{ (e: "focus", id: string): void }>();
const n = computed(() => props.node);
const state = computed(() => props.t.stateOf(n.value.id));
const h = computed(() => props.t.helpers.value);
const name = (id: string): string => (id === "__breach__" ? "ブリーチの MOD" : props.c.stepTarget([id]));
const SIDE_JA: Record<string, string> = { prefix: "プレ (左側のお告げ)", suffix: "サフィ (右側のお告げ)" };

/** 種類ごとの既定の中身 (種類を選んだ時に入れる) */
function defaultOf(kind: SimAction["kind"]): SimAction {
  const firstSide: Side = (props.c.data.value?.mods.get(n.value.targets[0]?.modId ?? "")?.type as Side) ?? "suffix";
  switch (kind) {
    case "chaos": return { kind, tier: "chaos" };
    case "exalt": return { kind, tier: "exalt_perfect", side: firstSide, catalyst: null };
    case "annul": return { kind, side: null };
    case "essence": return { kind, modId: essenceMods.value[0] ?? "" };
    case "desecrate": return { kind, side: firstSide, bone: "desecrate", echoes: false };
    default: return { kind } as SimAction;
  }
}
/** その手に来た時の指輪で打てる種類だけ (オーナー:「その状態で使えるカレンシーのみ表示」) */
const kinds = computed(() => ACTION_KINDS.filter((k) => {
  const x = h.value;
  if (!x) return false;
  if (k.kind === "essence") return essenceMods.value.some((id) => !x.usable(state.value, { kind: "essence", modId: id }));
  const variants: SimAction[] = k.kind === "exalt" ? [null, "prefix", "suffix"].map((sd) => ({ kind: "exalt", tier: "exalt", side: sd as Side | null, catalyst: null }))
    : k.kind === "annul" ? [null, "prefix", "suffix"].map((sd) => ({ kind: "annul", side: sd as Side | null }))
      : k.kind === "desecrate" ? (["prefix", "suffix"] as Side[]).map((sd) => ({ kind: "desecrate", side: sd, bone: "desecrate", echoes: false }))
        : [defaultOf(k.kind)];
  return variants.some((v) => !x.usable(state.value, v));
}));
/** このベースのパーフェクトエッセンスの MOD (狙いにある物) */
const essenceMods = computed(() => props.c.targets.value.map((t) => t.modId).filter((id) => props.c.data.value?.mods.get(id)?.source === "perfect_essence"));
/** 効くカタリスト (狙いのどれかに効く物) */
const catalysts = computed(() => {
  const d = props.c.data.value;
  const seen = new Map<string, { tag: string; ja: string }>();
  for (const t of n.value.targets) { const m = d?.mods.get(t.modId); if (m) for (const k of catalystsFor(m)) seen.set(k.tag, k); }
  return [...seen.values()];
});
const why = computed(() => (h.value && n.value.action ? h.value.usable(state.value, n.value.action) : null));
const price = computed(() => (h.value && n.value.action && !why.value ? h.value.priceOf(state.value, n.value.action) : null));
const odds = computed(() => props.t.hitOdds(n.value));

function setAction(patch: Partial<SimAction> | null, kind?: SimAction["kind"]): void {
  if (kind) { props.t.update(n.value.id, { action: defaultOf(kind) }); return; }
  if (!n.value.action || !patch) return;
  props.t.update(n.value.id, { action: { ...n.value.action, ...patch } as SimAction });
}

/** 狙う MOD の候補 = 作る MOD (固定済みを除く) */
const targetRows = computed(() => {
  const fixed = new Set(props.c.fracturedTargets.value.map((t) => t.modId));
  return props.c.targets.value.filter((t) => !fixed.has(t.modId));
});
function toggleTarget(modId: string, minTier: number, on: boolean): void {
  const ts = n.value.targets.filter((x) => x.modId !== modId);
  props.t.update(n.value.id, { targets: on ? [...ts, { modId, minTier }] : ts });
}
/** 残したい MOD の候補 = その手に来た時に付いている物 + 作る MOD */
const keepRows = computed(() => {
  const ids = new Set([...state.value.slots.filter((x) => !x.fixed && x.modId).map((x) => x.modId!), ...targetRows.value.map((t) => t.modId)]);
  return [...ids, ...(state.value.breach || n.value.keep.includes("__breach__") ? ["__breach__"] : [])];
});
function toggleKeep(id: string, on: boolean): void {
  props.t.update(n.value.id, { keep: on ? [...new Set([...n.value.keep, id])] : n.value.keep.filter((x) => x !== id) });
}

/** 行き先の選択肢: 既にある手 / 新しい手 / 完成 / 未設定 */
const gotoOptions = computed(() => props.t.nodes.value.map((x, i) => ({ value: x.id, label: `手 ${i + 1}` })));
function setGoto(which: "onHit" | "onMiss", v: string): void {
  let g: Goto = v === "" ? null : v;
  if (v === "__new__") {
    // 新しい手: 残したい MOD はその時付いている物。○の行き先なら、狙いのうちまだ無い物も付いた後の形で
    const want = which === "onHit" ? n.value.targets.find((x) => !state.value.slots.some((y) => y.modId === x.modId)) : undefined;
    const side = (props.c.data.value?.mods.get(want?.modId ?? "")?.type ?? "prefix") as Side;
    g = props.t.addNode(want ? { ...state.value, slots: [...state.value.slots, { modId: want.modId, side, fixed: false }] } : state.value);
  }
  props.t.update(n.value.id, { [which]: g });
  if (v === "__new__" && g) emit("focus", g);
}
const pct = (p: number): string => (p >= 0.995 ? "確定" : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`);
</script>

<template>
  <div class="rounded border border-white/15 bg-white/5 p-2 text-xs" :id="`node-${n.id}`">
    <div class="mb-1 flex items-center gap-2">
      <b class="text-sm">手 {{ index + 1 }}</b>
      <span v-if="odds != null" class="text-amber-300">1 回で○ {{ pct(odds) }}</span>
      <span v-if="price != null" class="opacity-70">/ 1 回 {{ c.money(price) }}</span>
      <span v-if="why" class="text-rose-300">打てない: {{ why }}</span>
      <button v-if="index > 0" type="button" class="ml-auto opacity-50 hover:opacity-100" @click="t.remove(n.id)">消す</button>
    </div>
    <!-- その手に来た時の指輪 -->
    <p class="mb-1 opacity-60">
      この時の指輪: {{ state.slots.map((x) => (x.fixed ? "🔒" : "") + (x.modId ? name(x.modId) : x.label ?? (x.desecrated ? "冒涜の外れ" : "外れ"))).join(" / ") || "何も無い" }}{{ state.breach ? " / ブリーチの MOD" : "" }}
    </p>

    <!-- 打つ物 -->
    <div class="mb-1 flex flex-wrap items-center gap-2">
      <select class="rounded border border-white/20 bg-black/30 px-1" :value="n.action?.kind ?? ''" @change="setAction(null, ($event.target as HTMLSelectElement).value as SimAction['kind'])">
        <option value="" disabled>打つ物を選ぶ</option>
        <option v-for="k in kinds" :key="k.kind" :value="k.kind">{{ k.ja }}</option>
      </select>
      <template v-if="n.action?.kind === 'chaos'">
        <select class="rounded border border-white/20 bg-black/30 px-1" :value="n.action.tier" @change="setAction({ tier: ($event.target as HTMLSelectElement).value as 'chaos' })">
          <option value="chaos">素</option><option value="chaos_greater">上級 (段 35 以上)</option><option value="chaos_perfect">完全 (段 50 以上)</option>
        </select>
      </template>
      <template v-if="n.action?.kind === 'exalt'">
        <select class="rounded border border-white/20 bg-black/30 px-1" :value="n.action.tier" @change="setAction({ tier: ($event.target as HTMLSelectElement).value as 'exalt' })">
          <option value="exalt">素</option><option value="exalt_greater">上級 (段 35 以上)</option><option value="exalt_perfect">完全 (段 50 以上)</option>
        </select>
        <select class="rounded border border-white/20 bg-black/30 px-1" :value="n.action.side ?? ''" @change="setAction({ side: (($event.target as HTMLSelectElement).value || null) as Side | null })">
          <option value="">側のお告げ無し</option><option value="prefix">{{ SIDE_JA.prefix }}</option><option value="suffix">{{ SIDE_JA.suffix }}</option>
        </select>
        <select class="rounded border border-white/20 bg-black/30 px-1" :value="n.action.catalyst ?? ''" @change="setAction({ catalyst: ($event.target as HTMLSelectElement).value || null })">
          <option value="">触媒の高貴のお告げ無し</option>
          <option v-for="k in catalysts" :key="k.tag" :value="k.tag">触媒の高貴のお告げ + {{ k.ja }}</option>
        </select>
      </template>
      <select v-if="n.action?.kind === 'annul'" class="rounded border border-white/20 bg-black/30 px-1" :value="n.action.side ?? ''" @change="setAction({ side: (($event.target as HTMLSelectElement).value || null) as Side | null })">
        <option value="">側のお告げ無し</option><option value="prefix">左側の消去のお告げ</option><option value="suffix">右側の消去のお告げ</option>
      </select>
      <select v-if="n.action?.kind === 'essence'" class="rounded border border-white/20 bg-black/30 px-1" :value="n.action.modId" @change="setAction({ modId: ($event.target as HTMLSelectElement).value })">
        <option v-for="id in essenceMods" :key="id" :value="id">{{ name(id) }}</option>
      </select>
      <template v-if="n.action?.kind === 'desecrate'">
        <select class="rounded border border-white/20 bg-black/30 px-1" :value="n.action.side" @change="setAction({ side: ($event.target as HTMLSelectElement).value as Side })">
          <option value="prefix">左手のネクロマンシーのお告げ</option><option value="suffix">右手のネクロマンシーのお告げ</option>
        </select>
        <select class="rounded border border-white/20 bg-black/30 px-1" :value="n.action.bone" @change="setAction({ bone: ($event.target as HTMLSelectElement).value as 'desecrate' })">
          <option value="desecrate">保存された鎖骨</option><option value="desecrate_ancient">古代の鎖骨 (段 40 以上)</option>
        </select>
        <label><input type="checkbox" :checked="n.action.echoes" @change="setAction({ echoes: ($event.target as HTMLInputElement).checked })" /> 反響のお告げ</label>
      </template>
    </div>

    <!-- ○の条件 -->
    <div class="mb-1">
      <span class="opacity-60">狙う MOD (どれか):</span>
      <label v-for="r in targetRows" :key="r.modId" class="ml-2 inline-block">
        <input type="checkbox" :checked="n.targets.some((x) => x.modId === r.modId)" @change="toggleTarget(r.modId, r.minTierIndex ?? 0, ($event.target as HTMLInputElement).checked)" />
        {{ name(r.modId) }}
      </label>
    </div>
    <div class="mb-1">
      <span class="opacity-60">残したい MOD (全部):</span>
      <label v-for="id in keepRows" :key="id" class="ml-2 inline-block">
        <input type="checkbox" :checked="n.keep.includes(id)" @change="toggleKeep(id, ($event.target as HTMLInputElement).checked)" /> {{ name(id) }}
      </label>
      <label class="ml-3 inline-block"><input type="checkbox" :checked="n.clean" @change="t.update(n.id, { clean: ($event.target as HTMLInputElement).checked })" /> 外れ無し</label>
      <label class="ml-3 inline-block">外せる MOD
        <input type="number" min="0" class="num w-10" :value="n.maxMods ?? ''" @change="t.update(n.id, { maxMods: ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value) })" /> 個以下
      </label>
    </div>

    <!-- 行き先 -->
    <div class="flex flex-wrap gap-3">
      <label v-for="w in (['onHit', 'onMiss'] as const)" :key="w">
        <b :class="w === 'onHit' ? 'text-emerald-300' : 'text-rose-300'">{{ w === "onHit" ? "○" : "×" }}</b> なら
        <select class="rounded border border-white/20 bg-black/30 px-1" :value="n[w] ?? ''" @change="setGoto(w, ($event.target as HTMLSelectElement).value)">
          <option value="">未設定</option>
          <option v-for="o in gotoOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          <option value="__new__">+ 新しい手</option>
          <option value="done">完成</option>
        </select>
      </label>
    </div>
  </div>
</template>
