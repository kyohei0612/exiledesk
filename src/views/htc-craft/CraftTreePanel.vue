<script setup lang="ts">
/**
 * CraftTreePanel.vue — 作り方のツリーと、予算を入れて回した結果 (2026-09-24)
 *
 * オーナー:「ツリー上、シミュレーター方式。完成までの道のりを○×で進める。進むにつれてツリーがデカくなる。
 * 最終的に予算入力してシミュレーターかけて確率と予算内にできるか表示する」。中身は [[useCraftTree.ts]]。
 *
 * 2026-09-25 見た目の作り直し (オーナー:「UI 周りをめっちゃ見やすく使いやすく。特にシミュレーション周り。今風かつシンプル、
 * 感覚で操作できる感じ」): 上から 道具の列 (回す / 組み直す / 1 から / 設定) → 回した結果 (大きな数字 4 つ + 手ごとの費用の棒) →
 * 取り方の表 (畳める) → ツリー。手のカードは畳んだ状態が既定 ([[TreeNodeCard.vue]])
 */
import { computed, nextTick, ref, watch } from "vue";
import TreeBranch from "./TreeBranch.vue";
import TreeNodeCard from "./TreeNodeCard.vue";
import { useCraftTree } from "./useCraftTree";
import { TREE_PRESETS } from "./tree-presets";
import { autoInputFor, pickAutoTree } from "./auto-pick";
import { startKindOf } from "./start-kind";
import { RULES, type RedoPlan } from "./redo-cost";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();
const c = props.c;
const t = useCraftTree(c);
const pct = (p: number): string => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
/** 貼り付けの狙いに合う見本のツリー */
const presets = computed(() => TREE_PRESETS.filter((x) => x.applies(c.targets.value)));
function loadPreset(id: string): void {
  const x = TREE_PRESETS.find((y) => y.id === id), d = c.data.value, p = c.prices.value;
  if (x && d && p) t.setAll(x.build(d, p, c.targets.value));
}
/**
 * 貼った MOD から自動で組む ([[tree-auto.ts]]、オーナー 2026-09-24:「作っていいよ色んなパターン」)。
 * 触らない MOD (固定していない樹 MOD など) がある時は側の無いカオスを使わない。クラフト非推奨の時は出さない
 */
const canAuto = computed(() => !!c.data.value && !!c.prices.value && c.targets.value.length > 0 && startKindOf(c).kind !== "unsafe" && !c.unreachableTargets.value.length);
/** 診断 (② 始め方 → ③ 完成品) が済んでから回す (オーナー 2026-09-25:「完成終わったらシミュレーションって順番」) */
const autoReady = computed(() => canAuto.value && !c.diagBusy.value);
/** 組んでいる最中 (候補を短く回して比べるので数秒かかる) */
const autoBusy = ref(false);
/** やり直しの費用から決めた取り方 ([[redo-cost.ts]]、自動で組んだ時に出す) */
const plan = ref<RedoPlan | null>(null);
/** 回して採った候補の名前と平均 (見積もりと違う候補が勝つこともある) */
const picked = ref<{ label: string; expected: number | null; done: number | null } | null>(null);
const methodJa: Record<string, string> = { chaos: "カオス", exalt: "高貴 + 側のお告げ", desecrate: "冒涜", essence: "エッセンス (確定)" };
const rerollJa = (r: RedoPlan["rows"][number]): string =>
  r.method === "desecrate" ? `${r.bone === "desecrate_ancient" ? "古代" : "普通の骨"}・外れは${r.reroll === "overwrite" ? "天体で上書き" : "光 + 消去"}`
  : r.method === "exalt" ? `${r.catalyst ? "触媒あり・" : ""}外れは${r.plainAnnul ? "素の消去" : "側の消去"}${r.safe ? " (確定)" : " (巻き込む)"}` : r.method === "chaos" ? "外れは打ち直し" : "";
/**
 * 守る価値 = その狙いの作り直し費用 (見込み)。側の消去のお告げ 1 回より高ければ「守る」(オーナー 2026-09-25:「反対側に本当に
 * 守りたい物があるのかというポイント制。T5 なら守りたい物に入らないし、カオスで付くような物もお告げは要らない」)
 */
const omenPrice = (side: string): number => (c.prices.value?.omens[side === "prefix" ? "OmenofSinistralAnnulment" : "OmenofDextralAnnulment"] ?? Infinity);
const guardJa = (r: RedoPlan["rows"][number]): string => (r.expected > omenPrice(r.side) ? "守る" : "守らなくていい");
const pctHit = (p: number): string => (p >= 1 ? "確定" : `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`);
/** 組んでいる最中に開始が変わった (始め方の選び直しなど) → 終わってから組み直す */
let autoAgain = false;
async function loadAuto(): Promise<void> {
  if (!t.ctx.value) return;
  if (autoBusy.value) { autoAgain = true; return; }
  // 組む前に相場を取り直す (カタリスト・お告げの今の値段で比べる)
  await c.refreshPrices();
  const ctx = t.ctx.value;
  if (!ctx) return;
  const inp = autoInputFor(c, ctx, t.start.value, c.fracturedTargets.value.map((x) => x.modId));
  if (!inp) return;
  autoBusy.value = true;
  try {
    const got = await pickAutoTree(inp, ctx, t.start.value);
    plan.value = got.plan;
    picked.value = { label: got.greater, expected: got.simExpected, done: got.simDone };
    t.setAll(got.nodes);
  } finally {
    autoBusy.value = false;
    if (autoAgain) { autoAgain = false; void loadAuto(); }
  }
}
/**
 * 自動はデフォルトで回す (オーナー 2026-09-25:「自動はデフォで回した後にその作り方を自分でやる時にボタン押したらリセット」)。
 * 開始の指輪 (貼り付け・固定済み) が変わるたびに組み直す。自分で組みたい時は「1 から組む」で空にする
 */
// 開始は中身で比べる (相場を取り直すと ctx が作り直され、同じ開始でも別の物として組み直しの輪になっていた。2026-09-25)
watch(() => [JSON.stringify(t.start.value), autoReady.value] as const, async ([, ok]) => {
  if (!ok) return;
  await nextTick();
  void loadAuto();
}, { immediate: true });
/** ツリーを空にして自分で組む */
function startOver(): void {
  t.clear();
  plan.value = null;
  picked.value = null;
}
/** 新しい手を足したらそこへ */
async function focus(id: string): Promise<void> {
  await nextTick();
  document.getElementById(`node-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
/** 設定 (予算・目標・回数・ベース代) を出すか */
const showSettings = ref(false);
/** 手ごとの費用 (割合つき、高い順) */
const perNode = computed(() => {
  const r = t.result.value;
  if (!r) return [];
  const total = Math.max(1, r.perNode.reduce((a, x) => a + x.cost, 0));
  return r.perNode.map((p, i) => ({ ...p, index: i, share: p.cost / total })).sort((a, b) => b.cost - a.cost);
});
const busyText = computed(() => autoBusy.value ? "組んでいます… (候補をいくつか回して比べています)" : t.running.value ? `回しています… ${t.progress.value?.[0] ?? 0} / ${t.progress.value?.[1] ?? 0}` : c.diagBusy.value && canAuto.value ? "上の ② ③ の取得が終わってから自動で組みます" : "");
</script>

<template>
  <div id="craft-tree-panel" class="text-sm">
    <!-- 道具の列 -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <button type="button" class="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-bold text-black shadow hover:bg-amber-400 disabled:opacity-40" :disabled="t.running.value || autoBusy || !!t.blocked.value" @click="t.run()">
        ▶ シミュレーション ({{ t.runs.value.toLocaleString() }} 回)
      </button>
      <button v-if="canAuto" type="button" class="rounded-lg border border-emerald-500/60 px-3 py-1.5 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40" title="狙いの MOD から組み直す (やり直しの費用から取り方を決め、候補を回して比べる)" :disabled="autoBusy" @click="loadAuto()">自動で組み直す</button>
      <button type="button" class="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/5 disabled:opacity-40" title="ツリーを空にして、STEP 1 から自分で組む" :disabled="autoBusy" @click="startOver()">1 から組む</button>
      <button v-for="x in presets" :key="x.id" type="button" class="rounded-lg border border-sky-500/50 px-3 py-1.5 text-sky-200 hover:bg-sky-500/10" @click="loadPreset(x.id)">見本: {{ x.label }}</button>
      <button type="button" class="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/5" :class="showSettings ? 'bg-white/10' : ''" @click="showSettings = !showSettings">設定 {{ showSettings ? "▴" : "▾" }}</button>
      <span v-if="busyText" class="ml-1 text-xs text-amber-200/80"><span class="inline-block animate-pulse">●</span> {{ busyText }}</span>
      <span v-else-if="t.blocked.value" class="ml-1 text-xs text-rose-300">{{ t.blocked.value }}</span>
    </div>
    <div v-if="showSettings" class="mb-3 flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
      <label>予算 <input v-model.number="t.budgetDivine.value" type="number" min="1" step="50" class="num w-20" /> 神</label>
      <label>目標の成功確率 <input v-model.number="t.targetPct.value" type="number" min="1" max="100" step="5" class="num w-14" /> %</label>
      <label title="始め方で選んだベースの値段が入ります。予算と結果の額はこれ込み">ベース代 <input v-model.number="t.baseDivine.value" type="number" min="0" step="1" class="num w-20" /> 神</label>
      <label>回す回数 <input v-model.number="t.runs.value" type="number" min="100" step="500" class="num w-20" /> 回</label>
    </div>

    <!-- 回した結果 (先に見せる) -->
    <div v-if="t.result.value" class="mb-3 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-3">
      <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div class="rounded-lg bg-black/30 p-3">
          <p class="text-[11px] opacity-60">完成する</p>
          <p class="text-2xl font-bold" :class="t.result.value.pDone >= 0.95 ? 'text-emerald-300' : 'text-rose-300'">{{ pct(t.result.value.pDone) }}</p>
        </div>
        <div class="rounded-lg bg-black/30 p-3">
          <p class="text-[11px] opacity-60">平均 (完成した時)</p>
          <p class="text-2xl font-bold">{{ t.result.value.pDone > 0 ? c.money(t.result.value.expected + t.baseEx.value) : "-" }}</p>
          <p v-if="t.baseEx.value > 0" class="text-[11px] opacity-50">ベース代 {{ c.money(t.baseEx.value) }} 込み</p>
        </div>
        <div class="rounded-lg bg-black/30 p-3">
          <p class="text-[11px] opacity-60">{{ t.targetPct.value }}% の人が収まる額</p>
          <p class="text-2xl font-bold text-amber-300">{{ t.needForTarget.value != null ? c.money(t.needForTarget.value) : "届かない" }}</p>
        </div>
        <div class="rounded-lg bg-black/30 p-3">
          <p class="text-[11px] opacity-60">予算 {{ t.budgetDivine.value }} 神以内で完成</p>
          <p class="text-2xl font-bold" :class="(t.result.value.pBudget ?? 0) >= t.targetPct.value / 100 ? 'text-emerald-300' : 'text-amber-300'">{{ pct(t.result.value.pBudget ?? 0) }}</p>
        </div>
      </div>
      <p v-if="t.result.value.pDone > 0" class="mt-2 text-xs opacity-70">
        半分の確率で {{ c.money(t.result.value.p50 + t.baseEx.value) }} / 8 割で {{ c.money(t.result.value.p80 + t.baseEx.value) }} / 9 割で {{ c.money(t.result.value.p90 + t.baseEx.value) }} 以内
      </p>
      <p v-for="s in t.result.value.stops" :key="s.reason" class="mt-1 text-xs text-rose-300">止まった {{ pct(s.p) }}: {{ s.reason }}</p>
      <!-- 手ごとの費用 (高い順、棒つき) -->
      <div class="mt-3 space-y-1 text-xs">
        <div v-for="p in perNode" :key="p.id" class="grid grid-cols-[7rem_1fr_5rem_5rem] items-center gap-2">
          <span class="truncate opacity-80">STEP {{ p.index + 1 }} <span class="opacity-60">{{ t.labelOf(p.id) }}</span></span>
          <div class="h-2.5 overflow-hidden rounded-full bg-white/5"><div class="h-full rounded-full bg-amber-400/70" :style="{ width: `${Math.max(1, Math.round(p.share * 100))}%` }" /></div>
          <span class="text-right opacity-70">{{ p.tries.toFixed(1) }} 回</span>
          <span class="text-right font-bold">{{ c.money(p.cost) }}</span>
        </div>
      </div>
    </div>

    <!-- やり直しの費用から決めた取り方 (自動で組んだ時)。決まりは畳んで出す -->
    <details v-if="plan" class="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs" open>
      <summary class="cursor-pointer select-none">
        <b>取り方</b> <span class="opacity-60">見込みの合計 {{ c.money(plan.total) }}</span>
        <template v-if="picked"><span class="opacity-60"> ・ 候補を回して採ったのは「{{ picked.label }}」</span><template v-if="picked.expected != null"><span class="opacity-60">、平均 </span>{{ c.money(picked.expected) }}<span v-if="picked.done != null && picked.done < 0.9" class="text-rose-300"> (完成 {{ (picked.done * 100).toFixed(0) }}% しか無い)</span></template></template>
      </summary>
      <table class="mt-2 w-full">
        <thead><tr class="opacity-50"><th class="text-left font-normal">狙い</th><th class="text-left font-normal">取り方</th><th class="text-right font-normal">1 回</th><th class="text-right font-normal">当たる</th><th class="text-right font-normal">外れ 1 回のやり直し</th><th class="text-right font-normal">見込み = 作り直し</th><th class="text-left font-normal pl-2" title="作り直しが側の消去のお告げ 1 回 (10〜18 神) より高ければ、消去で巻き込まないように守る価値がある">守る価値</th></tr></thead>
        <tbody>
          <tr v-for="r in plan.rows" :key="r.modId" class="border-t border-white/5">
            <td class="py-1">{{ c.stepTarget([r.modId]) }} <span class="opacity-50">({{ r.side === "prefix" ? "プレ" : "サフィ" }})</span></td>
            <td>{{ methodJa[r.method] }} <span class="opacity-60">{{ rerollJa(r) }}</span></td>
            <td class="text-right">{{ c.money(r.perTry) }}</td>
            <td class="text-right">{{ pctHit(r.p) }}</td>
            <td class="text-right" :class="r.safe ? '' : 'text-amber-300'">{{ r.perMiss > 0 ? c.money(r.perMiss) : "-" }}</td>
            <td class="text-right">{{ c.money(r.expected) }}</td>
            <td class="pl-2" :class="r.expected > omenPrice(r.side) ? 'text-amber-200' : 'opacity-50'">{{ guardJa(r) }}</td>
          </tr>
        </tbody>
      </table>
      <details class="mt-1 opacity-60"><summary class="cursor-pointer">決まり</summary><ul class="list-disc pl-4"><li v-for="x in RULES" :key="x">{{ x }}</li></ul></details>
    </details>

    <!-- ツリー: ○ は下へ、× は右へ。手を押すと開いて直せる -->
    <div class="rounded-xl border border-white/10 bg-black/20 p-3">
      <p class="mb-2 text-xs opacity-60">作り方は STEP の並びです。STEP を押すと開いて直せます。○ (狙いが付いた) は下へ、× (外れた) は右へ進みます。× の先の「自動で戻る」は、消えた MOD を付け直す STEP に自動で戻ります。</p>
      <div class="overflow-x-auto pb-2">
        <TreeBranch v-if="t.nodes.value[0]" :c="c" :t="t" :id="t.nodes.value[0].id" @focus="focus" />
      </div>
      <!-- どこからも来ない手 (行き先から外した手など) -->
      <div v-if="t.unplaced.value.length" class="mt-2 space-y-2">
        <p class="text-xs opacity-60">つながっていない STEP (どの ○ / × からも来ない)</p>
        <TreeNodeCard v-for="n in t.unplaced.value" :key="n.id" :c="c" :t="t" :node="n" :index="t.indexOf(n.id)" @focus="focus" />
      </div>
    </div>
  </div>
</template>
