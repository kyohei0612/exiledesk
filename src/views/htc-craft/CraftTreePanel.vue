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
import SocketPicker from "./SocketPicker.vue";
import { cardOfState, cardOfTarget } from "./item-card-data";
import { useCraftTree } from "./useCraftTree";
import { startStateOf } from "./sim-setup";
import { TREE_PRESETS } from "./tree-presets";
import { recordHistory } from "../../services/history";
import { openExternal } from "../../services/trade2/open-external";
import { zeroStart } from "./craft-settings";
import { finishedNumbers } from "./finished-numbers";
import { autoInputFor, pickAutoTree } from "./auto-pick";
import { startKindOf } from "./start-kind";
import type { RedoPlan } from "./redo-cost";
// 取り方の表 (お告げの正式名・守る価値) は RedoPlanTable.vue へ (2026-09-26 の分割)
import RedoPlanTable from "./RedoPlanTable.vue";
const ELEMENT_JA: Record<string, string> = { fire: "火", cold: "冷気", lightning: "雷", chaos: "混沌" };
const ALDUR_JA: Record<string, string> = { "passion-of-aldur": "アルダーの情熱", "ire-of-aldur": "アルダーの怒り", "breath-of-aldur": "アルダーの息吹", "betrayal-of-aldur": "アルダーの裏切り" };
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();
const c = props.c;
/**
 * 完成品の数値 (2026-10-03 その 4): 武器なら物理 / 元素 DPS・アタック/秒・クリティカル、防具ならアーマー / 回避力 / ES。
 * 狙いの段の下限〜上限 (その ilvl の一番上の段の一番上)、品質込み。装飾品など素の数値の無い物は出さない
 */
const finished = computed(() => {
  const d = c.data.value;
  const it = c.item.value;
  const base = it?.baseType ?? zeroStart.value.baseType;
  if (!d || !base || !c.targets.value.length) return null;
  return finishedNumbers(d, base, it?.itemLevel ?? zeroStart.value.itemLevel, it?.quality ?? zeroStart.value.quality ?? 20, c.targets.value);
});
const quality = computed(() => c.item.value?.quality ?? zeroStart.value.quality ?? 20);
const span = (a: number | null, b: number | null, digits = 0): string => (a == null || b == null ? "" : Math.abs(a - b) < 0.5 * 10 ** -digits ? a.toFixed(digits) : `${a.toFixed(digits)}〜${b.toFixed(digits)}`);
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
const autoReady = computed(() => canAuto.value && !c.diagBusy.value && c.treeRoute.value != null);
/** 始め方を選ぶ所を先に出す (選ぶまでツリーは出さない。2026-10-04 オーナー「順に表示していこうか、選択肢から」) */
const choosing = computed(() => !!c.routeOptions.value && c.treeRoute.value == null);
const ROUTE_JA = { fixed: "固定済みを買って途中から作る", self: "自分でフラクチャーして作る", white: "白のベースから作る" } as const;
const ROUTE_SUB = {
  fixed: "固定済み (フラクチャー済み) の素材を買って、残りを自動クラフト",
  self: "固定無しを買って自分で固定 (4 MOD なら深淵のエッセンス → 冒涜、3 MOD なら冒涜 → フラクチャーのオーブ 1/3) してから、残りを自動クラフト",
  white: "白のベースを 5 個。変成のオーブ・増強のオーブ (外れなら消去のオーブで消して増強し直す) で狙いが 1 つ付いたら 王者のオーブ → 高貴 → 冒涜 → フラクチャー。5 個で 1 個固定した後を自動クラフト",
} as const;
const routeCards = computed(() => {
  const o = c.routeOptions.value;
  if (!o) return [];
  return (["fixed", "self", "white"] as const).filter((k) => k !== "white" || o.white).map((k) => ({
    key: k,
    name: ROUTE_JA[k],
    sub: ROUTE_SUB[k],
    cost: o[k]?.cost ?? null,
    base: o[k]?.base ?? null,
    craft: o[k]?.craft ?? null,
    label: o[k]?.label ?? "出品が足りない",
    link: o[k]?.link ?? null,
    disabled: o[k]?.cost == null,
    recommended: o.recommended === k,
  }));
});
function chooseRoute(k: "fixed" | "self" | "white"): void {
  c.treeRoute.value = k;
}
/** 組んでいる最中 (候補を短く回して比べるので数秒かかる) */
const autoBusy = ref(false);
/** やり直しの費用から決めた取り方 ([[redo-cost.ts]]、自動で組んだ時に出す) */
const plan = ref<RedoPlan | null>(null);
/** 回して採った候補の名前と平均 (見積もりと違う候補が勝つこともある) */
const picked = ref<{ label: string; expected: number | null; done: number | null } | null>(null);
/** 組んでいる最中に開始が変わった (始め方の選び直しなど) → 終わってから組み直す */
let autoAgain = false;
/** 自動で組めなかった理由 (例外) */
const autoError = ref<string | null>(null);
async function loadAuto(): Promise<void> {
  if (!t.ctx.value) return;
  if (autoBusy.value) { autoAgain = true; return; }
  // 印は await の前に立てる (後ろだと、相場の取り直しを待つ間に 2 本目が入って並行し、古い開始の結果が勝つことがあった)
  autoBusy.value = true;
  autoError.value = null;
  try {
    // 組む前に相場を取り直す (カタリスト・お告げの今の値段で比べる)
    await c.refreshPrices();
    const ctx = t.ctx.value;
    if (!ctx) return;
    const fixedIds = c.fracturedTargets.value.map((x) => x.modId);
    // 白のベースから: 残りの組み方は固定した後の形で決め、回すのは何も付いていない形から (マジックの段 → 王者 → フラクチャー → 残り)
    const white = c.treeRoute.value === "white" && fixedIds.length === 1;
    const inp0 = autoInputFor(c, ctx, white ? startStateOf(c, fixedIds) : t.start.value, fixedIds);
    const inp = inp0 && white ? { ...inp0, whiteFracture: fixedIds[0]! } : inp0;
    if (!inp) return;
    const got = await pickAutoTree(inp, ctx, t.start.value);
    plan.value = got.plan;
    picked.value = { label: got.greater, expected: got.simExpected, done: got.simDone };
    t.setAll(got.nodes);
    // 履歴 (2026-09-30 オーナー「後からおかしいってなった時に即見れるように」): この条件で組み直せる入力と、組んだ結果
    recordHistory("craft-calc", "auto-tree", {
      base: c.base.value?.name ?? null,
      zeroStart: zeroStart.value,
      item: c.item.value,
      targets: c.targets.value,
      fractured: c.fracturedTargets.value,
      route: c.treeRoute.value,
      sockets: c.socketOn.value,
      start: t.start.value,
      picked: picked.value,
      plan: plan.value,
      nodes: got.nodes,
    });
  } catch (e) {
    autoError.value = `自動で組めませんでした: ${e instanceof Error ? e.message : String(e)}`;
    recordHistory("craft-calc", "auto-error", { error: autoError.value, base: c.base.value?.name ?? null, targets: c.targets.value, start: t.start.value });
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
// 複数ソースの形で見る (配列を返す getter だと毎回発火して、相場の取り直しのたびに組み直していた。2026-09-26 レビュー B)
// ソケットに差す物を変えたら (枠・クラフト MOD の上限・代が変わる) 組み直す (2026-09-26)
watch([() => JSON.stringify(t.start.value), autoReady, () => JSON.stringify(c.socketOn.value)], async ([, ok]) => {
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
/** ソケットに差す物の代 (1 回の作成に 1 度。高貴建て) */
const socketEx = computed(() => { const v = t.ctx.value?.socketCost ?? 0; return Number.isFinite(v) ? v : 0; });
const busyText = computed(() => autoBusy.value ? "組んでいます… (候補を比べ中)" : t.running.value ? `回しています… ${t.progress.value?.[0] ?? 0} / ${t.progress.value?.[1] ?? 0}` : c.diagBusy.value && canAuto.value ? "② が終わると自動で組む" : "");
</script>

<template>
  <!-- 始め方を選ぶ (選ぶと自動クラフトを組む) -->
  <div v-if="choosing" class="text-sm">
    <p class="mb-2 text-[13px] text-[var(--exile-color-text-secondary)]">どちらで作るかを選ぶと、その始め方で自動クラフトを組みます</p>
    <div class="grid gap-2 md:grid-cols-3">
      <div v-for="r in routeCards" :key="r.key" class="flex flex-col gap-1">
      <button
        type="button"
        class="flex-1 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40"
        :class="r.recommended ? 'border-emerald-400/70 bg-emerald-500/10 hover:bg-emerald-500/20' : 'border-white/15 bg-white/[0.03] hover:bg-white/[0.07]'"
        :disabled="r.disabled"
        @click="chooseRoute(r.key)"
      >
        <p class="flex items-center gap-2 font-bold">
          {{ r.name }}
          <span v-if="r.recommended" class="rounded-full bg-emerald-400 px-1.5 text-[10px] font-bold text-black">おすすめ</span>
        </p>
        <p class="mt-0.5 text-[11px] opacity-60">{{ r.sub }}</p>
        <p v-if="r.cost != null && r.base != null && r.craft != null" class="mt-1.5 text-[11px] tabular-nums opacity-80">ベース {{ c.money(r.base) }} + クラフト {{ c.money(r.craft) }} =</p>
        <p class="text-lg font-bold" :class="[r.recommended ? 'text-emerald-300' : '', r.base == null ? 'mt-1.5' : '']">{{ r.cost != null ? c.money(r.cost) : "—" }}</p>
        <p class="text-[11px] opacity-70">{{ r.label }}</p>
      </button>
      <!-- 検索の条件を取引所で見る (0 件でも。2026-10-04 オーナー「どんな条件で検索してヒットなかったのか知りたい」) -->
      <button v-if="r.link" type="button" class="self-start text-[11px] text-sky-300 underline hover:text-sky-200" @click="openExternal(r.link.url)">取引所で検索の条件を見る ({{ r.link.text }}) ↗</button>
      </div>
    </div>
  </div>
  <div v-else id="craft-tree-panel" class="flex items-start gap-3 text-sm">
   <div class="min-w-0 flex-1">
    <!-- 選んだ始め方 (選び直せる) -->
    <p v-if="c.routeOptions.value && c.treeRoute.value" class="mb-2 text-[12px]">
      始め方: <b class="text-amber-200">{{ ROUTE_JA[c.treeRoute.value] }}</b>
      <button type="button" class="ml-2 underline opacity-70 hover:opacity-100" :disabled="autoBusy" @click="c.treeRoute.value = null">選び直す</button>
    </p>
    <!-- 道具の列 -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <button type="button" class="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-bold text-black shadow hover:bg-amber-400 disabled:opacity-40" :disabled="t.running.value || autoBusy || !!t.blocked.value" @click="t.run()">
        ▶ シミュレーション ({{ t.runs.value.toLocaleString() }} 回)
      </button>
      <button v-if="canAuto" type="button" class="rounded-lg border border-emerald-500/60 px-3 py-1.5 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40" title="狙いの MOD から組み直す (やり直しの費用から取り方を決め、候補を回して比べる)" :disabled="autoBusy" @click="loadAuto()">自動で組み直す</button>
      <button type="button" class="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/5 disabled:opacity-40" title="ツリーを空にして、STEP 1 から自分で組む" :disabled="autoBusy" @click="startOver()">1 から組む</button>
      <button v-for="x in presets" :key="x.id" type="button" class="rounded-lg border border-sky-500/50 px-3 py-1.5 text-sky-200 hover:bg-sky-500/10" @click="loadPreset(x.id)">見本: {{ x.label }}</button>
      <button type="button" class="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/5" :class="showSettings ? 'bg-white/10' : ''" @click="showSettings = !showSettings">設定 {{ showSettings ? "▴" : "▾" }}</button>
      <SocketPicker :c="c" :category="c.base.value?.category" class="basis-full" />
      <span v-if="c.treeRoute.value == null && !autoBusy" class="ml-1 text-xs text-amber-200/80">② で探して始め方を選ぶと、自動で組みます (自分で組むなら「1 から組む」)</span>
      <span v-else-if="busyText" class="ml-1 text-xs text-amber-200/80"><span class="inline-block animate-pulse">●</span> {{ busyText }}</span>
      <span v-else-if="autoError" class="ml-1 text-xs text-rose-300">{{ autoError }}</span>
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
          <p class="text-[11px] opacity-60">1 個完成あたり <span class="opacity-70">全額 (失敗した回の分も込み)</span></p>
          <p class="text-2xl font-bold">{{ t.result.value.pDone > 0 ? c.money(t.result.value.perDone + t.baseEx.value / t.result.value.pDone) : "-" }}</p>
          <p v-if="(t.baseEx.value > 0 || t.result.value.socketCost > 0) && t.result.value.pDone > 0" class="text-[11px] opacity-60">
            初動 {{ c.money(t.baseEx.value / t.result.value.pDone) }}<template v-if="t.result.value.socketCost > 0"> + ソケット {{ c.money(t.result.value.socketCost / t.result.value.pDone) }}</template> + クラフト {{ c.money(t.result.value.perDone - t.result.value.socketCost / t.result.value.pDone) }}
          </p>
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

    <!-- 完成品の数値 (2026-10-03 その 4) -->
    <div v-if="finished" class="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
      <span class="opacity-60">完成品の数値 (品質 {{ quality }}%、狙いの段の下限〜上限)</span>
      <template v-if="finished.lo.aps != null">
        <span v-if="finished.lo.physDps != null">物理 DPS <b class="text-amber-100">{{ span(finished.lo.physDps, finished.hi.physDps, 1) }}</b></span>
        <span v-if="finished.hi.eleDps > 0">元素・混沌 DPS <b class="text-amber-100">{{ span(finished.lo.eleDps, finished.hi.eleDps, 1) }}</b></span>
        <span v-if="finished.hi.eleDps > 0 && finished.lo.physDps != null">合計 <b class="text-amber-100">{{ span((finished.lo.physDps ?? 0) + finished.lo.eleDps, (finished.hi.physDps ?? 0) + finished.hi.eleDps, 1) }}</b></span>
        <span>アタック/秒 {{ span(finished.lo.aps, finished.hi.aps, 2) }}</span>
        <span v-if="finished.lo.crit != null">クリティカル {{ span(finished.lo.crit, finished.hi.crit, 2) }}%</span>
      </template>
      <span v-if="finished.lo.armour != null">アーマー <b class="text-amber-100">{{ span(finished.lo.armour, finished.hi.armour) }}</b></span>
      <span v-if="finished.lo.evasion != null">回避力 <b class="text-amber-100">{{ span(finished.lo.evasion, finished.hi.evasion) }}</b></span>
      <span v-if="finished.lo.es != null">ES <b class="text-amber-100">{{ span(finished.lo.es, finished.hi.es) }}</b></span>
    </div>

    <!-- アルダーで重ねた獲得の MOD (2026-10-03 その 4) -->
    <p v-if="c.aldur.value" class="mb-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
      「{{ c.aldur.value.text }}」は {{ c.aldur.value.count }} つの MOD の合計 (同じ系統は 2 つ付かないので、{{ ELEMENT_JA[c.aldur.value.element] ?? c.aldur.value.element }}と別の元素の物を作り、
      最後に {{ ALDUR_JA[c.aldur.value.rune] ?? c.aldur.value.rune }} を差して全部{{ ELEMENT_JA[c.aldur.value.element] ?? c.aldur.value.element }}に変える)。
      ルーンの代はソケットの代に入れた。ソケットを 1 つ使い、ほかの元素の「獲得」も全部変わる。合計の内訳は分からないので、2 つとも合計 ÷ 個数の段で狙う
    </p>
    <!-- やり直しの費用から決めた取り方 (自動で組んだ時)。決まりは畳んで出す ([[RedoPlanTable.vue]]) -->
    <RedoPlanTable v-if="plan" :c="c" :t="t" :plan="plan" :picked="picked" :socket-ex="socketEx" />

    <!-- ツリー: ○ は下へ、× は右へ。手を押すと開いて直せる -->
    <div class="rounded-xl border border-white/[0.07] bg-black/20 p-3">
      <p class="mb-2 text-xs opacity-50">STEP を押すと開いて直せる。○ = 付いた → 下へ、× = 外れ → 右へ。「自動で戻る」= 消えた MOD を付け直す STEP へ</p>
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
       <button type="button" class="rounded-lg px-2 py-1" :class="cardDetail ? 'bg-white/15' : 'border border-white/15 hover:bg-white/5'" title="ティアとタグの小見出し (ゲームの Alt 表示)" @click="cardDetail = !cardDetail">{{ cardDetail ? "詳細を隠す" : "詳細" }}</button>
       <template v-if="cardMode === 'step' && mainLine.length">
         <button type="button" class="ml-auto rounded-lg border border-white/15 px-2 py-1 hover:bg-white/5" title="本線の前の STEP" @click="stepCard(-1)">◀</button>
         <span class="tabular-nums opacity-70">STEP {{ shownId ? t.indexOf(shownId) + 1 : "-" }}</span>
         <button type="button" class="rounded-lg border border-white/15 px-2 py-1 hover:bg-white/5" title="本線の次の STEP" @click="stepCard(1)">▶</button>
       </template>
     </div>
     <ItemCard :name="card.data.name" :base="card.data.base" :ilvl="card.data.ilvl" :quality="card.data.quality" :quality-label="card.data.qualityLabel" :implicits="card.data.implicits" :mods="card.data.mods" :socket="card.data.socket" :socket-effects="card.data.socketEffects" :detail="cardDetail" :footer="card.footer" />
     <p class="mt-1.5 text-[11px] opacity-40">金の帯 = 固定、青 = 狙い、赤 = 外れ、紫 = 冒涜、桃 = 樹 MOD</p>
    </aside>
  </div>
</template>
