<script setup lang="ts">
/**
 * TreeNodeCard.vue — 作り方のツリーの手 1 つ (2026-09-24)
 *
 * 上から: 何をする手か (1 行) / この時の指輪 / 打つ物 (お告げ → 合うオーブ) / 狙う MOD / ○・× の行き先 / 条件を足す (たたむ)。
 * 最初は何も入っていない (オーナー:「最初から入力はしない、考えてやらせる」)。中身は [[useCraftTree.ts]]。
 *
 * 2026-09-24 リリースに向けた見直し (オーナー:「1 手の中の表示がごちゃってて分かりづらい、何の作業してるか分かりづらい。
 * 残したい MOD とかよく分からん、ハズレ以外だろ残したいのなんて」):
 *   - 残したい MOD は画面から外した (本線の手は「上の手で揃えた物が全部まだある」を自動で○の条件にする。[[sim-route.ts]])
 *   - 頭に「何をする手か」を 1 行で出す。狙う MOD は押せる札。細かい条件はたたむ
 */
import { computed, ref } from "vue";
import { CERTAIN, type Goto, type SimAction, type SimNode } from "../../services/htc/sim-route";
import { CATALYSTS } from "../../services/htc/quality";
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
const pct = (p: number): string => (p >= 0.995 ? "確定" : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`);

const SIDE: Record<Side, string> = { prefix: "左側", suffix: "右側" };
const TIER: Record<string, string> = { chaos: "", chaos_greater: " (上級)", chaos_perfect: " (完全)", exalt: "", exalt_greater: " (上級)", exalt_perfect: " (完全)" };
const catJa = (tag: string | null): string => CATALYSTS.find((k) => k.tag === tag)?.ja ?? tag ?? "";
/** 打つ物を 1 行の言葉に */
function actionText(a: SimAction | null): string {
  if (!a) return "打つ物を選ぶ";
  switch (a.kind) {
    case "chaos": return `${a.side ? `${SIDE[a.side]}の抹消のお告げ + ` : ""}カオスオーブ${TIER[a.tier]}`;
    case "exalt": return [a.side ? `${SIDE[a.side]}の高貴なお告げ` : "", a.greater ? "偉大なる高貴のお告げ" : "", a.catalyst ? `触媒の高貴のお告げ (${catJa(a.catalyst)})` : "", `高貴なオーブ${TIER[a.tier]}`].filter(Boolean).join(" + ");
    case "annul": return `${a.side ? `${SIDE[a.side]}の消去のお告げ + ` : ""}消去のオーブ`;
    case "essence": return `${a.removeSide === "auto" ? "外れのある側" : SIDE[a.removeSide ?? (props.c.data.value?.mods.get(a.modId)?.type ?? "prefix") as Side]}の結晶化のお告げ + パーフェクトエッセンス`;
    case "breach": return `${SIDE[a.removeSide ?? "prefix"]}の結晶化のお告げ + ブリーチのエッセンス (品質の上限 +20%)`;
    case "desecrate": return `${a.side === "prefix" ? "左手" : "右手"}のネクロマンシーのお告げ${a.echoes ? " + 反響のお告げ" : ""} + ${a.bone === "desecrate_ancient" ? "古代の鎖骨" : "保存された鎖骨"}`;
    case "light": return "光のお告げ + 消去のオーブ (冒涜だけ消す)";
    case "whittle": return "削減のお告げ + カオスオーブ (一番レベルの低い MOD を消す)";
    case "check": return "確認だけ (打たない)";
    case "quality": return `${catJa(a.catalyst)}で品質を上限まで`;
  }
}
/** 何をする手か (打つ物 → 狙い) */
const headline = computed(() => {
  const a = n.value.action;
  const ts = n.value.targets;
  if (!a) return "打つ物を選ぶ";
  const aim = a.kind === "essence" ? name(a.modId)
    : ts.length ? `${ts.map((x) => name(x.modId)).join(" / ")}${ts.length > 1 ? ((n.value.need ?? 1) > 1 ? ` の ${n.value.need} つ` : " のどれか") : ""}`
      : a.kind === "annul" ? "外れを消す" : "";
  return aim ? `${actionText(a)} → ${aim}` : actionText(a);
});

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
 * 手を進めるごとに減る (オーナー:「キャスピ最初に欲しい MOD に選んだら、それ以降の手でキャスピ出ることない」)。
 * その手で既に選んでいる物は外せるように残す
 */
const targetRows = computed(() => {
  const fixed = new Set(props.c.fracturedTargets.value.map((t) => t.modId));
  const held = new Set(state.value.slots.filter((x) => x.modId).map((x) => x.modId!));
  return props.c.targets.value.filter((t) => !fixed.has(t.modId) && (!held.has(t.modId) || n.value.targets.some((x) => x.modId === t.modId)));
});
const aimed = (modId: string): boolean => n.value.targets.some((x) => x.modId === modId);
function toggleTarget(modId: string, minTier: number): void {
  const on = !aimed(modId);
  const ts = n.value.targets.filter((x) => x.modId !== modId);
  const next = on ? [...ts, { modId, minTier }] : ts;
  props.t.update(n.value.id, { targets: next, need: Math.min(n.value.need ?? 1, Math.max(1, next.length)) });
}

/**
 * 行き先の選択肢。2026-09-24 オーナー:「手を追加する際、プルダウンの中身おかしいよね、手 1 とかあんま選択肢ない」。
 * 全部の手を番号だけで並べていたのをやめて、意味で分ける:
 *   新しい手 / この手をもう一度 / 上の手へ戻る (手 1 からここまで通った手) / ほかの枝の手 (消去の手を共有する時など)。
 * 自分の枝の下の手は出さない (先回りになる)。今入っている行き先は必ず残す
 */
function gotoGroups(which: "onHit" | "onMiss") {
  const id = n.value.id;
  const opt = (x: string) => ({ value: x, label: `STEP ${props.t.indexOf(x) + 1}  ${props.t.labelOf(x)}` });
  const up = props.t.ancestors(id);
  const below = props.t.descendants(id);
  const current = n.value[which];
  const others = props.t.nodes.value.map((x) => x.id)
    .filter((x) => x !== id && !up.includes(x) && (!below.has(x) || x === current));
  return { up: up.map(opt), others: others.map(opt) };
}
function setGoto(which: "onHit" | "onMiss", v: string): void {
  let g: Goto = v === "" ? null : v;
  if (v === "__new__") {
    g = props.t.addNode(state.value);
    // ○の次の手は、同じ狙いを 1 つ多く (「知性か全耐性 1 つ」→「2 つとも」)。狙いが残っていなければ空のまま
    const need = (n.value.need ?? 1) + 1;
    if (which === "onHit" && n.value.targets.length >= need) props.t.update(g, { targets: n.value.targets.map((x) => ({ ...x })), need });
  }
  props.t.update(n.value.id, { [which]: g });
  if (v === "__new__" && g) emit("focus", g);
}
// 外れない STEP = 確定の手 (ブリーチ・品質など) と、狙いの無い手 (消去・削減など: 打てば必ず何かが起きる)
const certain = computed(() => !!n.value.action && (CERTAIN.has(n.value.action.kind) || n.value.targets.length === 0));
const hasExtra = computed(() => n.value.clean || n.value.maxMods != null);
/**
 * 畳む / 開く (2026-09-25 オーナー:「見やすく使いやすく」)。打つ物や行き先が決まっていない手は開いたまま、それ以外は
 * 畳んで 1 行に (何をする手か・当たり・値段・行き先)。押すと開いて直せる
 */
const needsAttention = computed(() => !n.value.action || !n.value.onHit || (!n.value.onMiss && !certain.value) || !!why.value);
const opened = ref<boolean | null>(null);
const open = computed(() => opened.value ?? needsAttention.value);
const gotoJa = (g: string | null | undefined, miss: boolean): string => {
  if (g == null) return miss && certain.value ? "外れない" : "まだ決めていない";
  if (g === n.value.id) return "もう一度打つ";
  if (g === "done") return "完成";
  if (g === "auto") return "自動で戻る";
  return `STEP ${props.t.indexOf(g) + 1} へ`;
};
</script>

<template>
  <div class="rounded-xl border bg-white/[0.04] text-xs transition" :class="open ? 'border-amber-500/40 p-3' : 'border-white/10 p-2 hover:border-white/25'" :id="`node-${n.id}`">
    <!-- 1 行目: 何をする手か (押すと開閉) -->
    <div class="flex items-start gap-2">
      <button type="button" class="flex flex-1 items-start gap-2 text-left" :title="open ? '畳む' : '開いて直す'" @click="opened = !open">
        <span class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold" :class="why ? 'bg-rose-500/80 text-black' : certain ? 'bg-sky-500/80 text-black' : 'bg-amber-500/80 text-black'">STEP {{ index + 1 }}</span>
        <b class="flex-1 text-[13px] leading-snug" :class="n.action ? '' : 'opacity-50'">{{ headline }}</b>
        <span class="shrink-0 opacity-40">{{ open ? "▴" : "▾" }}</span>
      </button>
      <button v-if="index > 0" type="button" class="shrink-0 opacity-40 hover:opacity-100" title="この STEP を消す" @click="t.remove(n.id)">✕</button>
    </div>
    <div class="mt-1 flex flex-wrap items-center gap-1.5 pl-9">
      <span v-if="odds != null" class="rounded-md px-1.5 py-0.5" :class="odds >= 0.995 ? 'bg-sky-500/15 text-sky-200' : 'bg-amber-500/15 text-amber-200'">1 回で○ {{ pct(odds) }}</span>
      <span v-if="price != null" class="rounded-md bg-white/5 px-1.5 py-0.5 opacity-80">1 回 {{ c.money(price) }}</span>
      <span v-if="why" class="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-rose-300" title="この STEP に来た時の状態では打てない。シミュレーターは × の先 (消去など) を先に通してから戻ります">この時点では打てない: {{ why }}</span>
      <template v-if="!open">
        <span class="rounded-md border border-emerald-500/40 px-1.5 py-0.5 text-emerald-200">○ → {{ gotoJa(n.onHit, false) }}</span>
        <span v-if="!(certain && n.onMiss == null)" class="rounded-md border border-rose-500/40 px-1.5 py-0.5 text-rose-200">× → {{ gotoJa(n.onMiss, true) }}</span>
      </template>
    </div>

    <template v-if="open">
      <!-- この時の指輪 -->
      <div class="mb-2 mt-2 flex flex-wrap items-center gap-1">
        <span class="opacity-50">この時:</span>
        <span v-for="(x, i) in state.slots" :key="i" class="rounded-md border px-1"
          :class="x.fixed ? 'border-white/10 opacity-60' : x.keep ? 'border-amber-500/40 text-amber-200/80' : x.modId ? 'border-emerald-500/40' : 'border-rose-500/40 text-rose-300'"
          :title="x.keep ? '固定されていない。カオス・消去・エッセンスで消えたら終わり (その回は止める)' : undefined">
          {{ x.fixed ? "🔒 " : x.keep ? "⚠ " : "" }}{{ x.modId ? name(x.modId) : x.label ?? (x.desecrated ? "冒涜の外れ" : "外れ") }}
        </span>
        <span v-if="state.breach" class="rounded-md border border-sky-500/40 px-1">ブリーチの MOD</span>
      </div>

      <!-- 打つ物 -->
      <ActionPicker :c="c" :t="t" :action="n.action" :state="state" :targets="n.targets" @change="onPick" />

      <!-- 狙う MOD (押して選ぶ) -->
      <div v-if="n.action && ['chaos', 'exalt', 'desecrate', 'whittle'].includes(n.action.kind)" class="mb-2 flex flex-wrap items-center gap-1">
        <span class="opacity-50">狙う:</span>
        <button v-for="r in targetRows" :key="r.modId" type="button" class="rounded-md border px-1.5 py-0.5"
          :class="aimed(r.modId) ? 'border-amber-400 bg-amber-500/15 text-amber-200' : 'border-white/15 opacity-70 hover:opacity-100'"
          @click="toggleTarget(r.modId, r.minTierIndex ?? 0)">{{ name(r.modId) }}</button>
        <select v-if="n.targets.length > 1" class="sel" :value="n.need ?? 1"
          @change="t.update(n.id, { need: Number(($event.target as HTMLSelectElement).value) })">
          <option v-for="k in n.targets.length" :key="k" :value="k">{{ k === 1 ? "どれか 1 つで○" : `${k} つ揃って○` }}</option>
        </select>
      </div>

      <!-- 行き先 -->
      <p class="mb-1 opacity-60">○ = 狙いが付いた時、× = 外れた時に、次に何をするか</p>
      <div class="flex flex-wrap gap-3">
        <label v-for="w in (['onHit', 'onMiss'] as const)" :key="w" class="flex items-center gap-1">
          <b :class="w === 'onHit' ? 'text-emerald-300' : 'text-rose-300'">{{ w === "onHit" ? "○" : "×" }}</b>
          <select class="sel" :value="n[w] ?? ''" @change="setGoto(w, ($event.target as HTMLSelectElement).value)">
            <option value="">{{ w === "onMiss" && certain ? "(外れない STEP なので要らない)" : "まだ決めていない" }}</option>
            <option value="__new__">＋ 次の STEP を新しく作る</option>
            <option value="done">完成 (ここで終わり)</option>
            <option value="auto">自動 (消えた MOD を付け直す手に戻る)</option>
            <option :value="n.id">もう一度この STEP を打つ</option>
            <template v-for="g in [gotoGroups(w)]" :key="w">
              <optgroup v-if="g.up.length" label="前の STEP へ戻る">
                <option v-for="o in g.up" :key="o.value" :value="o.value">{{ o.label }}</option>
              </optgroup>
              <optgroup v-if="g.others.length" label="ほかの枝の STEP">
                <option v-for="o in g.others" :key="o.value" :value="o.value">{{ o.label }}</option>
              </optgroup>
            </template>
          </select>
        </label>
      </div>

      <!-- 条件を足す (たたむ) -->
      <details class="mt-2" :open="hasExtra">
        <summary class="cursor-pointer opacity-50">条件を足す</summary>
        <div class="mt-1 flex flex-wrap gap-3 pl-2">
          <label><input type="checkbox" :checked="n.clean" @change="t.update(n.id, { clean: ($event.target as HTMLInputElement).checked })" /> 外れが無いことも○の条件にする</label>
          <label>外せる MOD が
            <input type="number" min="0" class="num w-10" :value="n.maxMods ?? ''" @change="t.update(n.id, { maxMods: ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value) })" />
            個以下で○ (剥がす手用)
          </label>
        </div>
      </details>
    </template>
  </div>
</template>
