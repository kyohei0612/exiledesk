<script setup lang="ts">
/**
 * CraftTreePanel.vue — 作り方のツリーと、予算を入れて回した結果 (2026-09-24)
 *
 * オーナー:「ツリー上、シミュレーター方式。完成までの道のりを○×で進める。進むにつれてツリーがデカくなる。
 * 最終的に予算入力してシミュレーターかけて確率と予算内にできるか表示する」。中身は [[useCraftTree.ts]]。
 */
import { computed, nextTick, ref, watch } from "vue";
import TreeBranch from "./TreeBranch.vue";
import TreeNodeCard from "./TreeNodeCard.vue";
import { useCraftTree } from "./useCraftTree";
import { TREE_PRESETS } from "./tree-presets";
import { autoInputFor, pickAutoTree } from "./auto-pick";
import { RULES, type RedoPlan } from "./redo-cost";
import { startKindOf } from "./start-kind";
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
const canAuto = computed(() => !!c.data.value && !!c.prices.value && c.targets.value.length > 0 && startKindOf(c).kind !== "unsafe");
/** 組んでいる最中 (候補を短く回して比べるので数秒かかる) */
const autoBusy = ref(false);
/** やり直しの費用から決めた取り方 ([[redo-cost.ts]]、自動で組んだ時に出す) */
const plan = ref<RedoPlan | null>(null);
/** 回して採った候補の名前と平均 (見積もりと違う候補が勝つこともある) */
const picked = ref<{ label: string; expected: number | null; done: number | null } | null>(null);
const methodJa: Record<string, string> = { chaos: "カオス", exalt: "高貴 + 側のお告げ", desecrate: "冒涜", essence: "エッセンス (確定)" };
const rerollJa = (r: RedoPlan["rows"][number]): string =>
  r.method === "desecrate" ? `${r.bone === "desecrate_ancient" ? "古代" : "普通の骨"}・外れは${r.reroll === "overwrite" ? "天体で上書き" : "光 + 消去"}`
  : r.method === "exalt" ? `${r.catalyst ? "触媒あり・" : ""}外れは側の消去${r.safe ? " (確定)" : " (巻き込む)"}` : r.method === "chaos" ? "外れは打ち直し" : "";
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
watch(() => [t.start.value, canAuto.value] as const, async ([, ok]) => {
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
</script>

<template>
  <div id="craft-tree-panel" class="text-sm">
    <!-- 作り方の設定 (ツリーの上。オーナー 2026-09-24:「成功確率は 8 割になるまで試行とか、ツリーの上部に必要な設定」) -->
    <div class="mb-2 flex flex-wrap items-center gap-3 rounded bg-white/5 p-2 text-xs">
      <b class="opacity-70">作り方の設定</b>
      <label>予算 <input v-model.number="t.budgetDivine.value" type="number" min="1" step="50" class="num w-20" /> 神</label>
      <label>目標の成功確率 <input v-model.number="t.targetPct.value" type="number" min="1" max="100" step="5" class="num w-14" /> %</label>
      <label title="始め方で選んだベースの値段が入ります。予算と結果の額はこれ込み">ベース代 <input v-model.number="t.baseDivine.value" type="number" min="0" step="1" class="num w-20" /> 神</label>
      <label>回す回数 <input v-model.number="t.runs.value" type="number" min="100" step="500" class="num w-20" /> 回</label>
    </div>
    <p class="mb-2 text-xs opacity-60">
      手を並べて作り方を組みます。手ごとに「打つ物」と「狙う MOD」、当たった時 (○) と外れた時 (×) にどこへ進むかを選びます。
      ○ は下へ、× は右へ枝が伸びます。消去の手は「自動」にすると、消えた物を見て戻り先を決めます。最後に回すと、完成の確率と費用が出ます。
    </p>
    <div v-if="presets.length || canAuto" class="mb-2 text-xs">
      <span class="opacity-60">見本のツリー:</span>
      <button type="button" class="ml-2 rounded border border-white/30 px-2" title="ツリーを空にして、手 1 から自分で組む" :disabled="autoBusy" @click="startOver()">1 から組む (空にする)</button>
      <button v-if="canAuto" type="button" class="ml-2 rounded border border-emerald-600 px-2" title="狙いの MOD から組む。側を選べる手を中心に、消去は自動で戻る" :disabled="autoBusy" @click="loadAuto()">{{ autoBusy ? "組んでいます (候補を回して比べています)…" : "この MOD から自動で組む" }}</button>
      <button v-for="x in presets" :key="x.id" type="button" class="ml-2 rounded border border-sky-600 px-2" @click="loadPreset(x.id)">{{ x.label }} を読み込む</button>
    </div>
    <!-- やり直しの費用から決めた取り方 (自動で組んだ時)。決まりは畳んで出す -->
    <details v-if="plan" class="mb-2 rounded border border-white/10 bg-white/[0.03] p-2 text-xs" open>
      <summary class="cursor-pointer opacity-70">
        やり直しの費用から決めた取り方 (見込みの合計 {{ c.money(plan.total) }})。
        <template v-if="picked">候補を回して採ったのは「{{ picked.label }}」<template v-if="picked.expected != null">、平均 {{ c.money(picked.expected) }}<span v-if="picked.done != null && picked.done < 0.9" class="text-rose-300"> (完成 {{ (picked.done * 100).toFixed(0) }}% しか無い。どの候補も届かなかった)</span></template></template>
      </summary>
      <table class="mt-1 w-full">
        <tr class="opacity-50"><th class="text-left font-normal">狙い</th><th class="text-left font-normal">取り方</th><th class="text-right font-normal">1 回</th><th class="text-right font-normal">当たる</th><th class="text-right font-normal">外れ 1 回のやり直し</th><th class="text-right font-normal">見込み</th></tr>
        <tr v-for="r in plan.rows" :key="r.modId" class="border-t border-white/5">
          <td class="py-0.5">{{ c.stepTarget([r.modId]) }} <span class="opacity-50">({{ r.side === "prefix" ? "プレ" : "サフィ" }})</span></td>
          <td>{{ methodJa[r.method] }} <span class="opacity-60">{{ rerollJa(r) }}</span></td>
          <td class="text-right">{{ c.money(r.perTry) }}</td>
          <td class="text-right">{{ pctHit(r.p) }}</td>
          <td class="text-right" :class="r.safe ? '' : 'text-amber-300'">{{ r.perMiss > 0 ? c.money(r.perMiss) : "-" }}</td>
          <td class="text-right">{{ c.money(r.expected) }}</td>
        </tr>
      </table>
      <details class="mt-1 opacity-60"><summary class="cursor-pointer">決まり</summary><ul class="list-disc pl-4"><li v-for="x in RULES" :key="x">{{ x }}</li></ul></details>
    </details>
    <!-- 枝の図: ○ は下へ、× は右へ。横に広がるので横にスクロール -->
    <div class="overflow-x-auto pb-2">
      <TreeBranch v-if="t.nodes.value[0]" :c="c" :t="t" :id="t.nodes.value[0].id" @focus="focus" />
    </div>
    <!-- どこからも来ない手 (行き先から外した手など) -->
    <div v-if="t.unplaced.value.length" class="mt-2 space-y-2">
      <p class="text-xs opacity-60">つながっていない手 (どの ○ / × からも来ない)</p>
      <TreeNodeCard v-for="n in t.unplaced.value" :key="n.id" :c="c" :t="t" :node="n" :index="t.indexOf(n.id)" @focus="focus" />
    </div>

    <!-- 回した結果 -->
    <div class="mt-3 rounded border border-amber-500/40 bg-black/20 p-2 text-xs">
      <button type="button" class="rounded bg-amber-600/80 px-3 py-1 font-bold disabled:opacity-40" :disabled="t.running.value || !!t.blocked.value" @click="t.run()">
        {{ t.running.value ? `回しています… ${t.progress.value?.[0] ?? 0} / ${t.progress.value?.[1] ?? 0}` : `シミュレーション (${t.runs.value.toLocaleString()} 回)` }}
      </button>
      <span v-if="t.blocked.value" class="ml-2 text-rose-300">{{ t.blocked.value }}</span>
      <template v-if="t.result.value">
        <!-- 大きな数字 4 つ -->
        <div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div class="rounded bg-white/5 p-2">
            <p class="opacity-50">完成する</p>
            <p class="text-xl font-bold text-emerald-300">{{ pct(t.result.value.pDone) }}</p>
          </div>
          <div class="rounded bg-white/5 p-2">
            <p class="opacity-50">予算 {{ t.budgetDivine.value }} 神以内で完成</p>
            <p class="text-xl font-bold" :class="(t.result.value.pBudget ?? 0) >= t.targetPct.value / 100 ? 'text-emerald-300' : 'text-amber-300'">{{ pct(t.result.value.pBudget ?? 0) }}</p>
          </div>
          <div class="rounded bg-white/5 p-2">
            <p class="opacity-50">目標 {{ t.targetPct.value }}% に要る額</p>
            <p class="text-xl font-bold text-amber-300">{{ t.needForTarget.value != null ? c.money(t.needForTarget.value) : "届かない" }}</p>
          </div>
          <div class="rounded bg-white/5 p-2">
            <p class="opacity-50">平均 (完成した時)</p>
            <p class="text-xl font-bold">{{ t.result.value.pDone > 0 ? c.money(t.result.value.expected + t.baseEx.value) : "-" }}</p>
          </div>
        </div>
        <p v-if="t.result.value.pDone > 0" class="mt-1 opacity-60">
          半分の確率で {{ c.money(t.result.value.p50 + t.baseEx.value) }} / 8 割で {{ c.money(t.result.value.p80 + t.baseEx.value) }} / 9 割で {{ c.money(t.result.value.p90 + t.baseEx.value) }} 以内
          <span v-if="t.baseEx.value > 0">(ベース代 {{ c.money(t.baseEx.value) }} 込み。クラフトだけなら平均 {{ c.money(t.result.value.expected) }})</span>
        </p>
        <p v-for="s in t.result.value.stops" :key="s.reason" class="mt-1 text-rose-300">止まった {{ pct(s.p) }}: {{ s.reason }}</p>
        <!-- 手ごと (1 回の完成あたり)。費用の大きい手が分かるように -->
        <table class="mt-2 w-full">
          <tr class="opacity-50"><th class="text-left font-normal">手</th><th class="text-right font-normal">打つ回数</th><th class="text-right font-normal">費用</th><th class="text-left font-normal pl-3">割合</th></tr>
          <tr v-for="(p, i) in t.result.value.perNode" :key="p.id" class="border-t border-white/5">
            <td class="py-0.5">手 {{ i + 1 }} <span class="opacity-60">{{ t.labelOf(p.id) }}</span></td>
            <td class="text-right">{{ p.tries.toFixed(1) }} 回</td>
            <td class="text-right">{{ c.money(p.cost) }}</td>
            <td class="pl-3">
              <div class="h-2 rounded bg-amber-500/60" :style="{ width: `${Math.round(100 * p.cost / Math.max(1, t.result.value.perNode.reduce((a, x) => a + x.cost, 0)))}%` }" />
            </td>
          </tr>
        </table>
      </template>
    </div>
  </div>
</template>
