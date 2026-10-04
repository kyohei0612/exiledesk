<!--
  PobCheck.vue — 火力チェック (2026-10-02)

  同梱の PoB でビルドを読み込み、ジェムやパワーチャージを変えて計算し直し、前と比べる。
  数字はゲーム内の表記 (敵の耐性・呪い・露出を割り戻した値)。計算は PoB のまま (memory: pob-ui-remake-direction)。
  オーナー「pob新しいやつはUIシンプルかつわかりやすく、色付きで今風で表示してくれ」
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { gemJa, openPob } from "../../services/pob-check/api";
import TabBar from "../../components/ui/TabBar.vue";
import BuildDiff from "./BuildDiff.vue";
import CoreStatsCard from "./CoreStatsCard.vue";
import SkillCompareTable from "./SkillCompareTable.vue";
import SkillTable from "./SkillTable.vue";
import GemGroupCard from "./GemGroupCard.vue";
import ItemSlotCard from "./ItemSlotCard.vue";
import TreeView from "./TreeView.vue";
import PricesTab from "./PricesTab.vue";
import { pairSkills } from "../../services/pob-check/build-diff";
import { fmtNum } from "./fmt";
import { usePobCheck, type PasteNote } from "./usePobCheck";

const { targetSkills, candidates, estimates, estimating, estimatingKey, estimateProgress, adopted, runEstimates, estimateQueue, showCached, cancelEstimates, queueActive, readyKeys, cancelling, adopt, target, targetFrom, targetInput, targetPlan, loadTarget, clearTarget, exportPlan, canReset, resetAll, lastSource, canReload, reload, loadedFrom, shareCode, changes, input, loading, busy, error, cur, skills, focus, focusKey, load, changeCharges,
  baseSkills, base, targetCode, changeConflux, clickNode, resetTreeToLoaded, power, powerProgress, computePower, treeNodes, loadSeq, groups, merged, changeGem, toggleGroup, changeItem, clearItem, restoreItem, changeWeaponSet } =
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

/** ゲームのビルドプランナーへの書き出し (自分 = 上のバー、相手 = 「火力の差」)。書いた後の文は 8 秒出す */
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
 * 2026-10-04 作り直し 2 (オーナー「導線が不細工。取り込むで一旦入れといて、読み込み完了でやっと比較するボタンが出るでいい (1 ページ目)。
 * そこで火力試算して、試算後に全て表示。表示ページには試算のボタンはいらん」「ここは火力の比較と内訳だけ。内訳はさっきの火力の中身を
 * ぶち込んどきゃおk、2 ページで終わり、2 個のタブだけ」)。
 *   1 ページ目 … 自分・相手をそれぞれ「取り込む」→ 両方そろったら「比較する」→ 試算の進み具合
 *   2 ページ目 (試算が済んだら) … 上のバー (スキルの DPS 自分 → 相手) と タブ 2 つ (火力の差 / 内訳 = 火力の中身)
 */
const compared = ref(!!cur.value && !!target.value && !!estimates.value);
/**
 * 自分の火力を見る (2026-10-04 オーナー「比較しかなくて自分のセルフチェックが無い」): 自分を取り込んだら 1 ページ目に「自分の火力を見る」。
 * 開くとスキルの表と 装備 / ジェム / パッシブツリー / 内訳 (火力の中身) / 値段 のタブ (変えるとすぐ計算し直して、取り込んだ時との差)
 */
const selfOpen = ref(false);
const opened = computed(() => !!cur.value && !!target.value && compared.value);
watch(() => !!cur.value, (has) => { if (!has) selfOpen.value = false; });
function openSelf(): void {
  selfOpen.value = true;
  selfTab.value = "items";
}
/**
 * 入口で選ぶ (2026-10-04 オーナー「ページ分けたらいいやん、最初 自分のセルフチェックと比較で」)。
 * null = 入口の 2 枚、"self" = 自分を取り込む → 取り込めたらそのまま開く、"compare" = 自分 + 相手 → 比較する
 */
const mode = ref<"self" | "compare" | null>(opened.value ? "compare" : null);
function choose(m: "self" | "compare"): void {
  mode.value = m;
  error.value = null;
}
/** 自分の火力を見る: 取り込めたら開く */
async function loadSelf(): Promise<void> {
  await load();
  if (cur.value && mode.value === "self") openSelf();
}
/** 取り込みに戻る (取り込んだ物は残す) */
function backToLoad(): void {
  selfOpen.value = false;
  compared.value = false;
}
const SELF_TABS = [
  { id: "items", label: "装備" },
  { id: "gems", label: "ジェム" },
  { id: "tree", label: "パッシブツリー" },
  { id: "core", label: "内訳" },
  { id: "prices", label: "値段" },
] as const;
type SelfTabId = (typeof SELF_TABS)[number]["id"];
const selfTab = ref<SelfTabId>("items");
/** 「値段」は一度開いたら v-show で保つ (取った値段を消さないため) */
const pricesOpened = ref(false);
watch(selfTab, (t) => { if (t === "prices") pricesOpened.value = true; });
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
// 相手を外した・リセットした → 1 ページ目に戻る
watch(() => !!cur.value && !!target.value, (both) => { if (!both) compared.value = false; });
const TABS = [
  { id: "diff", label: "火力の差" },
  { id: "core", label: "内訳" },
] as const;
type TabId = (typeof TABS)[number]["id"];
const tab = ref<TabId>("diff");

/** 比較する: 上のバーのスキルが相手に無ければ、両方にあるスキルのうち自分の DPS が一番高い物に替えてから試算。済んだら 2 ページ目へ */
async function onCompare(): Promise<void> {
  if (!cur.value || !target.value || estimating.value) return;
  const names = new Set(targetSkills.value.map((x) => x.s.name));
  if (focus.value && !names.has(focus.value.s.name)) {
    const shared = skills.value.filter((x) => names.has(x.s.name)).sort((a, b) => b.s.game.dps - a.s.game.dps)[0];
    if (shared) focusKey.value = shared.key;
  }
  await nextTick();
  // 両方にあるスキルを自分の DPS の高い順に。一番上が試算できたら開き、残りは裏で回す (まだの物は表で「試算中」で押せない)
  // (2026-10-04 オーナー「メイン DPS 順に並べて、他は裏で試算」「このルールなら 1 つ試算出来次第 UI 表示でおk」)。選び直した時は覚えからすぐ出す
  const keys = sharedKeys.value;
  const head = keys.slice(0, 1);
  if (keys[0]) focusKey.value = keys[0];
  cancelled.value = false;
  try {
    if (candidates.value.length) {
      for (const k of head) {
        if (cancelled.value) break;
        const row = skills.value.find((x) => x.key === k);
        if (!row) continue;
        compareStep.value = gemJa(row.s.name);
        await runEstimates(row);
      }
    }
  } finally {
    compareStep.value = "";
  }
  // 中止して上のスキルがまだなら 1 ページ目のまま
  if (cancelled.value && !showCached(focus.value?.key)) return;
  showCached(focus.value?.key);
  tab.value = "diff";
  compared.value = true;
  if (!cancelled.value) void estimateQueue(keys.slice(1));
}
/** 比較するの進み具合 (一番上のスキル) */
const compareStep = ref("");
const cancelled = ref(false);
function onCancel(): void {
  cancelled.value = true;
  cancelEstimates();
}
/**
 * 試算が回っている間、まだ済んでいない両方にあるスキル。表では「試算中」と出して押せない
 * (2026-10-04 オーナー「スキルのとこに試算まだ終わってなかったら試算中って出してクリックできないように」)。止まっていれば押せる (押すと試算)
 */
const pendingKeys = computed(() => (queueActive.value || estimating.value ? new Set(sharedKeys.value.filter((k) => !readyKeys.value.has(k))) : new Set<string>()));
/** 両方にあるスキル (相手にも同じ名前のスキルがある物)。自分の DPS の高い順 */
const sharedKeys = computed(() => {
  const names = new Set(targetSkills.value.map((x) => x.s.name));
  return skills.value.filter((x) => names.has(x.s.name)).sort((a, b) => b.s.game.dps - a.s.game.dps).map((x) => x.key);
});
/** スキルごとの表: 名前で突き合わせて 1 つの表に (決まりは build-diff.ts の pairSkills、両方にある物が先) */
const skillPairs = computed(() => pairSkills(skills.value, targetSkills.value));
// スキルを選び直した → 試算済みならすぐ出す、まだなら順番待ちの先頭へ。取り入れて自分が変わった → 全部取り直し (覚えは今の自分の物だけ使う)
watch(() => focus.value?.key, (k) => {
  if (!opened.value || !k || !candidates.value.length) return;
  if (!showCached(k)) void estimateQueue([k, ...sharedKeys.value]);
});
watch(cur, () => {
  if (!opened.value || !candidates.value.length || !focus.value) return;
  if (!showCached(focus.value.key)) void estimateQueue([focus.value.key, ...sharedKeys.value]);
});
/** 上の帯: 上のバーのスキルの相手の DPS (同じ名前のスキル) */
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
/**
 * パワーチャージのボタンの数。PoB の最大より上も選べるように 10 まで (2026-10-04 オーナー「チャージは 8、武器セット II のノードで最大を
 * 上げてる」: 武器セット II で最大を上げて溜め、I に戻しても溜めたチャージは残る。PoB は今の武器セットのノードで最大 5 と見る)。
 * PoB は指定した数を最大で止めない (8 を指定すると 8 個で計算する、2026-10-05 確認)
 */
const chargesMax = computed(() => Math.max(num("PowerChargesMax"), 10));
const chargesPobMax = computed(() => num("PowerChargesMax"));
/**
 * エレメンタルコンフラックスの属性 (2026-10-05 オーナー「コンフラックスの属性選べるように」)。ビルドにコンフラックスがある時だけ出す。
 * 本家の既定は「平均」(3 属性に 1/3 ずつ)。ゲームでは今の属性が順に変わるので、見たい時の属性を選ぶ
 */
const hasConflux = computed(() => !!cur.value?.groups.some((g) => g.enabled && g.gems.some((x) => x.name === "Elemental Conflux" && x.enabled)));
const conflux = computed(() => Number(cur.value?.config.input?.elementalConfluxElement ?? 1) || 1);
const CONFLUX_OPTIONS = [{ v: 1, ja: "平均" }, { v: 2, ja: "雷" }, { v: 3, ja: "冷気" }, { v: 4, ja: "火" }];
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
    <!-- 1 ページ目: 自分・相手を取り込む → 両方そろったら「比較する」→ 試算が済んだら 2 ページ目 (2026-10-04) -->
    <!-- 入口: 自分の火力を見る / 火力を比較する -->
    <section v-if="!opened && !(selfOpen && cur) && !mode" class="mx-auto mt-8 max-w-4xl">
      <p class="mb-4 text-center text-[13px] text-[var(--exile-color-text-secondary)]">何をしますか</p>
      <div class="grid gap-4 md:grid-cols-2">
        <button type="button" class="card p-6 text-left transition hover:border-amber-400/60 hover:bg-amber-500/[0.06]" @click="choose('self')">
          <p class="text-2xl">🔥</p>
          <p class="mt-2 text-lg font-bold text-amber-100">自分の火力を見る</p>
          <p class="mt-1 text-[12px] text-[var(--exile-color-text-secondary)]">自分のビルドを取り込んで、スキルごとの DPS と火力の中身を見る。装備・ジェム・パッシブツリーを変えるとすぐ計算し直す</p>
        </button>
        <button type="button" class="card p-6 text-left transition hover:border-sky-400/60 hover:bg-sky-500/[0.06]" @click="choose('compare')">
          <p class="text-2xl">⚔</p>
          <p class="mt-2 text-lg font-bold text-sky-100">火力を比較する</p>
          <p class="mt-1 text-[12px] text-[var(--exile-color-text-secondary)]">自分と相手 (忍者の上位の人など) を取り込んで、何を真似するとどれだけ火力が伸びるかを並べる</p>
        </button>
      </div>
    </section>

    <!-- 取り込み: 自分だけ (自分の火力を見る) / 自分 + 相手 (比較) -->
    <section v-else-if="!opened && !(selfOpen && cur)" class="card mx-auto mt-6 max-w-3xl p-5">
      <div class="mb-4 flex items-center gap-3">
        <button type="button" class="btn-link text-[12px]" :disabled="loading || estimating" @click="mode = null">← 選び直す</button>
        <p class="text-lg font-bold" :class="mode === 'compare' ? 'text-sky-100' : 'text-amber-100'">{{ mode === "compare" ? "⚔ 火力を比較する" : "🔥 自分の火力を見る" }}</p>
      </div>
      <form class="flex items-center gap-2" @submit.prevent="mode === 'self' ? loadSelf() : load()">
        <span class="w-[5.5rem] shrink-0 text-[12px] font-semibold text-[var(--exile-color-text-secondary)]">自分</span>
        <input v-model="input" type="text" placeholder="PoB コード (「Import/Export」の Generate) / https://poe.ninja/poe2/builds/... のキャラの URL" class="input flex-1" :disabled="estimating" />
        <button type="submit" class="btn w-28" :class="cur ? 'btn-outline' : 'btn-primary'" :disabled="loading || busy || estimating || !input.trim()">{{ loading && !cur ? "取り込み中…" : cur ? "取り込み直す" : "取り込む" }}</button>
      </form>
      <p v-if="cur" class="note mt-1 pl-[6rem] text-emerald-300">✓ {{ cur.char.ascendancy || cur.char.class }} Lv {{ cur.char.level }}<template v-if="loadedFrom"> ・ {{ loadedFrom }} から</template></p>
      <template v-if="mode === 'compare'">
      <form class="mt-3 flex items-center gap-2" @submit.prevent="loadTarget()">
        <span class="w-[5.5rem] shrink-0 text-[12px] font-semibold text-[var(--exile-color-text-secondary)]">相手</span>
        <input v-model="targetInput" type="text" placeholder="相手の PoB コード / poe.ninja の URL" class="input flex-1" :disabled="estimating" />
        <button type="submit" class="btn w-28" :class="target ? 'btn-outline' : 'btn-primary'" :disabled="loading || busy || estimating || !targetInput.trim() || !cur" :title="cur ? '' : '先に自分を取り込んでください'">{{ loading && cur ? "取り込み中…" : target ? "取り込み直す" : "取り込む" }}</button>
      </form>
      <p v-if="target" class="note mt-1 pl-[6rem] text-emerald-300">✓ {{ target.char.ascendancy || target.char.class }} Lv {{ target.char.level }}<template v-if="targetFrom"> ・ {{ targetFrom }} から</template></p>
      <p v-else-if="!cur" class="note mt-1 pl-[6rem]">先に自分を取り込むと、相手を取り込めます</p>
      </template>
      <div v-if="loading" class="mt-4 flex items-center gap-2 text-sm text-amber-200/80">
        <span class="h-2.5 w-2.5 animate-ping rounded-full bg-amber-300" />PoB で取り込んで計算しています (数秒)
      </div>
      <!-- 自分の火力を見る: 取り込み済みならもう一度開ける。比較: 両方そろったら比較する -->
      <div v-if="cur && !loading && (mode === 'self' || target)" class="mt-5 flex flex-col items-center gap-2">
        <button v-if="mode === 'self'" type="button" class="btn btn-primary h-10 px-10 text-base" :disabled="busy" @click="openSelf">🔥 自分の火力を見る</button>
        <button v-else type="button" class="btn btn-primary h-10 px-12 text-base" :disabled="busy || estimating || !!compareStep" @click="onCompare">{{ estimating || compareStep ? "試算中…" : "⚔ 比較する" }}</button>
        <p v-if="compareStep" class="flex items-center gap-2 text-[12px] text-amber-200/90">
          <span class="h-2 w-2 animate-ping rounded-full bg-amber-300" />DPS が一番高いスキルから試算しています: {{ compareStep }} ・ {{ estimateProgress }} (済んだら開いて、残りは裏で)
          <button type="button" class="btn btn-sm btn-outline" :disabled="cancelled" @click="onCancel">{{ cancelling ? "止めています…" : "中止" }}</button>
        </p>
      </div>
      <p v-if="error" class="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{{ error }}</p>
      <p class="note mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>自分のキャラは同梱の PoB でログインして取り込み、「Import/Export」のコードを貼る。</span>
        <button type="button" class="btn-link" @click="openPobApp">同梱の PoB を開く</button>
        <span v-if="pobMsg" class="text-[var(--exile-color-text-secondary)]">{{ pobMsg }}</span>
      </p>
    </section>

    <template v-else-if="cur">
      <!-- 今の使い方と 1 ページ目に戻る -->
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <span class="rounded-full px-2.5 py-0.5 text-[12px] font-bold" :class="opened ? 'bg-sky-500/15 text-sky-200' : 'bg-amber-500/15 text-amber-200'">{{ opened ? "⚔ 火力を比較する" : "🔥 自分の火力を見る" }}</span>
        <button type="button" class="btn-link text-[12px]" :disabled="loading || busy || estimating" @click="backToLoad">← 取り込みに戻る</button>
      </div>
      <p v-if="error" class="mb-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{{ error }}</p>
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

      <!-- 設定の列 (パワーチャージ・操作)。スキルの DPS は下のスキルごとの表で見る (2026-10-04 オーナー「上のバーはいらん、スキルごとを先頭に、右側の設定は消さんで」) -->
      <div class="mb-3">
        <div class="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
          <span v-if="busy" class="mr-auto flex items-center gap-1 text-[11px] text-amber-200/80"><span class="h-2 w-2 animate-ping rounded-full bg-amber-300" />計算中</span>
          <span v-else-if="estimating && estimatingKey !== focus?.key" class="mr-auto flex items-center gap-1 text-[11px] text-[var(--exile-color-text-tertiary)]" title="選び直した時にすぐ出せるように、両方にある他のスキルを順に試算しています"><span class="h-2 w-2 animate-pulse rounded-full bg-sky-300" />他のスキルを裏で試算中 {{ gemJa(skills.find((x) => x.key === estimatingKey)?.s.name ?? "") }} {{ estimateProgress }}
            <button type="button" class="ml-1 rounded border border-white/15 px-1.5 text-[10px] hover:bg-white/10" :disabled="cancelling" @click="onCancel">{{ cancelling ? "止めています…" : "中止" }}</button></span>
          <!-- パワーチャージ -->
          <div>
            <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">パワーチャージ</p>
            <div class="flex gap-0.5">
              <button
                v-for="n in chargesMax + 1"
                :key="n"
                type="button"
                class="h-6 w-6 rounded text-[11px] font-semibold tabular-nums transition-colors"
                :class="[n - 1 === charges ? 'bg-[var(--exile-color-accent-focus)] text-[var(--exile-color-bg-canvas)]' : 'bg-white/5 text-[var(--exile-color-text-secondary)] hover:bg-white/15', n - 1 > chargesPobMax && n - 1 !== charges ? 'opacity-50' : '']"
                :title="n - 1 > chargesPobMax ? `PoB の最大 (${chargesPobMax}) より上。武器セット II のノードで最大を上げて溜め、I に戻した時など` : undefined"
                :disabled="busy"
                @click="changeCharges(n - 1)"
              >{{ n - 1 }}</button>
            </div>
          </div>
          <!-- エレメンタルコンフラックスの属性 (ビルドにある時だけ) -->
          <div v-if="hasConflux">
            <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">エレメンタルコンフラックス</p>
            <div class="flex gap-0.5">
              <button
                v-for="o in CONFLUX_OPTIONS"
                :key="o.v"
                type="button"
                class="h-6 rounded px-2 text-[11px] font-semibold transition-colors"
                :class="o.v === conflux ? 'bg-[var(--exile-color-accent-focus)] text-[var(--exile-color-bg-canvas)]' : 'bg-white/5 text-[var(--exile-color-text-secondary)] hover:bg-white/15'"
                :title="o.v === 1 ? 'PoB の既定 (3 属性に 1/3 ずつ)' : `今の属性が${o.ja}の時`"
                :disabled="busy"
                @click="changeConflux(o.v)"
              >{{ o.ja }}</button>
            </div>
          </div>
          <!-- 操作 (1 列の小さい枠だけのボタン) -->
          <div class="flex items-center gap-1.5 self-end">
            <!-- 「今を比べる元に」は無し (2026-10-03 オーナー「比べる相手の欄を押した瞬間に比べる元になるので不要」)。差は読み込んだ時との差で固定 -->
            <!-- リセット: この画面を初めて開いた状態に (自分・相手・試算・入力欄を全部消す) -->
            <button type="button" class="btn btn-sm btn-outline" :disabled="!canReset || busy || loading || estimating" title="自分のビルド・比べる相手・試算・入力欄を全部消して、取り込みの画面に戻す" @click="resetAll">リセット</button>
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
                title="今のパッシブとジェム (変えた所も込み) を .build で保存 (保存先を選ぶ。ゲームの一覧に出すなら Documents/My Games/Path of Exile 2/BuildPlanner に置いてゲームを開き直す)"
                @click="onPlan('mine')"
              >ビルドプランナーに書き出す</button>
              <span v-if="planMsg" class="absolute right-0 top-full z-10 mt-1 max-w-[28rem] rounded bg-black/90 px-2 py-0.5 text-[11px] text-emerald-200">{{ planMsg }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 自分の火力を見る: スキルの表 (取り込んだ時との差) とタブ -->
      <template v-if="!opened">
        <div class="mb-4">
          <SkillTable :rows="skills" :before="baseSkills" :focus-key="focus?.key ?? null" @focus="(k) => (focusKey = k)" />
        </div>
        <p v-if="changes.length" class="mb-3 flex flex-wrap items-center gap-1">
          <span class="note">取り込んだ時から変えた所:</span>
          <span v-for="(c, i) in changes.slice(-8)" :key="i" class="rounded-full bg-sky-500/15 px-2 py-px text-[11px] text-sky-200">{{ c }}</span>
          <span v-if="changes.length > 8" class="note px-1">ほか {{ changes.length - 8 }} 件</span>
        </p>
        <TabBar :tabs="SELF_TABS" :model-value="selfTab" class="mb-3" aria-label="自分の火力" @update:model-value="selfTab = $event as SelfTabId" />
        <!-- 装備 -->
        <div v-show="selfTab === 'items'">
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
        <div v-show="selfTab === 'gems'">
          <p class="note mb-2">変えるとすぐ計算し直します<template v-if="merged > 0"> ・ 同じ中身の組 {{ merged }} 個はまとめました</template></p>
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
        <!-- ツリー -->
        <div v-if="selfTab === 'tree'" class="mb-6">
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
        <!-- 内訳: 火力の中身 (表で選んだスキル) -->
        <div v-if="selfTab === 'core'" class="mb-4">
          <CoreStatsCard v-if="focus?.s.core" :mine="focus.s.core" :target="null" :skill-ja="gemJa(focus.s.name)" :enemy-mine="cur.config.enemy" :enemy-target="null" expanded />
          <p v-else class="note">このスキルは内訳が取れません (ミニオンなど)</p>
        </div>
        <!-- 値段 (旧 忍者ビルドコピー)。値段は押した時だけ -->
        <div v-if="pricesOpened" v-show="selfTab === 'prices'">
          <PricesTab :mine-code="lastSource?.code ?? null" :target-code="targetCode" />
        </div>
      </template>

      <template v-else-if="target">
      <!-- スキルごと (先頭)。行を押すとそのスキルで 火力の差 / 内訳 を出す -->
      <section class="mb-4">
        <h2 class="sec-title">
          スキルごと
          <span class="sec-note">自分と相手のスキルを名前で合わせて並べる (片方だけの物は —)。押すとそのスキルで下の 火力の差 / 内訳 を出す</span>
        </h2>
        <SkillCompareTable :rows="skillPairs" :focus-key="focus?.key ?? null" :pending="pendingKeys" @focus="(k) => (focusKey = k)" />
      </section>

      <TabBar :tabs="TABS" :model-value="tab" class="mb-3" aria-label="火力の比較" @update:model-value="tab = $event as TabId" />

      <!-- 内訳: 火力の中身 (上のバーのスキル 自分 → 相手) を開いたまま -->
      <div v-if="tab === 'core'" class="mb-4">
        <CoreStatsCard
          v-if="focus?.s.core"
          :mine="focus.s.core"
          :target="targetFocus?.s.core ?? null"
          :skill-ja="gemJa(focus.s.name)"
          :enemy-mine="cur.config.enemy"
          :enemy-target="target.config.enemy"
          expanded
        />
        <p v-else class="note">このスキルは内訳が取れません (ミニオンなど)</p>
      </div>

      <!-- 火力の差 -->
      <div v-show="tab === 'diff'" class="mb-4">
        <BuildDiff
          :mine="cur"
          :target="target"
          :target-from="targetFrom"
          :focus="focus"
          :can-plan="!!targetPlan"
          :plan-msg="targetPlanMsg"
          :busy="busy || loading"
          :candidates="candidates"
          :estimates="estimates"
          :estimating="estimating && estimatingKey === focus?.key"
          :queued="queueActive"
          :cancelling="cancelling"
          :estimate-progress="estimateProgress"
          :adopted="adopted"
          @clear="clearTarget"
          @plan="onPlan('target')"
          @cancel="onCancel"
          @adopt="async (c, done) => done(await adopt(c))"
          @focus="(k) => (focusKey = k)"
        />

      </div>
      </template>

      <p class="note">
        数字はゲームのスキルの詳細と同じ書き方です (敵の耐性・呪い・露出は入れない。常時のバフは入れる)。「自動」のスキルは PoB が発動の頻度を計算しないので自分で撃った時の数字。計算は同梱の PoB のままです。
      </p>
    </template>
    </div>
  </div>
</template>
