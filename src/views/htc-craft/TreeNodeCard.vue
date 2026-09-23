<script setup lang="ts">
/**
 * TreeNodeCard.vue — 作り方のツリーの手 1 つ (2026-09-24)
 *
 * 打つ物 (お告げ → 合うオーブ。その手に来た時の指輪で打てる物だけ) / 狙う MOD / ○の条件 / ○ と × の行き先 / 1 回で○になる確率。
 * 最初は何も入っていない (オーナー:「最初から入力はしない、考えてやらせる」)。中身は [[useCraftTree.ts]]。
 */
import { computed } from "vue";
import { CERTAIN, type Goto, type SimAction, type SimNode } from "../../services/htc/sim-route";
import type { Side } from "../../services/htc/step-odds";
import type { useCraftTree } from "./useCraftTree";
import ActionPicker from "./ActionPicker.vue";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft>; t: ReturnType<typeof useCraftTree>; node: SimNode; index: number }>();
const emit = defineEmits<{ (e: "focus", id: string): void }>();
const n = computed(() => props.node);
const state = computed(() => props.t.stateOf(n.value.id));
const h = computed(() => props.t.helpers.value);
const name = (id: string): string => (id === "__breach__" ? "ブリーチの MOD" : props.c.stepTarget([id]));

const why = computed(() => (h.value && n.value.action ? h.value.usable(state.value, n.value.action) : null));
const price = computed(() => (h.value && n.value.action && !why.value ? h.value.priceOf(state.value, n.value.action) : null));
const odds = computed(() => props.t.hitOdds(n.value));

/** 打つ物を選んだ。消去・光の手は、行き先が空なら「自動」を入れておく (消えた物を見て戻り先を決める) */
function onPick(a: SimAction | null): void {
  const cleanup = a?.kind === "annul" || a?.kind === "light";
  props.t.update(n.value.id, {
    action: a,
    ...(cleanup && !n.value.onHit ? { onHit: "auto" } : {}),
    ...(cleanup && !n.value.onMiss ? { onMiss: "auto" } : {}),
  });
}

/**
 * 狙う MOD の候補 = 作る MOD のうち、その手に来た時の指輪にまだ付いていない物 (固定済みを除く)。
 * 手を進めるごとに減る (オーナー 2026-09-24:「キャスピ最初に欲しい MOD に選んだら、それ以降の手でキャスピ出ることない」)。
 * その手で既にチェックしている物は外せるように残す
 */
const targetRows = computed(() => {
  const fixed = new Set(props.c.fracturedTargets.value.map((t) => t.modId));
  const held = new Set(state.value.slots.filter((x) => x.modId).map((x) => x.modId!));
  return props.c.targets.value.filter((t) => !fixed.has(t.modId) && (!held.has(t.modId) || n.value.targets.some((x) => x.modId === t.modId)));
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
    // ○の次の手は、同じ狙いを 1 つ多く (「知性か全耐性 1 つ」→「2 つとも」)。狙いが残っていなければ空のまま
    const need = (n.value.need ?? 1) + 1;
    if (which === "onHit" && n.value.targets.length >= need) {
      props.t.update(g, { targets: n.value.targets.map((x) => ({ ...x })), need, keep: props.t.nodes.value.find((x) => x.id === g)!.keep.filter((id) => !n.value.targets.some((x) => x.modId === id)) });
    }
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

    <!-- 打つ物: お告げを先に、合うオーブだけ後に ([[ActionPicker.vue]]) -->
    <ActionPicker :c="c" :t="t" :action="n.action" :state="state" :targets="n.targets" @change="onPick" />

    <!-- ○の条件 -->
    <div class="mb-1">
      <span class="opacity-60">狙う MOD</span>
      <select v-if="n.targets.length > 1" class="mx-1 rounded border border-white/20 bg-black/30 px-1" :value="n.need ?? 1"
        @change="t.update(n.id, { need: Number(($event.target as HTMLSelectElement).value) })">
        <option v-for="k in n.targets.length" :key="k" :value="k">{{ k === 1 ? "どれか 1 つ" : `${k} つ` }}</option>
      </select>
      <span class="opacity-60">:</span>
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
          <option value="auto">自動 (消えた物を見て戻る)</option>
          <option value="done">完成</option>
        </select>
        <span v-if="w === 'onMiss' && !n.onMiss && n.action && CERTAIN.has(n.action.kind)" class="opacity-60"> (確定の手なので空でよい)</span>
      </label>
    </div>
  </div>
</template>
