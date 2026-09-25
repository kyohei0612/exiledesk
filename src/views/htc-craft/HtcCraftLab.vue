<script setup lang="ts">
/**
 * HtcCraftLab.vue — クラフトのお試し計算機 (2026-09-22)
 *
 * オーナー指示:「マジで簡易的な計算機的な奴でいい。動きが見たい。イメージとあってるかどうか」。
 * **リリース前の動作確認用**で、体裁は最小限。中身は useHtcCraft.ts。
 */
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { PRESETS, ZERO_PRESETS } from "./presets";
import { zeroStart } from "./craft-settings";
import { CATALYSTS } from "../../services/htc/quality";
import { useHtcCraft } from "./useHtcCraft";
import { usePicker } from "./usePicker";
import DiagnosisCard from "./DiagnosisCard.vue";
import SpamPlanPanel from "./SpamPlanPanel.vue";
import CraftTreePanel from "./CraftTreePanel.vue";

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
/**
 * 中身は 1400px で組み、窓が狭ければそのまま縮める (zoom)。オーナー 2026-09-26:「ウィンドウ小さくしても大きくしても
 * 変わらない感じで」「相変わらず UI 壊れてる、縮小版」(横スクロールで右が切れていた)
 */
const DESIGN_W = 1400;
const rootEl = ref<HTMLElement | null>(null);
const zoom = ref(1);
let ro: ResizeObserver | null = null;
onMounted(() => {
  const fit = () => { const w = rootEl.value?.clientWidth ?? DESIGN_W; zoom.value = Math.min(1, Math.max(0.5, (w - 32) / DESIGN_W)); };
  fit();
  ro = new ResizeObserver(fit);
  if (rootEl.value) ro.observe(rootEl.value);
});
onBeforeUnmount(() => ro?.disconnect());
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
  picked.value = id;
  text.value = p.text;
  void reread(p.text);
}

/** 入口へ戻る。計算結果は捨てる (中途半端に残すと、今どの物の話か分からなくなる) */
function backToDoor(): void {
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
  const ja = pk.baseRows.value.find((b) => b.en === pk.baseName.value)?.ja ?? pk.baseName.value ?? "";
  return `${ja} / ilvl ${pk.level.value} / 狙う MOD ${pk.picks.value.length} 個`;
});

/** 暗黙は複数行のことがある (枠の増減は 2 行)。1 行に畳んで出す */
const implicitText = (lines: readonly string[]): string =>
  (lines[0] ?? "").split(String.fromCharCode(10)).join(" / ");
</script>

<template>
  <!-- 中身は幅 1400px で固定 (オーナー 2026-09-26:「ウィンドウ小さくしても大きくしても変わらない感じで。ウィンドウによって崩れる」)。
       狭い窓では横にスクロール、広い窓では余白 -->
  <div ref="rootEl" class="h-full overflow-auto p-4 text-sm">
   <div class="w-[1400px]" :style="{ zoom }">
    <h1 class="mb-1 text-lg font-bold">クラフト計算機</h1>
    <p class="mb-3 text-xs opacity-60">
      作りたいアイテムを貼るか、ベースと MOD を選ぶと、ベースの買い方・完成品との比べ・作り方ごとの費用と成功確率を出します。
    </p>

    <!-- 入口。開いた時はここだけ。何も計算していない -->
    <div v-if="door === 'none'" class="mb-4 grid gap-3" :class="lastPaste ? 'sm:grid-cols-3' : 'sm:grid-cols-2'">
      <!-- 前回の続き: 貼り直し → おｋ → 探す (キャッシュ) → 作り方 まで 1 押しで -->
      <button v-if="lastPaste" type="button" class="rounded border border-amber-500/40 bg-amber-500/10 p-4 text-left hover:border-amber-400" @click="resumeLast()">
        <div class="mb-1 font-bold text-amber-300">前回の続きから</div>
        <div class="text-xs opacity-70">{{ lastPasteLabel }} — 解析 → 探す → 作り方まで自動で通します (取引所は 30 分の覚えを使う)</div>
      </button>
      <button
        type="button"
        class="rounded border border-[var(--exile-color-border-subtle)] p-4 text-left hover:border-amber-400"
        @click="door = 'paste'"
      >
        <div class="mb-1 font-bold text-amber-300">コピーを貼る</div>
        <div class="text-xs opacity-60">
          poe.ninja やゲームから Ctrl+C した物をそのまま貼ります。<b>既にある物を真似る</b>時。
        </div>
      </button>
      <button
        type="button"
        class="rounded border border-[var(--exile-color-border-subtle)] p-4 text-left hover:border-amber-400"
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
          @click="reread(text)"
        >{{ c.loading.value ? "解析中…" : "MOD 解析" }}</button>
        <span v-if="c.loading.value" class="text-xs text-amber-200/90"><span class="inline-block animate-pulse">●</span> {{ c.stage.value || "解析中…" }}</span>
      </div>
    </div>

    <!-- 入口 B: ベースから選ぶ -->
    <div v-if="door === 'base' && (inputOpen || !c.base.value)" class="mb-4">
      <div class="mb-2 flex flex-wrap gap-2 text-xs">
        <span class="opacity-50">見本:</span>
        <button
          v-for="z in ZERO_PRESETS" :key="z.id" class="rounded border px-2 py-0.5"
          :class="zeroPicked === z.id ? 'border-amber-400 text-amber-300' : 'border-[var(--exile-color-border-subtle)] opacity-70'"
          @click="pickZero(z.id)"
        >{{ z.label }}</button>
      </div>
      <!-- 作り方の設定: 貼り付けが無いので品質と固定済みの枠は自分で決める -->
      <div class="mb-2 flex flex-wrap items-center gap-3 rounded bg-white/5 p-2 text-xs">
        <b class="opacity-70">作り方の設定</b>
        <label>品質
          <select v-model.number="zeroStart.quality" class="rounded border border-[var(--exile-color-border-subtle)] bg-black/30 px-1">
            <option :value="20">20% (カタリストだけ)</option>
            <option :value="40">40% (ブリーチのエッセンスで上限を上げる)</option>
          </select>
        </label>
        <label>最後に上げる品質の種類
          <select v-model="zeroStart.qualityTag" class="rounded border border-[var(--exile-color-border-subtle)] bg-black/30 px-1">
            <option :value="null">上げない</option>
            <option v-for="k in CATALYSTS" :key="k.tag" :value="k.tag">{{ k.ja }}</option>
          </select>
        </label>
        <label>固定済みの樹 MOD (買う物) が使う枠: プレ
          <input v-model.number="zeroStart.fixedPrefix" type="number" min="0" max="3" class="w-10 rounded border border-[var(--exile-color-border-subtle)] bg-black/20 px-1" />
        </label>
        <label>サフィ
          <input v-model.number="zeroStart.fixedSuffix" type="number" min="0" max="3" class="w-10 rounded border border-[var(--exile-color-border-subtle)] bg-black/20 px-1" />
        </label>
      </div>
      <div class="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <input
          v-model="pk.baseQuery.value"
          placeholder="ベースを絞る (サファイア / Ring …)"
          class="w-56 rounded border border-[var(--exile-color-border-subtle)] bg-black/20 px-2 py-1"
        />
        <label class="opacity-70">
          ilvl
          <input v-model.number="pk.level.value" type="number" class="ml-1 w-16 rounded border border-[var(--exile-color-border-subtle)] bg-black/20 px-1" />
        </label>
        <span class="opacity-50">段の上限を決めます。先に入れてください</span>
      </div>
      <!-- ベース一覧 -->
      <div v-if="!pk.baseName.value" class="max-h-72 overflow-auto rounded border border-[var(--exile-color-border-subtle)]">
        <table class="w-full text-xs">
          <tr
            v-for="b in pk.baseRows.value"
            :key="b.en"
            class="cursor-pointer border-b border-white/5 hover:bg-white/5"
            @click="c.data.value && pk.chooseBase(c.data.value, b.en)"
          >
            <td class="py-0.5 pl-2">{{ b.ja }}</td>
            <td class="w-24 opacity-50">{{ b.cls }}</td>
            <td class="w-16 opacity-50">lvl {{ b.lvl }}</td>
            <td class="pl-2 opacity-60">{{ b.implicits.join(" / ") }}</td>
          </tr>
        </table>
      </div>
      <!-- MOD 選び -->
      <div v-else>
        <p class="mb-2 text-xs">
          <b class="text-amber-300">{{ pk.baseRows.value.find((b) => b.en === pk.baseName.value)?.ja ?? pk.baseName.value }}</b>
          <button class="ml-2 opacity-60 underline hover:opacity-100" @click="pk.baseName.value = null">ベースを選び直す</button>
        </p>
        <input
          v-model="pk.modQuery.value"
          placeholder="MOD を絞る (ライフ / 耐性 …)"
          class="mb-2 w-56 rounded border border-[var(--exile-color-border-subtle)] bg-black/20 px-2 py-1 text-xs"
        />
        <div class="max-h-72 overflow-auto rounded border border-[var(--exile-color-border-subtle)]">
          <table class="w-full text-xs">
            <tr
              v-for="m in pk.modRows.value"
              :key="m.modId"
              class="cursor-pointer border-b border-white/5 hover:bg-white/5"
              :class="pk.isPicked(m.modId) ? 'bg-amber-900/20' : ''"
              @click="pk.toggle(m)"
            >
              <td class="w-6 pl-2 opacity-50">{{ m.side }}</td>
              <td class="py-0.5">{{ m.ja }}</td>
              <td class="w-28 text-emerald-300">{{ m.crafted ? "確定で乗せられる" : "" }}</td>
              <td class="w-48 text-right" @click.stop>
                <select
                  v-if="pk.isPicked(m.modId)"
                  class="rounded border border-[var(--exile-color-border-subtle)] bg-black/30 px-1 py-0.5"
                  :value="pk.tierOf(m.modId)"
                  @change="pk.setTier(m.modId, Number(($event.target as HTMLSelectElement).value))"
                >
                  <option v-for="(t, i) in m.tiers" :key="i" :value="i">
                    {{ t.name }} ({{ t.range }}) 以上
                  </option>
                </select>
              </td>
            </tr>
          </table>
        </div>
        <div class="mt-2 flex items-center gap-3">
          <button
            class="rounded bg-amber-600/80 px-3 py-1 text-xs font-bold disabled:opacity-40"
            :disabled="c.loading.value || pk.picks.value.length === 0"
            @click="runPicked()"
          >{{ c.loading.value ? "計算中…" : `この ${pk.picks.value.length} 個で計算する` }}</button>
        </div>
      </div>
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
      <span class="inline-block animate-pulse">●</span> {{ c.stage.value || "解析中…" }} <span class="opacity-60">— 済むと診断 → 始め方 → 完成品 → 作り方の順に埋まります</span>
    </p>
    <template v-if="c.base.value">
      <h2 class="mb-1 text-base font-bold">MOD 解析とベースの診断</h2>
      <DiagnosisCard :c="c" />
      <!-- 作り方は ②③ が済んでから (順に出す。v-show で組んだツリーは保つ) -->
      <p v-if="c.diagBusy.value" class="mb-1 mt-5 text-xs opacity-50">作り方 (STEP の並び) は、上の取得 (②) が終わってから自動で組んで出します</p>
      <div v-show="!c.diagBusy.value">
        <h2 class="mb-1 mt-5 text-base font-bold">作り方 (STEP の並び)</h2>
        <CraftTreePanel :c="c" />
      </div>

      <!-- ここから下は開発用 (配布版では出さない) -->
      <details v-if="DEV" class="mb-4 mt-4 text-xs">
        <summary class="cursor-pointer opacity-60">詳しく (MOD の段・忍者の道・ベース候補)</summary>
      <!-- 読み取り -->
      <section class="mb-4">
        <h2 class="mb-1 font-bold">① MOD 解析</h2>
        <!-- 貼り付けから来た時だけ、読めた見出しを出す (ベースから組んだ時は自分で決めた物なので不要) -->
        <p v-if="c.item.value" class="text-xs opacity-80">
          {{ c.item.value.baseText }} ({{ c.item.value.baseType }}) / ilvl {{ c.item.value.itemLevel }}
          <span v-if="c.item.value.quality"> / 品質 {{ c.item.value.quality }}%</span>
          <span v-if="c.item.value.catalystTag" class="text-amber-300"> — 種類 {{ c.item.value.catalystTag }} (この種類の MOD は品質を外してから読む)</span>
        </p>
        <p v-else class="text-xs opacity-80">
          {{ pk.baseRows.value.find((b) => b.en === pk.baseName.value)?.ja ?? pk.baseName.value }} / ilvl {{ pk.level.value }}
          <span class="opacity-50">— 自分で並べた {{ c.rows.value.length }} 個</span>
        </p>
        <table class="mt-1 w-full text-xs">
          <tr v-for="r in c.rows.value" :key="r.modId" class="border-b border-white/5">
            <td class="w-6 opacity-50">{{ r.side }}</td>
            <td class="py-0.5">{{ r.text }}</td>
            <td class="opacity-70">{{ r.tierName }}</td>
            <td class="opacity-50">{{ r.range }}</td>
            <td class="w-28 text-amber-300">{{ r.boosted ? "品質を外した" : "" }}</td>
            <td class="w-32 text-emerald-300">{{ r.crafted ? "確定で乗せられる" : "" }}</td>
            <!-- 重みがデータに無い MOD は確率を信用できない。埋めた物は推定値と断る -->
            <td class="w-28 text-amber-300" :title="r.overridden ? c.weightNote : ''">
              {{ r.unknownWeight ? "重み不明" : r.overridden ? "重みは推定値" : "" }}
            </td>
          </tr>
        </table>
        <!-- 解く前に分かる話なので、ここで先に出す -->
        <p
          v-if="c.slots.value"
          class="mt-2 rounded p-2 text-xs"
          :class="c.slots.value.impossible ? 'bg-red-900/40' : c.slots.value.needsAstrid ? 'bg-amber-900/40' : 'bg-white/5'"
        >
          {{ c.slots.value.note }}
        </p>
        <p v-if="c.implicits.value.length" class="mt-1 text-xs opacity-50">
          暗黙 (ベースで決まるので作る対象外): {{ c.implicits.value.join(" / ") }}
        </p>
        <!-- 作れない MOD は黙って外さない。外して解くと別のアイテムの手順が出る -->
        <p v-if="c.skipped.value.length" class="mt-2 rounded bg-red-900/40 p-2 text-xs">
          <b>このベースでは作れない MOD が {{ c.skipped.value.length }} 件あります</b> — {{ c.skipped.value.join(" / ") }}<br />
          <span class="opacity-80">
            <b>クラフトでは付きません。</b>
            <template v-for="d in c.dropOnly.value" :key="d.text">
              <br /><b class="text-amber-300">{{ d.tagJa }}</b> からしか出ません — {{ d.text }}
              <!-- 段は品質を外した値で決める (エンジンに無い MOD なのでクライアントの表を直に引く) -->
              <span v-if="d.tier" class="text-sky-300">
                (乗っているのは {{ d.tier.name }} {{ d.tier.min }}-{{ d.tier.max }} = T{{ d.tier.of - d.tier.index }}<template
                  v-if="d.deboosted"> / 品質を外した素の値 {{ d.raw?.toFixed(1) }}</template>)
              </span>
              <!-- 探す段。既定は貼り付けた物の段。変えると 3 本の検索の下限が変わる -->
              <label v-if="d.tiers?.length" class="ml-1">
                探す段
                <select
                  class="rounded border border-[var(--exile-color-border-subtle)] bg-black/30 px-1"
                  :value="c.treeTierPick.value[d.text] ?? d.tier?.index ?? 0"
                  @change="c.treeTierPick.value = { ...c.treeTierPick.value, [d.text]: Number(($event.target as HTMLSelectElement).value) }"
                >
                  <option v-for="(t, i) in d.tiers" :key="i" :value="i">
                    T{{ d.tiers.length - i }} {{ t.name }} ({{ t.min }}-{{ t.max }}) 以上
                  </option>
                </select>
              </label>
            </template>
            <br />
            <b>付いた物を買ってください。</b>しかも<b>固定済み</b>で ──
            クラフトでは二度と付けられないので、固定されていないと途中で消えたら終わりです。
            <b>枠はその分を引いて数えています</b>
            (<template v-if="c.slotsUsed.value.prefixes">プレフィックス {{ c.slotsUsed.value.prefixes }} </template>
            <template v-if="c.slotsUsed.value.suffixes">サフィックス {{ c.slotsUsed.value.suffixes }} </template>
            <template v-if="c.slotsUsed.value.either">側が決まらない分 {{ c.slotsUsed.value.either }} は両側から </template>
            使用中)。
          </span>
        </p>

        <SpamPlanPanel :c="c" />
      </section>

      <!-- ベース選び。ここが分岐点なので、段階 0 より前に置く -->
      <section v-if="c.bases.value.length" class="mb-4">
        <h2 class="mb-1 font-bold">② ベース</h2>
        <p class="mb-2 text-xs opacity-60">
          <b>貼り付けた物を真似るなら、ベースは決まっています</b> (先頭の「今の物」)。
          下は<b>0 から作る時</b>の参考です ── 枠が違うベース、暗黙がタダで乗るベース、
          <b>品質の最大値を上げるベース</b>があります。後者ならプレフィックスを使わずに高い品質へ
          行けます (エッセンスで上げる道は枠を食う)。<b>選ぶのは手動です。</b>
        </p>
        <table class="w-full text-xs">
          <tr v-for="b in c.bases.value.slice(0, 8)" :key="b.baseType" class="border-b border-white/5">
            <td class="w-5">{{ b.fits ? "○" : "×" }}</td>
            <td class="py-0.5" :class="b.current ? 'text-amber-300 font-bold' : ''">
              {{ b.ja }}<span v-if="b.current" class="opacity-60"> ← 今の物</span>
            </td>
            <td class="w-14 opacity-50">lvl {{ b.lvl }}</td>
            <td class="w-16 opacity-70">{{ b.prefixes }}P/{{ b.suffixes }}S</td>
            <td class="w-28 text-emerald-300">{{ b.maxQualityPlus ? "品質上限 +" + b.maxQualityPlus + "%" : "" }}</td>
            <td class="pl-2 opacity-60">{{ b.why ?? implicitText(b.implicits) }}</td>
          </tr>
        </table>
      </section>

      </details>

      <!-- 時間。動作確認用なので畳んでおく (常に開いていると段の情報量が増える) -->
      <details v-if="DEV" class="text-xs opacity-50">
        <summary class="cursor-pointer font-bold opacity-100">かかった時間</summary>
        <div v-for="([label, ms], i) in c.timings.value" :key="i">{{ label }}: {{ ms }} ミリ秒</div>
      </details>
    </template>
     </div>
  </div>
</template>
