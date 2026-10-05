<!--
  StageSimPanel.vue — クラフトステージのシミュレーション (2026-10-05、実験)

  オーナー「この MOD 群をクラフトした場合にいくらかかるのか見たい」「ステージでタブ切り替えでエミュレーター作ってよくね」。
  狙いは下の「このベースに付く MOD」の段の表の「狙う」で選ぶ (その段以上)。白のベースから、計算機の作る見込みと同じ道
  (自動のツリーの候補を比べて安い方を多めに回す、[[stage-sim.ts]]) で 1 個あたりの費用・完成の割合・手ごとの回数と費用を出す。
  計算機 (htc-craft) はそのまま。
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { craftStage } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";
import { jaOfMod } from "../../services/htc/mod-text";
import { fillHashes } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { nodeLabel, simulateStage, type StageSimResult } from "./stage-sim";

const s = craftStage;
const RUNS = [500, 1000, 3000] as const;
const runs = ref<number>(1000);

/** 狙いの行 (文は狙いの段の値、「T2 以上」) */
const rows = computed(() => {
  const d = s.data.value;
  if (!d) return [];
  return s.simTargets.value.map((t) => {
    const m = d.mods.get(t.modId);
    const tier = m?.tiers[t.minTierIndex];
    return {
      ...t,
      side: m?.type === "suffix" ? "サフィックス" : "プレフィックス",
      desecrated: m?.source === "desecrated",
      text: m ? fillHashes(jaOfMod(m), tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ") : t.modId,
      rank: m ? `T${m.tiers.length - t.minTierIndex}` : "",
    };
  });
});
const sideCount = computed(() => ({
  p: rows.value.filter((r) => r.side === "プレフィックス").length,
  s: rows.value.filter((r) => r.side === "サフィックス").length,
}));
function remove(modId: string): void {
  s.simTargets.value = s.simTargets.value.filter((t) => t.modId !== modId);
}

const busy = ref(false);
const phase = ref("");
const progress = ref<[number, number] | null>(null);
const error = ref("");
const out = ref<StageSimResult | null>(null);
/** 走らせた時の狙い・ベース (変わったら結果は古い印) */
const ranFor = ref("");
const sig = computed(() => `${s.base.value}|${s.itemLevel.value}|${s.simTargets.value.map((t) => `${t.modId}:${t.minTierIndex}`).join(",")}`);
let gen = 0;

async function run(): Promise<void> {
  const it = s.item.value, d = s.data.value;
  if (!it || !d || !s.simTargets.value.length) return;
  const my = ++gen;
  busy.value = true;
  error.value = "";
  progress.value = null;
  try {
    const r = await simulateStage({
      data: d, cls: it.cls, baseEn: s.base.value, itemLevel: s.itemLevel.value, targets: s.simTargets.value, runs: runs.value,
      onPhase: (p) => { if (my === gen) phase.value = p === "prices" ? "相場を確かめています" : p === "pick" ? "作り方の候補を比べています (候補ごとに 150 回)" : "回しています"; },
      onProgress: (done, total) => { if (my === gen) progress.value = [done, total]; },
    });
    if (my !== gen) return;
    out.value = r;
    ranFor.value = sig.value;
    if (!r) error.value = "作り方を組めませんでした (狙いの段がこのアイテムレベルで出ない・枠が足りない など)";
  } catch (e) {
    if (my === gen) error.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (my === gen) { busy.value = false; phase.value = ""; }
  }
}
/** 止める (回している物は裏で終わるが、結果は捨てる) */
function stop(): void {
  gen++;
  busy.value = false;
  phase.value = "";
}
watch(() => s.base.value, () => { out.value = null; });

const money = (x: number): string => (Number.isFinite(x) ? displayCurrency.money(x) : "—");
const pct = (x: number): string => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const steps = computed(() => {
  const r = out.value, d = s.data.value;
  if (!r || !d) return [];
  const per = new Map(r.result.perNode.map((x) => [x.id, x]));
  return r.nodes.map((n, i) => ({ i: i + 1, id: n.id, label: nodeLabel(d, n), tries: per.get(n.id)?.tries ?? 0, cost: per.get(n.id)?.cost ?? 0 }));
});
const stale = computed(() => !!out.value && ranFor.value !== sig.value);
</script>

<template>
  <section class="rounded-xl border border-amber-400/30 bg-amber-500/[0.04] p-3 text-[12px]">
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <b class="text-sm text-amber-100">シミュレーション</b>
      <span class="rounded bg-amber-500/20 px-1.5 text-[10px] text-amber-200">実験</span>
      <span class="opacity-60">白の {{ s.item.value?.baseJa }} (アイテムレベル {{ s.itemLevel.value }}) から、狙いを全部付けるまで。下の「このベースに付く MOD」の段の表の「狙う」で選ぶ (その段以上)</span>
    </div>

    <!-- 狙い -->
    <div class="mb-3">
      <p class="mb-1 text-[11px] opacity-70">狙い {{ rows.length }} 個 (プレ {{ sideCount.p }} / サフィ {{ sideCount.s }})</p>
      <p v-if="!rows.length" class="rounded-lg border border-dashed border-white/15 px-3 py-3 text-center opacity-60">まだありません。下の MOD の行を押して段の表を開き、「狙う」を押してください</p>
      <div v-else class="flex flex-wrap gap-1.5">
        <span v-for="r in rows" :key="r.modId" class="flex items-center gap-1.5 rounded-lg border px-2 py-1" :class="r.desecrated ? 'border-rose-400/40 bg-rose-500/10' : 'border-[#8888ff]/40 bg-[#8888ff]/10'">
          <span class="text-[10px] opacity-60">{{ r.side === "プレフィックス" ? "プレ" : "サフィ" }}</span>
          <span class="text-[#c8c8ff]">{{ r.text }}</span>
          <span class="rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ r.rank }} 以上</span>
          <button type="button" class="opacity-60 hover:opacity-100" title="外す" @click="remove(r.modId)">×</button>
        </span>
        <button type="button" class="rounded-lg border border-white/15 px-2 py-1 opacity-70 hover:opacity-100" @click="s.simTargets.value = []">全部外す</button>
      </div>
    </div>

    <!-- 回す -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <span class="opacity-60">回す回数</span>
      <button v-for="n in RUNS" :key="n" type="button" class="rounded-lg px-2 py-0.5" :class="runs === n ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 hover:bg-white/5'" @click="runs = n">{{ n.toLocaleString() }}</button>
      <button type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-1 font-bold text-amber-100 disabled:opacity-40" :disabled="busy || !rows.length" @click="run">回す</button>
      <button v-if="busy" type="button" class="rounded-lg border border-rose-400/50 px-2 py-1 text-rose-200 hover:bg-rose-500/10" @click="stop">中止</button>
      <span v-if="busy" class="text-sky-200">{{ phase }}<template v-if="progress && phase === '回しています'"> {{ progress[0] }} / {{ progress[1] }}</template>…</span>
      <span v-if="error" class="text-rose-300">{{ error }}</span>
    </div>

    <!-- 結果 -->
    <div v-if="out" :class="stale ? 'opacity-50' : ''">
      <p v-if="stale" class="mb-1 text-[11px] text-amber-200">狙いかベースが変わりました。もう一度「回す」で出し直してください</p>
      <div class="mb-2 grid grid-cols-2 gap-2 @3xl:grid-cols-5">
        <div class="rounded-lg bg-black/30 px-3 py-2">
          <p class="text-[10px] opacity-60">1 個できるまでの平均</p>
          <p class="text-lg font-bold text-amber-100">{{ money(out.perDone) }}</p>
          <p class="text-[10px] opacity-50">失敗した回の費用も込み</p>
        </div>
        <div class="rounded-lg bg-black/30 px-3 py-2">
          <p class="text-[10px] opacity-60">完成の割合</p>
          <p class="text-lg font-bold" :class="out.result.pDone >= 0.9 ? 'text-emerald-300' : 'text-amber-300'">{{ pct(out.result.pDone) }}</p>
          <p class="text-[10px] opacity-50">{{ out.result.runs.toLocaleString() }} 回のうち</p>
        </div>
        <div class="rounded-lg bg-black/30 px-3 py-2">
          <p class="text-[10px] opacity-60">半分の人はこれ以内</p>
          <p class="text-base font-bold">{{ money(out.result.p50) }}</p>
        </div>
        <div class="rounded-lg bg-black/30 px-3 py-2">
          <p class="text-[10px] opacity-60">8 割の人はこれ以内</p>
          <p class="text-base font-bold">{{ money(out.result.p80) }}</p>
        </div>
        <div class="rounded-lg bg-black/30 px-3 py-2">
          <p class="text-[10px] opacity-60">9 割の人はこれ以内</p>
          <p class="text-base font-bold">{{ money(out.result.p90) }}</p>
        </div>
      </div>
      <p class="mb-1 text-[11px] opacity-70">作り方: {{ out.route }} (計算機の自動のツリーで、候補を比べて安かった物)。回数・費用は 1 回の挑戦あたりの平均</p>
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
          <tr v-for="r in steps" :key="r.id" class="border-t border-white/5">
            <td class="py-1 font-bold text-amber-200">{{ r.i }}</td>
            <td class="py-1">{{ r.label }}</td>
            <td class="py-1 text-right tabular-nums">{{ r.tries.toFixed(r.tries < 10 ? 1 : 0) }}</td>
            <td class="py-1 text-right tabular-nums">{{ money(r.cost) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-for="x in out.result.stops" :key="x.reason" class="mt-1 text-[11px] text-rose-300/80">止まった回 {{ pct(x.p) }}: {{ x.reason }}</p>
    </div>
  </section>
</template>
