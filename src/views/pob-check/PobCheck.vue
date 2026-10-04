<!--
  PobCheck.vue — 火力チェック (2026-10-02)

  同梱の PoB でビルドを読み込み、ジェムやパワーチャージを変えて計算し直し、前と比べる。
  数字はゲーム内の表記 (敵の耐性・呪い・露出を割り戻した値)。計算は PoB のまま (memory: pob-ui-remake-direction)。
  オーナー「pob新しいやつはUIシンプルかつわかりやすく、色付きで今風で表示してくれ」
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { gemJa, openPob } from "../../services/pob-check/api";
import TabBar from "../../components/ui/TabBar.vue";
import DiffBadge from "./DiffBadge.vue";
import SkillTable from "./SkillTable.vue";
import GemGroupCard from "./GemGroupCard.vue";
import ItemSlotCard from "./ItemSlotCard.vue";
import TreeView from "./TreeView.vue";
import BuildDiff from "./BuildDiff.vue";
import CoreStatsCard from "./CoreStatsCard.vue";
import PricesTab from "./PricesTab.vue";
import BreakdownTab from "./BreakdownTab.vue";
import type { ModAction } from "./BreakdownModList.vue";
import type { ModRow } from "../../services/pob-check/breakdown";
import { fmtNum } from "./fmt";
import { usePobCheck, type PasteNote } from "./usePobCheck";

const { chain, chainLoading, chainError, chainFresh, refreshChain, targetSkills, candidates, estimates, estimating, estimateProgress, estimatesStale, adopted, runEstimates, adopt, target, targetFrom, targetInput, targetPlan, targetCode, loadTarget, clearTarget, exportPlan, canReset, resetAll, lastSource, canReload, reload, loadedFrom, shareCode, changes, clickNode, resetTreeToLoaded, power, powerProgress, computePower, treeNodes, loadSeq, input, loading, busy, error, cur, base, baseAt, skills, baseSkills, focus, focusBase, focusKey, groups, merged, load, changeGem, toggleGroup, changeCharges, changeItem, clearItem, restoreItem, changeWeaponSet } =
  usePobCheck();


/**
 * 自分のキャラ: PoB でログインして取り込み、Import/Export のコードを上の欄に貼る (2026-10-02 オーナー決定)。
 * アプリのログイン (POESESSID) では PoE2 の装備・パッシブは読めない (Web サイト側に口が無く、公式 API は OAuth の登録が要る)
 */
const pobMsg = ref("");
async function openPobApp(): Promise<void> {
  pobMsg.value = "PoB を開いています…";
  try {
    await openPob();
    pobMsg.value = "PoB で「Import/Export Build」→ ログインして取り込み → 「Generate」のコードをコピーして上の欄へ";
  } catch (e) {
    pobMsg.value = String(e);
  }
}

/** 共有: 今のビルドの PoB コードをコピー */
const shareMsg = ref("");
async function onShare(): Promise<void> {
  // 失敗の理由は usePobCheck が error (上の帯) に出す
  const code = await shareCode();
  shareMsg.value = code ? (changes.value.length ? "変えた所も込みでコピーしました" : "コピーしました") : "できませんでした";
  setTimeout(() => (shareMsg.value = ""), 4000);
}

/** ゲームのビルドプランナーへの書き出し (自分 = 上のバー、相手 = 「相手との差」)。書いた後の文は 8 秒出す */
const planMsg = ref("");
const targetPlanMsg = ref("");
async function onPlan(which: "mine" | "target"): Promise<void> {
  const box = which === "mine" ? planMsg : targetPlanMsg;
  box.value = "書いています…";
  const m = await exportPlan(which);
  box.value = m ?? "できませんでした";
  setTimeout(() => (box.value = ""), 8000);
}

/**
 * 2026-10-04 作り直し (オーナー「火力チェックに特化した UI に。比べる相手を入れたら UI がガラッと変わる感じ。火力を比較する / 自分の火力を見る
 * で選択式、取り込み後に UI が開く。自分のなら自分のだけ、比較なら 2 つ入れてそれぞれ読み込みボタン、終わったら UI が開く」「ごりっと変えよう」)。
 *   mode = null … 入口 (2 枚のカードから選ぶ)
 *   mode あり・まだ読み込めていない … 読み込みの欄 (自分 1 つ / 比較は 自分 + 相手 の 2 つ)
 *   読み込めた … 自分 = 装備 / ジェム / ツリー / 内訳 / 値段、比較 = 火力の差 (主役) + 同じタブ
 */
type Mode = "self" | "compare";
const mode = ref<Mode | null>(target.value ? "compare" : cur.value ? "self" : null);
const opened = computed(() => (mode.value === "self" ? !!cur.value : mode.value === "compare" ? !!cur.value && !!target.value : false));
function choose(m: Mode): void {
  mode.value = m;
  tab.value = m === "compare" ? "diff" : "items";
}
/** 入口に戻る (読み込んだ物は全部消す) */
function backToEntry(): void {
  resetAll();
  mode.value = null;
}
const ALL_TABS = [
  { id: "diff", label: "火力の差" },
  { id: "items", label: "装備" },
  { id: "gems", label: "ジェム" },
  { id: "tree", label: "パッシブツリー" },
  { id: "breakdown", label: "内訳", hint: "上のバーのスキルの DPS がどう出ているか (式と、増加 / 増しの出所)" },
  { id: "prices", label: "値段" },
] as const;
type TabId = (typeof ALL_TABS)[number]["id"];
/** 自分の火力を見る時は「火力の差」は出さない */
const TABS = computed(() => ALL_TABS.filter((t) => mode.value === "compare" || t.id !== "diff"));
const tab = ref<TabId>(mode.value === "compare" ? "diff" : "items");
// 比較で 2 つとも読み込めたら「火力の差」を開く
watch(opened, (o) => { if (o && mode.value === "compare") tab.value = "diff"; });
/**
 * 「値段」(旧 忍者ビルドコピー、2026-10-03 統合) は一度開いたら v-show で保つ (取った値段を消さないため)。
 * 開くまでは作らない (解析はローカルだが、使わない人の分まで走らせない)
 */
const pricesOpened = ref(false);
watch(tab, (t) => {
  if (t === "prices") pricesOpened.value = true;
});
/**
 * 火力の内訳 (2026-10-03): 内訳のタブを開いている間、自分を変えた / 上のバーのスキルを変えた たびに取り直す (計算中は待つ。
 * 変更の列 (run) に並ぶので、変えた後の数字で取れる)。要素の行の操作は既存の操作に流す
 */
watch(
  () => [tab.value, chainFresh.value, busy.value, loading.value, focus.value?.key] as const,
  ([t, fresh, b, l]) => {
    if (t === "breakdown" && !fresh && !b && !l) void refreshChain();
  },
  { immediate: true },
);
function onModAction(m: ModRow, action: ModAction): void {
  const s = m.src;
  if (action === "clear" && s.slot) void clearItem(s.slot);
  else if (action === "restore" && s.slot) void restoreItem(s.slot);
  else if (action === "node" && typeof s.id === "number") void clickNode(s.id, 1);
  else if (action === "gem-off" && s.gi && s.gj) void changeGem(s.gi, s.gj, "enabled", false);
  else if (action === "charges0") void changeCharges(0);
}
/** 相手を読み込んだら「火力の差」を開く */
async function onLoadTarget(): Promise<void> {
  await loadTarget();
  if (target.value) tab.value = "diff";
}
/** 比較の上の帯: 上のバーのスキルの相手の DPS (同じ名前のスキル) */
const targetFocus = computed(() => {
  const f = focus.value;
  if (!f) return null;
  return targetSkills.value.filter((x) => x.s.name === f.s.name).sort((a, b) => b.s.game.dps - a.s.game.dps)[0] ?? null;
});

// 読み込む前の案内は 1 行だけ (2026-10-03 見た目の整理。前は 読み込む / 変える / 比べる / そろえる の 4 枚のカードだった)

const num = (k: string): number => {
  const v = cur.value?.stats[k];
  return typeof v === "number" ? v : 0;
};
/** 実効のパワーチャージ (PoB が使っている数。Min のあるビルドは 0 にしても Min 個が効く) */
const charges = computed(() => cur.value?.config.powerCharges ?? 0);
const chargesMax = computed(() => Math.max(num("PowerChargesMax"), 3));
const sameAsBase = computed(() => cur.value === base.value);
/** ツリーに渡す寄与 (毎レンダーで新しい物を作ると TreeView が描き直し続けるので computed) */
const treePower = computed(() => (power.value ? { label: power.value.label, nodes: power.value.nodes, stale: power.value.of !== cur.value } : null));
const treeSkillOptions = computed(() => skills.value.map((x) => ({ key: x.key, name: x.s.name + (x.s.game.minionName ? ` → ${x.s.game.minionName}` : "") })));

/** 差し替えの結果をカードに返す */
async function onPaste(slot: string, text: string, done: (r: PasteNote | null, err?: string) => void): Promise<void> {
  try {
    done(await changeItem(slot, text));
  } catch (e) {
    done(null, e instanceof Error ? e.message : String(e));
  }
}

const statChips = computed(() => {
  if (!cur.value) return [];
  const list: Array<{ label: string; value: string; cls: string }> = [
    { label: "ライフ", value: fmtNum(num("Life")), cls: "text-rose-300" },
    { label: "マナ", value: fmtNum(num("Mana")), cls: "text-sky-300" },
  ];
  if (num("EnergyShield") > 0) list.push({ label: "ES", value: fmtNum(num("EnergyShield")), cls: "text-cyan-200" });
  if (num("Ward") > 0) list.push({ label: "ワード", value: fmtNum(num("Ward")), cls: "text-amber-200" });
  // 残りがマイナスになるビルドがある (PoB が武器セットの両方の予約を足す)。その時は合計だけ
  const left = num("SpiritUnreserved");
  list.push(
    left >= 0
      ? { label: "スピリット残り", value: `${Math.round(left)} / ${Math.round(num("Spirit"))}`, cls: "text-violet-200" }
      : { label: "スピリット", value: `${Math.round(num("Spirit"))}`, cls: "text-violet-200" },
  );
  return list;
});
const resists = computed(() =>
  cur.value
    ? [
        { label: "火", v: num("FireResist"), cls: "text-orange-300" },
        { label: "冷", v: num("ColdResist"), cls: "text-sky-300" },
        { label: "雷", v: num("LightningResist"), cls: "text-yellow-200" },
        { label: "混", v: num("ChaosResist"), cls: "text-fuchsia-300" },
      ]
    : [],
);
</script>

<template>
  <!--
    2026-10-03 頭の整理 (オーナー「UI のブスさをまとめてきれいにシンプルに見やすい状態に」):
      上の帯 = 画面名だけ (他の画面と同じ TabBar)。読み込み系 (自分のコード / 比べる相手 / 同梱の PoB を開く) は 1 つの薄い枠に、
      操作のボタン (リセット / 共有 / ビルドプランナーに書き出す) は上のバーの右に 1 列の小さい枠だけのボタン。
      主役は「スキルの DPS と差」(上のバーの大きな数字とスキルの表)。読み込む前の案内は 1 行
  -->
  <div class="flex h-full flex-col overflow-hidden">
    <TabBar icon="🔥" title="火力チェック" />
    <div class="min-h-0 flex-1 overflow-auto p-4 @container">
    <!-- 入口: 選ぶ (2026-10-04) -->
    <section v-if="!mode" class="mx-auto mt-8 max-w-4xl">
      <p class="mb-4 text-center text-[13px] text-[var(--exile-color-text-secondary)]">何をしますか</p>
      <div class="grid gap-4 md:grid-cols-2">
        <button type="button" class="card group p-6 text-left transition hover:border-amber-400/60 hover:bg-amber-500/[0.06]" @click="choose('self')">
          <p class="text-2xl">🔥</p>
          <p class="mt-2 text-lg font-bold text-amber-100">自分の火力を見る</p>
          <p class="mt-1 text-[12px] text-[var(--exile-color-text-secondary)]">自分のビルドを読み込んで、装備・ジェム・パッシブツリーを変えるとスキルの DPS がどう変わるかを見る</p>
        </button>
        <button type="button" class="card group p-6 text-left transition hover:border-sky-400/60 hover:bg-sky-500/[0.06]" @click="choose('compare')">
          <p class="text-2xl">⚔</p>
          <p class="mt-2 text-lg font-bold text-sky-100">火力を比較する</p>
          <p class="mt-1 text-[12px] text-[var(--exile-color-text-secondary)]">自分と相手 (忍者の上位の人など) の 2 つを読み込んで、何を真似するとどれだけ火力が伸びるかを並べる</p>
        </button>
      </div>
    </section>

    <!-- 読み込み: 自分 1 つ / 比較は 自分 + 相手。読み込めたら画面が開く -->
    <section v-else-if="!opened" class="card mx-auto mt-6 max-w-3xl p-5">
      <div class="mb-4 flex items-center gap-3">
        <button type="button" class="btn-link text-[12px]" :disabled="loading" @click="backToEntry">← 選び直す</button>
        <p class="text-lg font-bold" :class="mode === 'compare' ? 'text-sky-100' : 'text-amber-100'">{{ mode === "compare" ? "⚔ 火力を比較する" : "🔥 自分の火力を見る" }}</p>
      </div>
      <form class="flex items-center gap-2" @submit.prevent="load()">
        <span class="w-[5.5rem] shrink-0 text-[12px] font-semibold text-[var(--exile-color-text-secondary)]">{{ mode === "compare" ? "自分" : "ビルド" }}</span>
        <input v-model="input" type="text" placeholder="PoB コード (「Import/Export」の Generate) / https://poe.ninja/poe2/builds/... のキャラの URL" class="input flex-1" :disabled="!!cur && mode === 'compare'" />
        <span v-if="cur && mode === 'compare'" class="w-28 text-center text-[12px] font-semibold text-emerald-300">✓ 読み込み済み</span>
        <button v-else type="submit" class="btn btn-primary w-28" :disabled="loading || !input.trim()">{{ loading && !cur ? "読み込み中…" : "読み込む" }}</button>
      </form>
      <p v-if="cur && mode === 'compare'" class="note mt-1 pl-[6rem]">{{ cur.char.ascendancy || cur.char.class }} Lv {{ cur.char.level }}<template v-if="loadedFrom"> ・ {{ loadedFrom }} から</template></p>
      <form v-if="mode === 'compare'" class="mt-3 flex items-center gap-2" @submit.prevent="onLoadTarget()">
        <span class="w-[5.5rem] shrink-0 text-[12px] font-semibold text-[var(--exile-color-text-secondary)]">相手</span>
        <input v-model="targetInput" type="text" placeholder="相手の PoB コード / poe.ninja の URL" class="input flex-1" />
        <button type="submit" class="btn btn-outline btn-accent w-28" :disabled="loading || busy || !targetInput.trim() || !cur" :title="cur ? '' : '先に自分を読み込んでください'">{{ loading && cur ? "読み込み中…" : "読み込む" }}</button>
      </form>
      <p v-if="mode === 'compare' && !cur" class="note mt-1 pl-[6rem]">先に自分を読み込むと、相手を読み込めます</p>
      <div v-if="loading" class="mt-4 flex items-center gap-2 text-sm text-amber-200/80">
        <span class="h-2.5 w-2.5 animate-ping rounded-full bg-amber-300" />PoB で読み込んで計算しています (数秒)
      </div>
      <p v-if="error" class="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{{ error }}</p>
      <p class="note mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>自分のキャラは同梱の PoB でログインして取り込み、「Import/Export」のコードを貼る。</span>
        <button type="button" class="btn-link" @click="openPobApp">同梱の PoB を開く</button>
        <span v-if="pobMsg" class="text-[var(--exile-color-text-secondary)]">{{ pobMsg }}</span>
      </p>
    </section>

    <template v-else-if="cur">
      <!-- 開いた画面の頭: どちらの使い方か・選び直す・読み込み中・エラー -->
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <span class="rounded-full px-2.5 py-0.5 text-[12px] font-bold" :class="mode === 'compare' ? 'bg-sky-500/15 text-sky-200' : 'bg-amber-500/15 text-amber-200'">{{ mode === "compare" ? "⚔ 火力を比較する" : "🔥 自分の火力を見る" }}</span>
        <button type="button" class="btn-link text-[12px]" :disabled="loading || busy" @click="backToEntry">← 選び直す</button>
        <span v-if="loading" class="flex items-center gap-1 text-[12px] text-amber-200/80"><span class="h-2 w-2 animate-ping rounded-full bg-amber-300" />読み込み中</span>
        <p v-if="error" class="w-full rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{{ error }}</p>
      </div>
      <!-- キャラの札 -->
      <div class="mb-3 flex flex-wrap items-center gap-1.5">
        <span class="chip bg-white/[0.07]">
          <span class="chip-value text-[13px]">{{ cur.char.ascendancy || cur.char.class }}</span>
          <span class="chip-label">Lv {{ cur.char.level }}</span>
        </span>
        <span v-for="c in statChips" :key="c.label" class="chip">
          <span class="chip-label">{{ c.label }}</span>
          <span class="chip-value" :class="c.cls">{{ c.value }}</span>
        </span>
        <span class="chip">
          <span class="chip-label">耐性</span>
          <span v-for="r in resists" :key="r.label" class="chip-value" :class="r.cls">{{ r.label }}{{ Math.round(r.v) }}</span>
        </span>
        <span v-if="cur.stats.LowLife" class="chip bg-rose-500/20 font-semibold text-rose-200">低ライフ</span>
        <span v-if="loadedFrom" class="note ml-1">{{ loadedFrom }} から</span>
        <!-- PoB コードは同じ文字列を読み直すだけで最新は取れないので、poe.ninja と保存したビルドの時だけ -->
        <button
          v-if="lastSource && canReload"
          type="button"
          class="btn btn-sm btn-ghost"
          :disabled="loading || busy"
          title="同じ所から最新を読み直し、今の状態を比べる元に残す (ゲームで装備を変えた後に、どれだけ変わったか)。poe.ninja はあちらの更新待ちで古いことがある"
          @click="reload"
        >{{ loading ? "読み込み中…" : "↻ 読み込み直す" }}</button>
      </div>

      <!-- 上のバー: スキルの DPS と差 (主役)・変えた所・パワーチャージ・操作 (スクロールしても上に残す。変えたらすぐ差が見えるように) -->
      <div class="sticky -top-4 z-20 -mx-4 mb-4 border-b border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-canvas)]/95 px-4 pb-3 pt-3 backdrop-blur">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div v-if="focus" class="min-w-0">
            <select
              :value="focus.key"
              class="max-w-[16rem] rounded border border-transparent bg-transparent text-[11px] text-[var(--exile-color-text-secondary)] outline-none hover:border-white/15"
              title="上に出すスキルを選ぶ (初めは DPS が一番高いスキル)"
              @change="focusKey = ($event.target as HTMLSelectElement).value"
            >
              <option v-for="x in skills" :key="x.key" :value="x.key">{{ gemJa(x.s.name) }}{{ x.s.game.minionName ? ` → ${x.s.game.minionName}` : "" }} の DPS</option>
            </select>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-black leading-none tabular-nums text-amber-200">{{ fmtNum(focus.s.game.dps) }}</span>
              <DiffBadge :now="focus.s.game.dps" :before="focusBase?.game.dps" size="lg" />
              <!-- 比較: 相手の同じスキル -->
              <template v-if="mode === 'compare' && targetFocus">
                <span class="mx-1 text-lg text-[var(--exile-color-text-tertiary)]">→ 相手</span>
                <span class="text-3xl font-black leading-none tabular-nums text-sky-200">{{ fmtNum(targetFocus.s.game.dps) }}</span>
                <DiffBadge :now="targetFocus.s.game.dps" :before="focus.s.game.dps" size="lg" />
              </template>
              <span v-if="busy" class="flex items-center gap-1 text-[11px] text-amber-200/80"><span class="h-2 w-2 animate-ping rounded-full bg-amber-300" />計算中</span>
            </div>
          </div>
          <!-- 変えた所 -->
          <div class="min-w-0 flex-1">
            <p class="note">
              比べる元: {{ baseAt }}<template v-if="!sameAsBase && focusBase"> ({{ fmtNum(focusBase.game.dps) }})</template>
            </p>
            <div v-if="changes.length" class="mt-0.5 flex flex-wrap gap-1">
              <span v-for="(c, i) in changes.slice(-6)" :key="i" class="rounded-full bg-sky-500/15 px-2 py-px text-[11px] text-sky-200">{{ c }}</span>
              <span v-if="changes.length > 6" class="note px-1">ほか {{ changes.length - 6 }} 件</span>
            </div>
            <p v-else class="note mt-0.5">下の 装備 / ジェム / パッシブツリー で変えると、ここに変えた所と差が出ます</p>
          </div>
          <!-- パワーチャージ -->
          <div>
            <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">パワーチャージ</p>
            <div class="flex gap-0.5">
              <button
                v-for="n in chargesMax + 1"
                :key="n"
                type="button"
                class="h-6 w-6 rounded text-[11px] font-semibold tabular-nums transition-colors"
                :class="n - 1 === charges ? 'bg-[var(--exile-color-accent-focus)] text-[var(--exile-color-bg-canvas)]' : 'bg-white/5 text-[var(--exile-color-text-secondary)] hover:bg-white/15'"
                :disabled="busy"
                @click="changeCharges(n - 1)"
              >{{ n - 1 }}</button>
            </div>
          </div>
          <!-- 操作 (1 列の小さい枠だけのボタン) -->
          <div class="flex items-center gap-1.5 self-end">
            <!-- 「今を比べる元に」は無し (2026-10-03 オーナー「比べる相手の欄を押した瞬間に比べる元になるので不要」)。差は読み込んだ時との差で固定 -->
            <!-- リセット: この画面を初めて開いた状態に (自分・相手・試算・入力欄を全部消す) -->
            <button type="button" class="btn btn-sm btn-outline" :disabled="!canReset || busy || loading" title="自分のビルド・比べる相手・試算・入力欄を全部消して、この画面を開いた直後の状態に戻す" @click="resetAll">リセット</button>
            <div class="relative">
              <button type="button" class="btn btn-sm btn-outline" title="今のビルド (変えた所も込み) を PoB のコードにしてコピー。PoB や poe.ninja 以外の人にも渡せる" @click="onShare">共有 (PoB コード)</button>
              <span v-if="shareMsg" class="absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded bg-black/80 px-2 py-0.5 text-[11px] text-sky-200">{{ shareMsg }}</span>
            </div>
            <!-- 自分の今のビルド (変えた所も込み) をゲームのビルドプランナー (.build) に -->
            <div class="relative">
              <button
                type="button"
                class="btn btn-sm btn-outline"
                :disabled="busy || loading"
                title="今のパッシブとジェム (変えた所も込み) を Documents/My Games/Path of Exile 2/BuildPlanner に .build で書く。ゲームのビルドプランナーの一覧に出る (ゲームを開き直す)"
                @click="onPlan('mine')"
              >ビルドプランナーに書き出す</button>
              <span v-if="planMsg" class="absolute right-0 top-full z-10 mt-1 max-w-[28rem] rounded bg-black/90 px-2 py-0.5 text-[11px] text-emerald-200">{{ planMsg }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 火力の中身 (上のバーのスキル。比較の時は 自分 → 相手) -->
      <CoreStatsCard
        v-if="focus?.s.core"
        class="mb-4"
        :mine="focus.s.core"
        :target="mode === 'compare' ? targetFocus?.s.core ?? null : null"
        :skill-ja="gemJa(focus.s.name)"
      />
      <!-- スキル (自分の火力を見る時の主役)。比較の時は「火力の差」のスキルごとの比べに出すので、ここには出さない -->
      <div v-if="mode !== 'compare'" class="mb-5">
        <SkillTable :rows="skills" :before="baseSkills" :focus-key="focus?.key ?? null" @focus="(k) => (focusKey = k)" />
      </div>

      <!-- 変える所 (装備 / ジェム / ツリー / 相手との差 / 値段)。タブの見た目は上の帯と同じ部品 (画面名は無し) -->
      <TabBar :tabs="TABS" :model-value="tab" class="mb-3" aria-label="火力チェックの中身" @update:model-value="tab = $event as TabId" />

      <!-- 装備 -->
      <div v-show="tab === 'items'">
      <p class="note mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>ゲームで Ctrl+C したアイテムを貼ると入れ替えて計算し直します (日本語のままで OK)</span>
        <span class="inline-flex overflow-hidden rounded-lg border border-white/15 text-[11px] font-semibold">
          <button
            v-for="n in [1, 2] as const"
            :key="n"
            type="button"
            class="h-6 px-2.5"
            :class="cur.weaponSet === n ? 'bg-[var(--exile-color-accent-focus)] text-[var(--exile-color-bg-canvas)]' : 'text-[var(--exile-color-text-secondary)] hover:bg-white/10'"
            :disabled="busy"
            @click="changeWeaponSet(n)"
          >武器セット {{ n === 1 ? "I" : "II" }}</button>
        </span>
      </p>
      <div class="mb-6 grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3 @[100rem]:grid-cols-4">
        <ItemSlotCard
          v-for="s in cur.items"
          :key="s.slot"
          :entry="s"
          :active-set="cur.weaponSet"
          :disabled="busy"
          @paste="(text, done) => onPaste(s.slot, text, done)"
          @clear="clearItem(s.slot)"
          @restore="restoreItem(s.slot)"
        />
      </div>
      </div>

      <!-- ジェム -->
      <div v-show="tab === 'gems'">
      <p class="note mb-2">
        変えるとすぐ計算し直します<template v-if="merged > 0"> ・ 同じ中身の組 {{ merged }} 個はまとめました</template>
      </p>
      <div class="mb-6 grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
        <GemGroupCard
          v-for="g in groups"
          :key="g.i"
          :group="g"
          :disabled="busy"
          @gem="(j, field, value) => changeGem(g.i, j, field, value)"
          @group="(en) => toggleGroup(g.i, en)"
        />
      </div>
      </div>

      <!-- 内訳 (2026-10-03): 上のバーのスキルの DPS がどう出ているか。式の鎖と、増加 / 増しの出所 (外す / オフ もここから) -->
      <div v-if="tab === 'breakdown'">
        <BreakdownTab
          :chain="chain?.chain ?? null"
          :loading="chainLoading"
          :error="chainError"
          :fresh="chainFresh"
          :focus="focus"
          :busy="busy || loading"
          :has-target="!!target"
          @act="onModAction"
          @go-diff="tab = 'diff'"
        />
      </div>

      <!-- 火力の差 (比較の時だけ) -->
      <div v-if="tab === 'diff' && mode === 'compare'">
        <BuildDiff
          v-if="target"
          :mine="cur"
          :target="target"
          :target-from="targetFrom"
          :focus="focus"
          :can-plan="!!targetPlan"
          :plan-msg="targetPlanMsg"
          :busy="busy || loading"
          :candidates="candidates"
          :estimates="estimates"
          :estimating="estimating"
          :estimate-progress="estimateProgress"
          :estimates-stale="estimatesStale"
          :adopted="adopted"
          :mine-skills="skills"
          :target-skills="targetSkills"
          @clear="clearTarget"
          @plan="onPlan('target')"
          @estimate="runEstimates"
          @adopt="async (c, done) => done(await adopt(c))"
          @focus="(k) => (focusKey = k)"
        />

      </div>

      <!-- 値段 (旧 忍者ビルドコピー)。自分 = 読んだコード、相手 = 比べる相手のコード。値段は押した時だけ -->
      <div v-if="pricesOpened" v-show="tab === 'prices'">
        <PricesTab :mine-code="lastSource?.code ?? null" :target-code="targetCode" />
      </div>

      <!-- ツリー -->
      <div v-if="tab === 'tree'" class="mb-6">
        <TreeView
          :nodes="treeNodes"
          :state="cur.tree"
          :base-alloc="base && base !== cur ? base.tree.alloc : undefined"
          :power="treePower"
          :power-progress="powerProgress"
          :skill-options="treeSkillOptions"
          :default-target="focus?.key ?? ''"
          :fit-key="loadSeq"
          :busy="busy"
          @power="computePower"
          @toggle="async (id, attr, done) => done(await clickNode(id, attr))"
          @reset="resetTreeToLoaded"
        />
      </div>

      <p class="note">
        数字はゲームのスキルの詳細と同じ書き方です (敵の耐性・呪い・露出は入れない。常時のバフは入れる)。「自動」のスキルは PoB が発動の頻度を計算しないので自分で撃った時の数字。計算は同梱の PoB のままです。
      </p>
    </template>
    </div>
  </div>
</template>
