<!--
  StageSimPanel.vue — クラフトステージのシミュレーション (2026-10-05、実験)

  オーナー「この MOD 群をクラフトした場合にいくらかかるのか見たい」「ステージでタブ切り替えでエミュレーター作ってよくね」
  「どういう順番で付けるかを最初に選ばせて、それぞれフラクチャー・冒涜をする箇所を選ばせて、順番通りに作る」
  「取引所関連は設定だけしてあげて検索ボタンで自分で拾いに行かせる。値段設定とかも手動で」。
  狙いは下の「このベースに付く MOD」の段の表の「狙う」で選ぶ (その段以上)。2 つの回し方:
    - 順番どおり: 狙いの順番と付け方 (高貴 / カオス / 冒涜 / エッセンス / フラクチャー) を決めて、ステージの 1 手で何百回も打つ
      ([[recipe-sim.ts]])。真ん中くらいの 1 回を「手で打つ」で再生できる
    - 自動: 計算機の作る見込みと同じ道 (自動のツリーの候補を比べて安い方を多めに回す、[[stage-sim.ts]])
  計算機 (htc-craft) はそのまま。
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { craftStage, nameOf, priceOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";
import { fillHashes, jaOfMod } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { nodeLabel, simulateStage, type StageSimResult } from "./stage-sim";
import { runRecipe, recipePlan, type RecipeMethod, type RecipeResult, type RecipeSpec } from "../../services/craft-stage/recipe-sim";
import { tradeFiltersFor } from "../../services/htc/buy-or-craft";
import { buildSpecQuery } from "../../services/trade2/query/spec";
import { openTradeQuery } from "../../services/pob-check/trade-links";
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";

const s = craftStage;
const RUNS = [500, 1000, 3000] as const;
const runs = ref<number>(1000);
const how = ref<"recipe" | "auto">("recipe");

const METHOD_JA: Record<RecipeMethod, string> = { exalt: "高貴", chaos: "カオス", desecrate: "冒涜", essence: "エッセンス", fracture: "フラクチャー" };
/** その MOD に使える付け方 (最初が既定) */
function methodsFor(modId: string): RecipeMethod[] {
  const m = s.data.value?.mods.get(modId);
  if (!m) return ["exalt"];
  if (m.source === "desecrated") return ["desecrate"];
  if (CRAFTED_SOURCES.has(m.source)) return ["essence"];
  return ["exalt", "chaos", "desecrate", "fracture"];
}
const methodOf = (t: { modId: string; method?: RecipeMethod }): RecipeMethod => (t.method && methodsFor(t.modId).includes(t.method) ? t.method : methodsFor(t.modId)[0]!);

/** 狙いの行 (文は狙いの段の値、「T2 以上」) */
const rows = computed(() => {
  const d = s.data.value;
  if (!d) return [];
  return s.simTargets.value.map((t) => {
    const m = d.mods.get(t.modId);
    const tier = m?.tiers[t.minTierIndex];
    return {
      ...t,
      method: methodOf(t),
      methods: methodsFor(t.modId),
      side: m?.type === "suffix" ? "サフィ" : "プレ",
      tone: m?.source === "desecrated" ? "text-rose-200" : m && CRAFTED_SOURCES.has(m.source) ? "text-sky-200" : "text-[#c8c8ff]",
      text: m ? fillHashes(jaOfMod(m), tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ") : t.modId,
      rank: m ? `T${m.tiers.length - t.minTierIndex}` : "",
    };
  });
});
const sideCount = computed(() => ({ p: rows.value.filter((r) => r.side === "プレ").length, s: rows.value.filter((r) => r.side === "サフィ").length }));
function remove(modId: string): void {
  s.simTargets.value = s.simTargets.value.filter((t) => t.modId !== modId);
}
function move(i: number, d: -1 | 1): void {
  const list = [...s.simTargets.value];
  const j = i + d;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  s.simTargets.value = list;
}
/** 付け方を変える。フラクチャーは 1 つだけで、一番上に置く (最初に作る物) */
function setMethod(modId: string, method: RecipeMethod): void {
  let list = s.simTargets.value.map((t) => (t.modId === modId ? { ...t, method } : method === "fracture" && t.method === "fracture" ? { ...t, method: undefined } : t));
  if (method === "fracture") list = [...list.filter((t) => t.modId === modId), ...list.filter((t) => t.modId !== modId)];
  s.simTargets.value = list;
}

/** フラクチャーの狙いの始め方。付いた状態のベースの値段は手で (神) */
const fractureRow = computed(() => rows.value.find((r) => r.method === "fracture") ?? null);
const fractureStart = ref<"make" | "bought">("make");
const boughtDivine = ref<number | null>(null);
/** 付いた状態のベースを取引所で探す (開くだけ。値段は手で入れる) */
async function searchBought(): Promise<void> {
  const d = s.data.value, f = fractureRow.value;
  if (!d || !f) return;
  const got = tradeFiltersFor(d, [{ modId: f.modId, minTierIndex: f.minTierIndex }]);
  const stats = got.filters.map((x) => ({ id: x.id.replace(/^explicit\./, "fractured."), ...(x.min != null ? { min: x.min } : {}) }));
  await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "nonunique", ilvlMin: s.itemLevel.value, stats, fracturedItem: true, noSanctified: true }));
}

/**
 * フラクチャー済みのベースを自分で作ったらいくらか (買うかの分かれ目)。2026-10-05 オーナー「ベースって買った方がええよな、基準は」→
 * 「作るとこのくらい → これより安ければ買う方が得」。錬金 → カオス → フラクチャー (外れたら白から) → 消去で固定した 1 個だけ、を回す
 */
const makeCost = ref<{ key: string; perDone: number; p50: number; p90: number; pDone: number } | null>(null);
const makeBusy = ref(false);
let makeGen = 0;
const makeKey = computed(() => (fractureRow.value ? `${s.base.value}|${s.itemLevel.value}|${fractureRow.value.modId}:${fractureRow.value.minTierIndex}` : ""));
watch(makeKey, async (key) => {
  const d = s.data.value, f = fractureRow.value;
  const my = ++makeGen;
  if (!key || !d || !f) { makeCost.value = null; makeBusy.value = false; return; }
  if (makeCost.value?.key === key) return;
  makeBusy.value = true;
  const memo = new Map<string, number>();
  const price = (k: string): number => { let v = memo.get(k); if (v == null) { v = priceOf(k); memo.set(k, v); } return v; };
  const r = await runRecipe({
    data: d, base: s.base.value, itemLevel: s.itemLevel.value, runs: 500, price, fractureStart: { kind: "make" },
    targets: [{ modId: f.modId, minTierIndex: f.minTierIndex, method: "fracture" }],
  }, undefined, () => my !== makeGen);
  if (my !== makeGen) return;
  makeBusy.value = false;
  makeCost.value = r ? { key, perDone: r.perDone, p50: r.p50, p90: r.p90, pDone: r.pDone } : null;
}, { immediate: true });
/** 入れた値段との比べ (高貴建て) */
const buyVsMake = computed(() => {
  const m = makeCost.value;
  if (!m || boughtDivine.value == null || !(boughtDivine.value >= 0) || !Number.isFinite(m.perDone)) return null;
  const buy = boughtDivine.value * (priceOf("divine") || 1);
  return { buy, diff: m.perDone - buy };
});

const busy = ref(false);
const phase = ref("");
const progress = ref<[number, number] | null>(null);
const error = ref("");
const autoOut = ref<StageSimResult | null>(null);
const recipeOut = ref<{ r: RecipeResult; spec: RecipeSpec } | null>(null);
const ranFor = ref("");
const sig = computed(() => `${how.value}|${s.base.value}|${s.itemLevel.value}|${fractureStart.value}|${boughtDivine.value}|${s.simTargets.value.map((t) => `${t.modId}:${t.minTierIndex}:${methodOf(t)}`).join(",")}`);
let gen = 0;

const blocked = computed((): string | null => {
  if (!rows.value.length) return "狙いがありません";
  if (how.value === "recipe" && fractureRow.value && fractureStart.value === "bought" && !(boughtDivine.value != null && boughtDivine.value >= 0)) return "付いた状態のベースの値段 (神) を入れてください";
  return null;
});

async function run(): Promise<void> {
  const it = s.item.value, d = s.data.value;
  if (!it || !d || blocked.value) return;
  const my = ++gen;
  busy.value = true;
  error.value = "";
  progress.value = null;
  try {
    if (how.value === "auto") {
      const r = await simulateStage({
        data: d, cls: it.cls, baseEn: s.base.value, itemLevel: s.itemLevel.value, targets: s.simTargets.value, runs: runs.value,
        onPhase: (p) => { if (my === gen) phase.value = p === "prices" ? "相場を確かめています" : p === "pick" ? "作り方の候補を比べています (候補ごとに 150 回)" : "回しています"; },
        onProgress: (done, total) => { if (my === gen) progress.value = [done, total]; },
      });
      if (my !== gen) return;
      autoOut.value = r;
      if (!r) error.value = "作り方を組めませんでした (狙いの段がこのアイテムレベルで出ない・枠が足りない など)";
    } else {
      phase.value = "回しています";
      const divine = priceOf("divine") || 1;
      // 値段は 1 回引いたら覚える (相場の一覧を毎手引くと、500 回で 46 秒かかっていた)
      const memo = new Map<string, number>();
      const price = (k: string): number => { let v = memo.get(k); if (v == null) { v = priceOf(k); memo.set(k, v); } return v; };
      const spec: RecipeSpec = {
        data: d, base: s.base.value, itemLevel: s.itemLevel.value, runs: runs.value, price,
        targets: s.simTargets.value.map((t) => ({ modId: t.modId, minTierIndex: t.minTierIndex, method: methodOf(t) })),
        ...(fractureRow.value ? { fractureStart: fractureStart.value === "bought" ? { kind: "bought" as const, price: (boughtDivine.value ?? 0) * divine } : { kind: "make" as const } } : {}),
      };
      const r = await runRecipe(spec, (done, total) => { if (my === gen) progress.value = [done, total]; }, () => my !== gen);
      if (my !== gen || !r) return;
      recipeOut.value = { r, spec };
    }
    ranFor.value = sig.value;
  } catch (e) {
    if (my === gen) error.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (my === gen) { busy.value = false; phase.value = ""; }
  }
}
function stop(): void {
  gen++;
  busy.value = false;
  phase.value = "";
}
watch(() => s.base.value, () => { autoOut.value = null; recipeOut.value = null; });

const money = (x: number): string => (Number.isFinite(x) ? displayCurrency.money(x) : "—");
const pct = (x: number): string => `${(x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0)}%`;
const stale = computed(() => ranFor.value !== sig.value);
/** 上の 5 つの数 (どちらの回し方でも同じ形) */
const summary = computed(() => {
  if (how.value === "auto" && autoOut.value) { const r = autoOut.value.result; return { perDone: autoOut.value.perDone, pDone: r.pDone, runs: r.runs, p50: r.p50, p80: r.p80, p90: r.p90 }; }
  if (how.value === "recipe" && recipeOut.value) { const r = recipeOut.value.r; return { perDone: r.perDone, pDone: r.pDone, runs: r.runs, p50: r.p50, p80: r.p80, p90: r.p90 }; }
  return null;
});
const autoSteps = computed(() => {
  const r = autoOut.value, d = s.data.value;
  if (!r || !d) return [];
  const per = new Map(r.result.perNode.map((x) => [x.id, x]));
  return r.nodes.map((n, i) => ({ i: i + 1, id: n.id, label: nodeLabel(d, n), tries: per.get(n.id)?.tries ?? 0, cost: per.get(n.id)?.cost ?? 0 }));
});
const usageName = (k: string): string => (k === "reveal" ? "発現 (選ぶだけ)" : nameOf(k));
/** 真ん中くらいの 1 回を「手で打つ」で再生 */
function replay(): void {
  const o = recipeOut.value;
  if (!o?.r.sample) return;
  const plan = recipePlan(o.spec, o.r.sample);
  s.mode.value = "hand";
  s.loadReplay(plan, plan.steps.length);
}
</script>

<template>
  <section class="rounded-xl border border-amber-400/30 bg-amber-500/[0.04] p-3 text-[12px]">
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <b class="text-sm text-amber-100">シミュレーション</b>
      <span class="rounded bg-amber-500/20 px-1.5 text-[10px] text-amber-200">実験</span>
      <span class="opacity-60">{{ s.item.value?.baseJa }} (アイテムレベル {{ s.itemLevel.value }})。狙いは下の「このベースに付く MOD」の段の表の「狙う」で選ぶ (その段以上)</span>
    </div>

    <!-- 回し方 -->
    <div class="mb-2 flex flex-wrap items-center gap-1.5">
      <button v-for="h in ([['recipe', '順番と付け方を決めて回す'], ['auto', '自動 (一番安い作り方を探す)']] as const)" :key="h[0]" type="button" class="rounded-lg px-3 py-1" :class="how === h[0] ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 opacity-70 hover:opacity-100'" @click="how = h[0]">{{ h[1] }}</button>
      <span class="text-[11px] opacity-60">{{ how === "recipe" ? "上から順に作る。前に付けた物が消えたら、また上から" : "計算機の作る見込みと同じ。白のベースから" }}</span>
    </div>

    <!-- 狙い -->
    <div class="mb-3">
      <p class="mb-1 text-[11px] opacity-70">狙い {{ rows.length }} 個 (プレ {{ sideCount.p }} / サフィ {{ sideCount.s }})</p>
      <p v-if="!rows.length" class="rounded-lg border border-dashed border-white/15 px-3 py-3 text-center opacity-60">まだありません。下の MOD の行を押して段の表を開き、「狙う」を押してください</p>
      <table v-else class="w-full">
        <tbody>
          <tr v-for="(r, i) in rows" :key="r.modId" class="border-t border-white/5">
            <td v-if="how === 'recipe'" class="w-14 py-1">
              <span class="mr-1 font-bold text-amber-200">{{ i + 1 }}</span>
              <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === 0" title="上へ" @click="move(i, -1)">▲</button>
              <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === rows.length - 1" title="下へ" @click="move(i, 1)">▼</button>
            </td>
            <td class="w-10 py-1 text-[10px] opacity-60">{{ r.side }}</td>
            <td class="py-1"><span :class="r.tone">{{ r.text }}</span> <span class="ml-1 rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ r.rank }} 以上</span></td>
            <td v-if="how === 'recipe'" class="py-1">
              <span class="flex flex-wrap gap-1">
                <button v-for="m in r.methods" :key="m" type="button" class="rounded px-1.5 py-px text-[11px]" :class="r.method === m ? (m === 'fracture' ? 'bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/60' : m === 'desecrate' ? 'bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/60' : 'bg-white/15 text-white ring-1 ring-white/40') : 'border border-white/10 opacity-60 hover:opacity-100'" @click="setMethod(r.modId, m)">{{ METHOD_JA[m] }}</button>
              </span>
            </td>
            <td class="w-6 py-1 text-right"><button type="button" class="opacity-60 hover:opacity-100" title="外す" @click="remove(r.modId)">×</button></td>
          </tr>
        </tbody>
      </table>
      <button v-if="rows.length" type="button" class="mt-1 rounded-lg border border-white/15 px-2 py-0.5 text-[11px] opacity-70 hover:opacity-100" @click="s.simTargets.value = []">全部外す</button>
    </div>

    <!-- フラクチャーの始め方 -->
    <div v-if="how === 'recipe' && fractureRow" class="mb-3 rounded-lg border border-emerald-400/30 bg-emerald-500/[0.06] px-3 py-2">
      <p class="mb-1 font-bold text-emerald-100">フラクチャー: {{ fractureRow.text }} ({{ fractureRow.rank }} 以上)</p>
      <label class="mr-4 inline-flex items-center gap-1.5"><input v-model="fractureStart" type="radio" value="make" /> 作る (確率込み)</label>
      <label class="inline-flex items-center gap-1.5"><input v-model="fractureStart" type="radio" value="bought" /> 付いた状態で始める (ベースを買う)</label>
      <p class="mt-1 text-[12px]">
        <template v-if="makeBusy">作る費用を出しています…</template>
        <template v-else-if="makeCost">
          自分で作ると平均 <b class="text-amber-100">{{ money(makeCost.perDone) }}</b>
          <span class="text-[11px] opacity-60">(半分の人 {{ money(makeCost.p50) }} 以内・9 割 {{ money(makeCost.p90) }} 以内<template v-if="makeCost.pDone < 0.95">・作れた割合 {{ pct(makeCost.pDone) }}</template>)</span>
          → <b class="text-emerald-200">これより安ければ買う方が得</b>
          <template v-if="buyVsMake">
            <span v-if="buyVsMake.diff > 0" class="ml-2 rounded bg-emerald-500/20 px-1.5 text-emerald-200">入れた値段なら買う方が {{ money(buyVsMake.diff) }} 得</span>
            <span v-else class="ml-2 rounded bg-amber-500/20 px-1.5 text-amber-200">入れた値段なら作る方が {{ money(-buyVsMake.diff) }} 得</span>
          </template>
        </template>
      </p>
      <p v-if="fractureStart === 'make'" class="mt-1 text-[11px] opacity-70">錬金 → 狙いが付くまでカオス → フラクチャー (MOD 4 個なら 1/4。外れを固定したら白から作り直し、ベース代は数えない) → 外れが無くなるまで消去。ここまでの費用も込み</p>
      <p v-else class="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
        <span class="opacity-70">ベースの値段</span>
        <input v-model.number="boughtDivine" type="number" min="0" step="0.1" class="w-20 rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-right" /> <span>神</span>
        <button type="button" class="rounded border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10" title="この MOD が固定済みのベースを取引所で探す (開くだけ)" @click="searchBought">取引所で探す ↗</button>
        <span class="opacity-60">見つけた値段を入れてください</span>
      </p>
    </div>

    <!-- 回す -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <span class="opacity-60">回す回数</span>
      <button v-for="n in RUNS" :key="n" type="button" class="rounded-lg px-2 py-0.5" :class="runs === n ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 hover:bg-white/5'" @click="runs = n">{{ n.toLocaleString() }}</button>
      <button type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-1 font-bold text-amber-100 disabled:opacity-40" :disabled="busy || !!blocked" :title="blocked ?? ''" @click="run">回す</button>
      <button v-if="busy" type="button" class="rounded-lg border border-rose-400/50 px-2 py-1 text-rose-200 hover:bg-rose-500/10" @click="stop">中止</button>
      <span v-if="busy" class="text-sky-200">{{ phase }}<template v-if="progress && phase === '回しています'"> {{ progress[0] }} / {{ progress[1] }}</template>…</span>
      <span v-else-if="blocked && rows.length" class="text-amber-200/80">{{ blocked }}</span>
      <span v-if="error" class="text-rose-300">{{ error }}</span>
    </div>

    <!-- 結果 -->
    <div v-if="summary" :class="stale ? 'opacity-50' : ''">
      <p v-if="stale" class="mb-1 text-[11px] text-amber-200">設定が変わりました。もう一度「回す」で出し直してください</p>
      <div class="mb-2 grid grid-cols-2 gap-2 @3xl:grid-cols-5">
        <div class="rounded-lg bg-black/30 px-3 py-2">
          <p class="text-[10px] opacity-60">1 個できるまでの平均</p>
          <p class="text-lg font-bold text-amber-100">{{ money(summary.perDone) }}</p>
          <p class="text-[10px] opacity-50">失敗した回の費用も込み</p>
        </div>
        <div class="rounded-lg bg-black/30 px-3 py-2">
          <p class="text-[10px] opacity-60">完成の割合</p>
          <p class="text-lg font-bold" :class="summary.pDone >= 0.9 ? 'text-emerald-300' : 'text-amber-300'">{{ pct(summary.pDone) }}</p>
          <p class="text-[10px] opacity-50">{{ summary.runs.toLocaleString() }} 回のうち</p>
        </div>
        <div class="rounded-lg bg-black/30 px-3 py-2"><p class="text-[10px] opacity-60">半分の人はこれ以内</p><p class="text-base font-bold">{{ money(summary.p50) }}</p></div>
        <div class="rounded-lg bg-black/30 px-3 py-2"><p class="text-[10px] opacity-60">8 割の人はこれ以内</p><p class="text-base font-bold">{{ money(summary.p80) }}</p></div>
        <div class="rounded-lg bg-black/30 px-3 py-2"><p class="text-[10px] opacity-60">9 割の人はこれ以内</p><p class="text-base font-bold">{{ money(summary.p90) }}</p></div>
      </div>

      <!-- 順番どおり: 使った物 -->
      <template v-if="how === 'recipe' && recipeOut">
        <div class="mb-1 flex items-center gap-2">
          <p class="text-[11px] opacity-70">使った物 (1 個できるまでの平均)</p>
          <button type="button" class="ml-auto rounded-lg border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10 disabled:opacity-40" :disabled="!recipeOut.r.sample" title="費用が真ん中くらいだった 1 回を「手で打つ」で 1 手ずつ見る" @click="replay">真ん中くらいの 1 回をステージで再生 ▶</button>
        </div>
        <table class="w-full text-[12px]">
          <thead>
            <tr class="text-[10px] opacity-60">
              <th class="py-1 text-left font-normal">打つ物 / お告げ</th>
              <th class="w-24 py-1 text-right font-normal">数</th>
              <th class="w-28 py-1 text-right font-normal">費用</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in recipeOut.r.usage" :key="u.key" class="border-t border-white/5">
              <td class="py-1">{{ usageName(u.key) }}</td>
              <td class="py-1 text-right tabular-nums">{{ u.count.toFixed(u.count < 10 ? 1 : 0) }}</td>
              <td class="py-1 text-right tabular-nums">{{ u.key === "reveal" ? "" : money(u.cost) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-for="x in recipeOut.r.stops" :key="x.reason" class="mt-1 text-[11px] text-rose-300/80">止まった回 {{ pct(x.p) }}: {{ x.reason }}</p>
      </template>

      <!-- 自動: 作り方 -->
      <template v-if="how === 'auto' && autoOut">
        <p class="mb-1 text-[11px] opacity-70">作り方: {{ autoOut.route }} (計算機の自動のツリーで、候補を比べて安かった物)。回数・費用は 1 回の挑戦あたりの平均</p>
        <table class="w-full text-[12px]">
          <thead>
            <tr class="text-[10px] opacity-60">
              <th class="w-10 py-1 text-left font-normal">手</th>
              <th class="py-1 text-left font-normal">打つ物 → 狙い</th>
              <th class="w-24 py-1 text-right font-normal">平均の回数</th>
              <th class="w-28 py-1 text-right font-normal">平均の費用</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in autoSteps" :key="r.id" class="border-t border-white/5">
              <td class="py-1 font-bold text-amber-200">{{ r.i }}</td>
              <td class="py-1">{{ r.label }}</td>
              <td class="py-1 text-right tabular-nums">{{ r.tries.toFixed(r.tries < 10 ? 1 : 0) }}</td>
              <td class="py-1 text-right tabular-nums">{{ money(r.cost) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-for="x in autoOut.result.stops" :key="x.reason" class="mt-1 text-[11px] text-rose-300/80">止まった回 {{ pct(x.p) }}: {{ x.reason }}</p>
      </template>
    </div>
  </section>
</template>
