<script setup lang="ts">
/**
 * HtcCraftLab.vue — クラフトのお試し計算機 (2026-09-22)
 *
 * オーナー指示:「マジで簡易的な計算機的な奴でいい。動きが見たい。イメージとあってるかどうか」。
 * **リリース前の動作確認用**で、体裁は最小限。中身は useHtcCraft.ts。
 */
import { computed, ref, watchEffect } from "vue";
import { PRESETS, ZERO_PRESETS } from "./presets";
import { zeroStart } from "./craft-settings";
import { useHtcCraft } from "./useHtcCraft";
import { usePicker } from "./usePicker";
import DiagnosisCard from "./DiagnosisCard.vue";
import CraftTreePanel from "./CraftTreePanel.vue";
import BasePicker from "./BasePicker.vue";
// 「詳しく」(開発ビルドだけ) は LabDevDetails.vue へ (2026-09-26 の分割)
import LabDevDetails from "./LabDevDetails.vue";

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
/** 前回貼った物 (この端末で覚える)。入口に「前回の続きから」を出す */
const LAST_PASTE_KEY = "exiledesk.htc.lastPaste";
const lastPaste = ref<string | null>(null);
try { lastPaste.value = localStorage.getItem(LAST_PASTE_KEY); } catch { /* 無し */ }
const lastPasteLabel = computed(() => {
  const t = lastPaste.value ?? "";
  const lines = t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return lines[2] ?? lines[1] ?? lines[0] ?? "";
});
function resumeLast(): void {
  if (!lastPaste.value) return;
  door.value = "paste";
  text.value = lastPaste.value;
  c.resumeFlow.value = true;
  void reread(lastPaste.value);
}
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
    try { localStorage.setItem(LAST_PASTE_KEY, t); lastPaste.value = t; } catch { /* 無視 */ }
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
  <div class="h-full overflow-auto p-4 text-sm">
   <div>
    <h1 class="mb-1 text-lg font-bold">クラフト計算機</h1>
    <p class="mb-3 text-xs opacity-60">
      作りたいアイテムを貼るか、ベースと MOD を選ぶと、ベースの買い方・完成品との比べ・作り方ごとの費用と成功確率を出します。
    </p>

    <!-- 入口。開いた時はここだけ。何も計算していない -->
    <div v-if="door === 'none'" class="mb-4 grid gap-3" :class="lastPaste ? 'sm:grid-cols-3' : 'sm:grid-cols-2'">
      <!-- 前回の続き: 貼り直し → おｋ → 探す (キャッシュ) → 作り方 まで 1 押しで -->
      <button v-if="lastPaste" type="button" class="rounded border border-amber-500/40 bg-amber-500/10 p-4 text-left hover:border-amber-400" @click="resumeLast()">
        <div class="mb-1 font-bold text-amber-300">前回の続きから</div>
        <div class="text-xs opacity-70">{{ lastPasteLabel }} — 作り方まで自動で進む</div>
      </button>
      <button
        type="button"
        class="rounded-lg border border-white/10 p-4 text-left hover:border-amber-400"
        @click="door = 'paste'"
      >
        <div class="mb-1 font-bold text-amber-300">コピーを貼る</div>
        <div class="text-xs opacity-60">
          poe.ninja やゲームから Ctrl+C した物をそのまま貼ります。<b>既にある物を真似る</b>時。
        </div>
      </button>
      <button
        type="button"
        class="rounded-lg border border-white/10 p-4 text-left hover:border-amber-400"
        @click="openBaseDoor()"
      >
        <div class="mb-1 font-bold text-amber-300">ベースから選ぶ</div>
        <div class="text-xs opacity-60">
          ベースと狙う MOD を自分で並べます。<b>0 から決める</b>時。
        </div>
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
          class="rounded bg-amber-600/80 px-3 py-1 text-xs font-bold disabled:opacity-40"
          :disabled="c.loading.value || !text.trim()"
          @click="c.resumeFlow.value = false; reread(text)"
        >{{ c.loading.value ? "解析中…" : "MOD 解析" }}</button>
        <span v-if="c.loading.value" class="text-xs text-amber-200/90"><span class="inline-block animate-pulse">●</span> {{ c.stage.value || "解析中…" }}</span>
      </div>
    </div>

    <!-- 入口 B: ベースから選ぶ (2026-09-26 作り直し: ① ベース → ② 狙う MOD → ③ 作り方 + 右に完成図) -->
    <BasePicker v-if="door === 'base' && (inputOpen || !c.base.value)" :c="c" :pk="pk" :presets="ZERO_PRESETS" :preset-picked="zeroPicked" @preset="pickZero" @run="runPicked()" />

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
      <h2 class="mb-1 text-base font-bold">MOD 解析とベースの診断</h2>
      <DiagnosisCard :c="c" />
      <!-- 作り方は ②③ が済んでから (順に出す。v-show で組んだツリーは保つ) -->
      <p v-if="c.diagBusy.value" class="mb-1 mt-5 text-xs opacity-50">作り方は ② が終わると自動で出る</p>
      <div v-show="!c.diagBusy.value">
        <h2 class="mb-1 mt-5 text-base font-bold">作り方 (STEP の並び)</h2>
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
</template>
