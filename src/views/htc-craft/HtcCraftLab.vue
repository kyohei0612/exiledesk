<script setup lang="ts">
/**
 * HtcCraftLab.vue — クラフトのお試し計算機 (2026-09-22)
 *
 * オーナー指示:「マジで簡易的な計算機的な奴でいい。動きが見たい。イメージとあってるかどうか」。
 * **リリース前の動作確認用**で、体裁は最小限。中身は useHtcCraft.ts。
 */
import { computed, nextTick, ref, watch, watchEffect } from "vue";
import TabBar from "../../components/ui/TabBar.vue";
import { htcCraftTab, pendingCraft, pendingCraftPaste, type HtcCraftTab } from "../../state/app-nav";
import { PRESETS, ZERO_PRESETS } from "./presets";
import { zeroStart } from "./craft-settings";
import { useHtcCraft } from "./useHtcCraft";
import { usePicker } from "./usePicker";
import DiagnosisCard from "./DiagnosisCard.vue";
import CraftTreePanel from "./CraftTreePanel.vue";
import BasePicker from "./BasePicker.vue";
// 「詳しく」(開発ビルドだけ) は LabDevDetails.vue へ (2026-09-26 の分割)
import LabDevDetails from "./LabDevDetails.vue";
// 2026-10-03 統合: 上位プレイヤー MOD 一覧 (旧サイドバーの「上位プレイヤーMOD一覧」craft-v2) はこの画面のタブに
// (オーナー「被ってる機能・要らん機能を整理、似た物は一緒に」)。中身は CraftDiscoveryV2B.vue のまま、ロジックは触らない
import CraftDiscoveryV2B from "../CraftDiscoveryV2B.vue";

/**
 * 上のタブ。lab = 計算機 / top-mods = 上位プレイヤーの MOD。どちらを開いているかは state/app-nav.ts (他の画面や Ctrl+2 から
 * 「上位プレイヤーの MOD のタブへ」と飛べるように)。計算機の中身は v-show で保ち、上位プレイヤーの MOD は一度開いたら
 * v-show で保つ (開くまでは描かない: 一覧は重いので、計算機だけ使う人に最初から描かせない。取得 (state/craft-v2-store) も
 * 開いた時に始まる。2026-10-07 起動時にやめた: キャッシュの集計で起動直後に 3〜7 秒固まっていた)
 */
const TABS: readonly { id: HtcCraftTab; label: string; hint: string }[] = [
  { id: "lab", label: "計算機", hint: "貼るか選ぶかして、作り方と費用を出す" },
  { id: "top-mods", label: "上位プレイヤーの MOD", hint: "poe.ninja の上位の人の装備の MOD。選んで「クラフトへ」で計算機に渡す" },
];
const topModsOpened = ref(htcCraftTab.value === "top-mods");
// 2 つのタブは 1 つの枠 (1 つのスクロール) を使うので、タブごとの位置を覚えて戻す (2026-10-10)
const scroller = ref<HTMLElement | null>(null);
const scrollOf = new Map<HtcCraftTab, number>();
watch(htcCraftTab, async (next, prev) => {
  if (scroller.value && prev) scrollOf.set(prev, scroller.value.scrollTop);
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = scrollOf.get(next) ?? 0;
});
watch(htcCraftTab, (t) => {
  if (t === "top-mods") topModsOpened.value = true;
});

const c = useHtcCraft();
const pk = usePicker();
watchEffect(() => pk.useData(c.data.value));

/**
 * 入口。**開いた時は何も計算していません** (オーナー指示 2026-09-23)。
 * 先に「真似るのか、0 から決めるのか」を選ばせます ── ここが決まらないと、出す数字が
 * まるで別物になるからです。
 *   paste … poe.ninja / ゲームからコピーした物を真似る
 *   base  … ベースと狙う MOD を自分で並べる
 */
//
// **開発ビルドも入口から始める** (オーナー 2026-09-24:「クラフト計算機のデフォ表示ずっとニーモニックリングの所
// 表示してるから直してくれ」)。09-23 に開発ビルドだけ見本を並べて始めていたのをやめた。見本は入口の先のボタンで選ぶ。
const DEV = import.meta.env.DEV;
const door = ref<"none" | "paste" | "base">("none");
// 入口の「前回の続きから」は 2026-10-04 に外した (オーナー「前回の云々はいらん、削除でおｋ」)
const text = ref("");
const picked = ref<string | null>(null);

/**
 * 画面は「診断の結果 (短く) → 1 手ずつ」だけ。MOD 解析とベース診断は一気に通す
 * (オーナー 2026-09-24:「MOD 解析も別に表示せずに直通で通していい。結果だけ分かりやすく簡潔に」)。
 * 細かい表 (MOD の段・忍者の道・ベース候補) は「詳しく」に畳む。
 */
/**
 * 入力欄を開いているか。解析したらたたんで 1 行にし、結果を上に寄せる (「貼り直す」で開く)。
 * 2026-09-24 リリースに向けた見直し: 解析後も貼り付け欄が大きく残り、結果が下に押し出されていた
 */
const inputOpen = ref(true);
async function reread(t: string): Promise<void> {
  await c.run(t);
  if (c.base.value) {
    inputOpen.value = false;
  }
}
function pick(id: string): void {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  c.resumeFlow.value = false;
  picked.value = id;
  text.value = p.text;
  void reread(p.text);
}

/** 入口へ戻る。計算結果は捨てる (中途半端に残すと、今どの物の話か分からなくなる) */
function backToDoor(): void {
  fromList.value = null;
  c.resumeFlow.value = false;
  c.reset();
  pk.clear();
  door.value = "none";
  picked.value = null;
  text.value = "";
  inputOpen.value = true;
}
async function openBaseDoor(): Promise<void> {
  door.value = "base";
  await c.ensureData();
}
/** 0 から組む見本を並べる (計算はしない。押すのは人) */
const zeroPicked = ref<string | null>(null);
function pickZero(id: string): void {
  const z = ZERO_PRESETS.find((x) => x.id === id);
  const d = c.data.value;
  if (!z || !d) return;
  zeroPicked.value = id;
  pk.level.value = z.itemLevel;
  pk.chooseBase(d, z.baseType);
  pk.picks.value = z.picks.map((x) => ({ ...x }));
  zeroStart.value = { ...zeroStart.value, quality: z.quality, qualityTag: z.qualityTag, fixedPrefix: z.fixedPrefix, fixedSuffix: z.fixedSuffix };
}
async function runPicked(): Promise<void> {
  if (!pk.baseName.value || !pk.cls.value) return;
  zeroStart.value = { ...zeroStart.value, baseType: pk.baseName.value, itemLevel: pk.level.value };
  await c.runPicked(pk.baseName.value, pk.cls.value, pk.targets.value);
  if (c.base.value) inputOpen.value = false;
}
/**
 * 上位プレイヤー MOD 一覧の「クラフトへ」で来た時 (2026-09-29): ベースから選ぶの道に、ベース・アイテムレベル・狙う MOD を入れて
 * そのまま作り方まで組む。計算機で作れなかった MOD は上に断りを出す
 */
const fromList = ref<{ baseJa: string; count: number; skipped: string[] } | null>(null);
/** 火力チェックの「この装備を作る」で来た時 (2026-10-03、その 5): 相手の装備の文面を「コピーを貼る」に入れて解析まで */
watch(
  pendingCraftPaste,
  (t) => {
    if (!t) return;
    pendingCraftPaste.value = null;
    backToDoor();
    door.value = "paste";
    c.resumeFlow.value = false;
    text.value = t;
    void reread(t);
  },
  { immediate: true },
);
watch(
  pendingCraft,
  async (plan) => {
    if (!plan) return;
    pendingCraft.value = null;
    backToDoor();
    door.value = "base";
    const d = await c.ensureData();
    pk.level.value = plan.itemLevel;
    pk.chooseBase(d, plan.baseType);
    pk.picks.value = plan.picks.map((x) => ({ ...x }));
    fromList.value = { baseJa: pk.allBases.value.find((b) => b.en === plan.baseType)?.ja ?? plan.baseType, count: plan.picks.length, skipped: plan.skipped };
    if (!plan.picks.length) return;
    await runPicked();
    // 取引所で始め方を探す (②) は押した時だけの物なので、ここでは探さずに作り方 (白から) まで進める。探すのは入口に戻らず後からでもできる
    if (c.base.value) {
      c.phase.value = "done";
      c.diagBusy.value = false;
    }
  },
  { immediate: true },
);

/** たたんだ入力欄の 1 行 */
const inputSummary = computed(() => {
  const it = c.item.value;
  if (it) return `${it.baseText ?? it.baseType} / ilvl ${it.itemLevel ?? "?"}${it.quality ? ` / 品質 ${it.quality}%` : ""} / MOD ${c.rows.value.length + c.skipped.value.length} 個`;
  const ja = pk.allBases.value.find((b) => b.en === pk.baseName.value)?.ja ?? pk.baseName.value ?? "";
  return `${ja} / ilvl ${pk.level.value} / 狙う MOD ${pk.picks.value.length} 個`;
});

</script>

<template>
  <!-- 中身は幅 1400px で固定 (オーナー 2026-09-26:「ウィンドウ小さくしても大きくしても変わらない感じで。ウィンドウによって崩れる」)。
       狭い窓では横にスクロール、広い窓では余白 -->
  <!-- 窓の大きさへの合わせ込みはアプリ全体でする (App.vue の fitZoom)。ここは最小の窓の幅いっぱい -->
  <div class="h-full flex flex-col overflow-hidden text-sm">
   <!-- タブ (2026-10-03 統合): 計算機 / 上位プレイヤーの MOD。帯の見た目は components/ui/TabBar.vue で 4 画面共通。画面名はここに 1 回だけ -->
   <TabBar art="craft" title="クラフト計算機" :tabs="TABS" :model-value="htcCraftTab" @update:model-value="htcCraftTab = $event as HtcCraftTab" />

   <!-- 中身は 1 つの枠に (2026-10-10 UI 見直し。カレンシーランキング・取引履歴と同じ形)。タブごとにスクロールの位置を覚える -->
   <div class="flex-1 min-h-0 flex p-4">
   <div ref="scroller" class="g-panel flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
   <!-- 上位プレイヤーの MOD (旧 craft-v2 の画面をそのまま)。一度開いたら v-show で保つ (選んだアセ・部位・チェックが消えないように) -->
   <CraftDiscoveryV2B v-if="topModsOpened" v-show="htcCraftTab === 'top-mods'" />

   <!-- 計算機 -->
   <div v-show="htcCraftTab === 'lab'" class="px-5 py-2">
    <!-- 画面名は上の帯に出しているので、ここは説明だけ (2026-10-03) -->
    <p class="mb-3 text-[12px] text-[var(--exile-color-text-secondary)]">
      作りたいアイテムを貼るか、ベースと MOD を選ぶと、ベースの買い方・完成品との比べ・作り方ごとの費用と成功確率を出します。
    </p>

    <!-- 入口。開いた時はここだけ。何も計算していない -->
    <div v-if="door === 'none'" class="mb-4 grid gap-3 sm:grid-cols-2">
      <button type="button" class="g-plain rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-4 text-left transition-colors hover:border-[var(--exile-color-accent-focus)]" @click="door = 'paste'">
        <div class="mb-1 text-[13px] font-bold text-amber-300">コピーを貼る</div>
        <div class="note">poe.ninja やゲームから Ctrl+C した物をそのまま貼る。<b>既にある物を真似る</b>時。</div>
      </button>
      <button type="button" class="g-plain rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-4 text-left transition-colors hover:border-[var(--exile-color-accent-focus)]" @click="openBaseDoor()">
        <div class="mb-1 text-[13px] font-bold text-amber-300">ベースから選ぶ</div>
        <div class="note">ベースと狙う MOD を自分で並べる。<b>0 から決める</b>時。</div>
      </button>
    </div>

    <button
      v-else
      type="button"
      class="mb-3 text-xs opacity-60 hover:opacity-100"
      @click="backToDoor()"
    >← 入口に戻る</button>

    <!-- 解析した後は入力欄をたたむ -->
    <div v-if="door !== 'none' && !inputOpen && c.base.value" class="mb-3 flex items-center gap-3 rounded bg-white/5 px-3 py-2 text-xs">
      <span class="opacity-60">{{ door === "paste" ? "貼り付け" : "ベースから" }}:</span>
      <b>{{ inputSummary }}</b>
      <button type="button" class="ml-auto rounded border border-[var(--exile-color-border-subtle)] px-2 py-0.5 hover:border-amber-400" @click="inputOpen = true">
        {{ door === "paste" ? "貼り直す" : "選び直す" }}
      </button>
    </div>

    <!-- 入口 A: 貼り付け -->
    <div v-if="door === 'paste' && (inputOpen || !c.base.value)" class="mb-4">
      <div class="mb-2 flex flex-wrap gap-2 text-xs">
        <span class="opacity-50">見本:</span>
        <button
          v-for="p in PRESETS"
          :key="p.id"
          class="rounded border px-2 py-0.5"
          :class="picked === p.id ? 'border-amber-400 text-amber-300' : 'border-[var(--exile-color-border-subtle)] opacity-70'"
          @click="pick(p.id)"
        >{{ p.label }}</button>
      </div>
      <textarea
        v-model="text"
        rows="10"
        placeholder="ここに貼り付け"
        class="mb-2 w-full rounded border border-[var(--exile-color-border-subtle)] bg-black/20 p-2 font-mono text-xs"
        spellcheck="false"
      />
      <div class="flex items-center gap-3">
        <button
          class="btn btn-primary"
          :disabled="c.loading.value || !text.trim()"
          @click="c.resumeFlow.value = false; reread(text)"
        >{{ c.loading.value ? "解析中…" : "MOD 解析" }}</button>
        <span v-if="c.loading.value" class="text-xs text-amber-200/90"><span class="inline-block animate-pulse">●</span> {{ c.stage.value || "解析中…" }}</span>
      </div>
    </div>

    <!-- 入口 B: ベースから選ぶ (2026-09-26 作り直し: ① ベース → ② 狙う MOD → ③ 作り方 + 右に完成図) -->
    <BasePicker v-if="door === 'base' && (inputOpen || !c.base.value)" :c="c" :pk="pk" :presets="ZERO_PRESETS" :preset-picked="zeroPicked" @preset="pickZero" @run="runPicked()" />

    <!-- 上位プレイヤーの MOD (隣のタブ) から来た時 -->
    <div v-if="fromList" class="mb-3 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs">
      上位プレイヤーの MOD から: <b>{{ fromList.baseJa }}</b> に MOD {{ fromList.count }} 個
      <p v-if="fromList.skipped.length" class="mt-1 text-amber-200">
        計算機で作れない MOD は外しました (買うしかない物): {{ fromList.skipped.join(" / ") }}
      </p>
    </div>

    <p v-if="c.error.value" class="mb-3 rounded bg-red-900/40 p-2 text-xs">{{ c.error.value }}</p>

    <!-- 相場が空だと費用が全部 0 になるので、ここで断る -->
    <p v-if="c.coverage.value && !c.coverage.value.ready" class="mb-3 rounded bg-amber-900/40 p-2 text-xs">
      相場が未取得です。費用はすべて 0 と出ます。左の「カレンシー」を一度開いて相場を取ってから戻ってください。
    </p>
    <p v-else-if="c.coverage.value" class="mb-3 text-xs opacity-50">
      相場: {{ c.coverage.value.league ?? "?" }} ({{ c.coverage.value.fetchedLabel }})
      <span v-if="c.coverage.value.missing.length">— 相場に無い {{ c.coverage.value.missing.length }} 種類は使えない物として扱います</span>
    </p>

    <p v-if="c.loading.value && !c.base.value" class="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
      <span class="inline-block animate-pulse">●</span> {{ c.stage.value || "解析中…" }} <span class="opacity-60">— 済むと順に埋まる</span>
    </p>
    <template v-if="c.base.value">
      <h2 class="sec-title">MOD 解析とベースの診断</h2>
      <DiagnosisCard :c="c" />
      <!-- 作り方は ②③ が済んでから (順に出す。v-show で組んだツリーは保つ) -->
      <p v-if="c.diagBusy.value" class="note mb-1 mt-5">作り方は ② が終わると自動で出る</p>
      <div v-show="!c.diagBusy.value">
        <h2 class="sec-title mt-5">作り方 (手順の並び)</h2>
        <CraftTreePanel :c="c" />
      </div>

      <!-- ここから下は開発用 (配布版では出さない) -->
      <LabDevDetails v-if="DEV" :c="c" :pk="pk" />

      <!-- 時間。動作確認用なので畳んでおく (常に開いていると段の情報量が増える) -->
      <details v-if="DEV" class="text-xs opacity-50">
        <summary class="cursor-pointer font-bold opacity-100">かかった時間</summary>
        <div v-for="([label, ms], i) in c.timings.value" :key="i">{{ label }}: {{ ms }} ミリ秒</div>
      </details>
    </template>
     </div>
   </div>
   </div>
  </div>
</template>
