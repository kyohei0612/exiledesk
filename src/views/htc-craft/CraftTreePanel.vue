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
import ItemCard from "./ItemCard.vue";
import { cardOfState, cardOfTarget } from "./item-card-data";
import { useCraftTree } from "./useCraftTree";
import { TREE_PRESETS } from "./tree-presets";
import { autoInputFor, pickAutoTree } from "./auto-pick";
import { startKindOf } from "./start-kind";
import { RULES, type RedoPlan } from "./redo-cost";
import { jaOfOmen, jaOfPriceKey } from "../../services/htc/labels";
import { CATALYSTS } from "../../services/htc/quality";
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
/**
 * 取り方の文言はゲームの正式名で (オーナー 2026-09-26:「お告げの名前しっかり機能したい。その MOD がサフィ産かプレ産か
 * 分かるでしょ、ちゃんとお告げの名前を書いて」)。プレ = 左側 (Sinistral)、サフィ = 右側 (Dextral)
 */
const omen = (id: string): string => jaOfOmen(id) ?? id;
const OMEN_EX: Record<string, string> = { prefix: "OmenofSinistralExaltation", suffix: "OmenofDextralExaltation" };
const OMEN_AN: Record<string, string> = { prefix: "OmenofSinistralAnnulment", suffix: "OmenofDextralAnnulment" };
const OMEN_NE: Record<string, string> = { prefix: "OmenofSinistralNecromancy", suffix: "OmenofDextralNecromancy" };
const OMEN_CR: Record<string, string> = { prefix: "OmenofSinistralCrystallisation", suffix: "OmenofDextralCrystallisation" };
const ORB_JA: Record<string, string> = { exalt: "高貴なオーブ", exalt_greater: "高貴なオーブ (上級)", exalt_perfect: "高貴なオーブ (完全)" };
const priceJa = (key: string): string => jaOfPriceKey(key, c.base.value ?? undefined) ?? key;
/** 何で狙うか (通貨 + お告げ) */
const howJa = (r: RedoPlan["rows"][number]): string => {
  switch (r.method) {
    case "chaos": return "カオスオーブ";
    case "exalt": {
      const cat = r.catalyst ? CATALYSTS.find((k) => k.tag === r.catalyst) : null;
      return `${ORB_JA[r.orb ?? "exalt"] ?? "高貴なオーブ"} + ${omen(OMEN_EX[r.side]!)}${cat ? ` + 触媒の高貴なお告げ (${cat.ja})` : ""}`;
    }
    case "desecrate": return `${priceJa(r.bone ?? "desecrate")} + ${omen(OMEN_NE[r.side]!)}`;
    case "essence": return "パーフェクトエッセンス (確定)";
    default: return r.method;
  }
};
/** 外れた時にどうするか */
const missJa = (r: RedoPlan["rows"][number]): string => {
  switch (r.method) {
    case "chaos": return "外れはカオスで打ち直し";
    case "exalt": return `外れは ${r.plainAnnul ? "消去のオーブ" : `${omen(OMEN_AN[r.side]!)} + 消去のオーブ`}${r.safe ? " (狙い以外は消えない)" : " (ほかの MOD を巻き込む)"}`;
    case "desecrate": return `外れは ${r.reroll === "overwrite" ? `${omen(OMEN_CR[r.side]!)} + エッセンスで上書き` : `${omen("OmenofLight")} + 消去のオーブ`}`;
    default: return "";
  }
};
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
/**
 * 右のアイテムの絵 (オーナー 2026-09-26:「POE2 のリングの画面みたいな日本語 MOD 版。完成図と、STEP ごとに何の MOD が
 * できるのか最新手順を表示し続ける。シミュレーター・自動の横が余っているのでそこに」)。
 * 押した STEP の時の形を出す。押していなければ本線 (○ をたどった) の最後の STEP = 最新手順
 */
const cardMode = ref<"step" | "target">("step");
/** 絵に段・タグの小見出しを出す (ゲームの Alt 表示) */
const cardDetail = ref(true);
const selected = ref<string | null>(null);
/** 本線: STEP 1 から ○ をたどった並び */
const mainLine = computed(() => {
  const out: string[] = [];
  const seen = new Set<string>();
  let id: string | null | undefined = t.nodes.value[0]?.id;
  while (id && !seen.has(id) && t.nodes.value.some((n) => n.id === id)) {
    seen.add(id); out.push(id);
    const g: string | null | undefined = t.nodes.value.find((n) => n.id === id)?.onHit;
    id = g === "done" || g === "auto" ? null : g;
  }
  return out;
});
const shownId = computed(() => (selected.value && t.nodes.value.some((n) => n.id === selected.value) ? selected.value : mainLine.value[mainLine.value.length - 1] ?? null));
/** 絵の中身 */
const card = computed(() => {
  if (cardMode.value === "target" || !shownId.value) return { data: cardOfTarget(c), footer: "完成図 (狙いの MOD)" };
  const id = shownId.value;
  const i = t.indexOf(id);
  const st = t.stateOf(id);
  const after = t.nodes.value.find((n) => n.id === id);
  return { data: cardOfState(c, st), footer: `STEP ${i + 1} を打つ前の形${after?.action ? ` → 次: ${t.labelOf(id)}` : ""}` };
});
/** 本線を前後に (押した STEP が本線に無ければ最後から) */
function stepCard(d: number): void {
  const line = mainLine.value;
  const cur = shownId.value ? line.indexOf(shownId.value) : -1;
  const next = Math.min(line.length - 1, Math.max(0, (cur < 0 ? line.length - 1 : cur) + d));
  selected.value = line[next] ?? null;
  cardMode.value = "step";
}
function selectStep(id: string): void { selected.value = id; cardMode.value = "step"; }
/** 設定 (予算・目標・回数・ベース代) を出すか */
const showSettings = ref(false);
/** 手ごとの費用 (割合つき、高い順) */
const perNode = computed(() => {
  const r = t.result.value;
  if (!r) return [];
  const total = Math.max(1, r.perNode.reduce((a, x) => a + x.cost, 0));
  return r.perNode.map((p, i) => ({ ...p, index: i, share: p.cost / total })).sort((a, b) => b.cost - a.cost);
});
const busyText = computed(() => autoBusy.value ? "組んでいます… (候補をいくつか回して比べています)" : t.running.value ? `回しています… ${t.progress.value?.[0] ?? 0} / ${t.progress.value?.[1] ?? 0}` : c.diagBusy.value && canAuto.value ? "上の ② の取得が終わってから自動で組みます" : "");
</script>

<template>
  <div id="craft-tree-panel" class="flex items-start gap-3 text-sm">
   <div class="min-w-0 flex-1">
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
      <label title="始め方で選んだ物の初動 (固定済みを買う値段、または自分でフラクチャーする費用の見込み) が入ります。予算と結果の額はこれ込み">初動 (素材・フラクチャー) <input v-model.number="t.baseDivine.value" type="number" min="0" step="1" class="num w-20" /> 神</label>
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
          <p class="text-[11px] opacity-60">平均 (完成した時) <span class="opacity-70">全額</span></p>
          <p class="text-2xl font-bold">{{ t.result.value.pDone > 0 ? c.money(t.result.value.expected + t.baseEx.value) : "-" }}</p>
          <p v-if="t.baseEx.value > 0 && t.result.value.pDone > 0" class="text-[11px] opacity-60">初動 {{ c.money(t.baseEx.value) }} + クラフト {{ c.money(t.result.value.expected) }}</p>
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
        <b>取り方</b> <span class="opacity-60">見込み {{ t.baseEx.value > 0 ? `初動 ${c.money(t.baseEx.value)} + クラフト ${c.money(plan.total)} = ` : "" }}<b class="opacity-100">{{ c.money(plan.total + t.baseEx.value) }}</b></span>
        <template v-if="picked"><span class="opacity-60"> ・ 候補を回して採ったのは「{{ picked.label }}」</span><template v-if="picked.expected != null"><span class="opacity-60">、平均 </span>{{ c.money(picked.expected) }}<span v-if="picked.done != null && picked.done < 0.9" class="text-rose-300"> (完成 {{ (picked.done * 100).toFixed(0) }}% しか無い)</span></template></template>
      </summary>
      <!-- 狙いごとの行 (オーナー 2026-09-26:「境目が分かりづらくてブス」→ 縞の行 + 数字は見出し付きの小さな枠) -->
      <div class="mt-2 overflow-hidden rounded-lg border border-white/[0.08]">
        <div v-for="(r, i) in plan.rows" :key="r.modId" class="grid grid-cols-[minmax(13rem,1fr)_minmax(18rem,1.6fr)_auto] items-center gap-x-4 px-3 py-2" :class="i % 2 ? 'bg-white/[0.03]' : 'bg-black/20'">
          <!-- 狙い -->
          <div class="flex items-center gap-2">
            <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold" :class="r.side === 'prefix' ? 'bg-sky-500/20 text-sky-200' : 'bg-fuchsia-500/20 text-fuchsia-200'">{{ r.side === "prefix" ? "プレ" : "サフィ" }}</span>
            <b>{{ c.stepTarget([r.modId]) }}</b>
          </div>
          <!-- 取り方 -->
          <div class="min-w-0">
            <p class="text-amber-100">{{ howJa(r) }}</p>
            <p class="opacity-60">{{ missJa(r) }}</p>
          </div>
          <!-- 数字 -->
          <div class="flex items-center gap-1.5 tabular-nums">
            <div class="w-[4.6rem] rounded bg-black/30 px-2 py-1 text-right"><p class="text-[10px] opacity-50">1 回</p><p>{{ c.money(r.perTry) }}</p></div>
            <div class="w-[4.6rem] rounded bg-black/30 px-2 py-1 text-right"><p class="text-[10px] opacity-50">当たる</p><p class="text-emerald-300">{{ pctHit(r.p) }}</p></div>
            <div class="w-[5.4rem] rounded bg-black/30 px-2 py-1 text-right"><p class="text-[10px] opacity-50">外れのやり直し</p><p :class="r.safe ? '' : 'text-amber-300'">{{ r.perMiss > 0 ? c.money(r.perMiss) : "-" }}</p></div>
            <div class="w-[5.4rem] rounded bg-amber-500/10 px-2 py-1 text-right"><p class="text-[10px] opacity-50">見込み</p><p class="font-bold text-amber-200">{{ c.money(r.expected) }}</p></div>
            <span class="w-[5.2rem] text-center text-[11px]" :class="r.expected > omenPrice(r.side) ? 'text-amber-200' : 'opacity-40'">{{ guardJa(r) }}</span>
          </div>
        </div>
      </div>
      <details class="mt-1 opacity-60"><summary class="cursor-pointer">決まり</summary><ul class="list-disc pl-4"><li v-for="x in RULES" :key="x">{{ x }}</li></ul></details>
    </details>

    <!-- ツリー: ○ は下へ、× は右へ。手を押すと開いて直せる -->
    <div class="rounded-xl border border-white/[0.07] bg-black/20 p-3">
      <p class="mb-2 text-xs opacity-50">作り方は STEP の並びです。STEP を押すと開いて直せます。○ (狙いが付いた) は下へ、× (外れた) は右へ進みます。× の先の「自動で戻る」は、消えた MOD を付け直す STEP に自動で戻ります。</p>
      <div class="overflow-x-auto pb-2">
        <TreeBranch v-if="t.nodes.value[0]" :c="c" :t="t" :id="t.nodes.value[0].id" @focus="focus" @select="selectStep" />
      </div>
      <!-- どこからも来ない手 (行き先から外した手など) -->
      <div v-if="t.unplaced.value.length" class="mt-2 space-y-2">
        <p class="text-xs opacity-60">つながっていない STEP (どの ○ / × からも来ない)</p>
        <TreeNodeCard v-for="n in t.unplaced.value" :key="n.id" :c="c" :t="t" :node="n" :index="t.indexOf(n.id)" @focus="focus" @select="selectStep" />
      </div>
    </div>
   </div>
   <!-- 右: アイテムの絵 (完成図 / 今の STEP の形)。上に貼り付いて、ツリーを進めても見え続ける -->
    <aside class="sticky top-2 w-[22rem] shrink-0">
     <div class="mb-1.5 flex items-center gap-1 text-xs">
       <button type="button" class="rounded-lg px-2 py-1" :class="cardMode === 'step' ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 hover:bg-white/5'" @click="cardMode = 'step'">STEP の時の形</button>
       <button type="button" class="rounded-lg px-2 py-1" :class="cardMode === 'target' ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 hover:bg-white/5'" @click="cardMode = 'target'">完成図</button>
       <button type="button" class="rounded-lg px-2 py-1" :class="cardDetail ? 'bg-white/15' : 'border border-white/15 hover:bg-white/5'" title="段とタグの小見出し (ゲームの Alt 表示)" @click="cardDetail = !cardDetail">{{ cardDetail ? "詳細を隠す" : "詳細" }}</button>
       <template v-if="cardMode === 'step' && mainLine.length">
         <button type="button" class="ml-auto rounded-lg border border-white/15 px-2 py-1 hover:bg-white/5" title="本線の前の STEP" @click="stepCard(-1)">◀</button>
         <span class="tabular-nums opacity-70">STEP {{ shownId ? t.indexOf(shownId) + 1 : "-" }}</span>
         <button type="button" class="rounded-lg border border-white/15 px-2 py-1 hover:bg-white/5" title="本線の次の STEP" @click="stepCard(1)">▶</button>
       </template>
     </div>
     <ItemCard :name="card.data.name" :base="card.data.base" :ilvl="card.data.ilvl" :quality="card.data.quality" :quality-label="card.data.qualityLabel" :implicits="card.data.implicits" :mods="card.data.mods" :detail="cardDetail" :footer="card.footer" />
     <p class="mt-1.5 text-[11px] opacity-40">STEP を押すとその時の形。金の帯 = 固定、青 = 狙い、赤 = 外れ (消す)、紫 = 冒涜、桃 = 樹 MOD</p>
    </aside>
  </div>
</template>
