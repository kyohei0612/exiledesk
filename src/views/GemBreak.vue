<!--
  GemBreak.vue — 使用率ランキング (2026-09-16、2026-09-17 に監視ジェムの中へ統合)
  オーナー指示: 「21 とか 23% とか完成品を使ってる人数をランキングで見たい」「一旦ジェムリングのみで試してもええ」
  「クラフト選定ジェムって名前で、そこでクラフトするジェムを選ぶ感じで」
  → poe.ninja のアセンダンシー 1 つ分の上位キャラだけ取って、そのジェムを
     レベル 21 以上 / 品質 23% 以上 / 両方 (完成品) で使っている人数を数える。
  poe.ninja の全体集計 (search の dimension) にはレベル / 品質の軸が無いので、ここだけは実データを数えている。
    src-tauri/src/gem_break.rs  取得 + 集計 (gem-break-progress を emit)
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { jaSkill } from "../i18n/skills-ja";
import { jaAscendancy, ascendancyIcon } from "../i18n/ascendancies-ja";
import { openGemCorrupt } from "../state/app-nav";
import { resumeAtText, waitText } from "../utils/wait-text";
import { setWatches } from "../services/market-flow";
import { watchesFromRows } from "../state/gem-watch-auto";
import { addManualGem, isManualGem, removeManualGem, watchSettings } from "../state/watch-settings";
import { rebuildWatches } from "../state/gem-watch-auto";
import { marketStore } from "../state/market-store";
import { trade2Site } from "../services/trade2/league";
import gemsRaw from "../i18n/gems-client.json";

/** ジェムコラプトの賭けで計算できるジェム (英語名) */
const CORRUPTIBLE = new Set((gemsRaw as { en: string }[]).map((g) => g.en));

interface Row {
  name: string;
  users: number;
  lvl21: number;
  q23: number;
  both: number;
  max_level: number;
  max_quality: number;
  /** コラプト済みで使っていた人数 */
  corrupted: number;
  /** [レベル, 人数] 昇順 */
  level_dist: [number, number][];
  /** [品質, 人数] 昇順 */
  quality_dist: [number, number][];
}
interface Result {
  class: string;
  classes?: string[];
  percentage: number;
  characters: number;
  requested?: number;
  cancelled?: boolean;
  league: string;
  snapshot: string;
  fetched_at: number;
  rows: Row[];
}
interface Asc {
  class: string;
  percentage: number;
}

const inApp = isTauriRuntime();
const STORE_KEY = "exiledesk.gem-break.result";
const CLASS_KEY = "exiledesk.gem-break.class";
const TOPN_KEY = "exiledesk.gem-break.topn";
const SPREAD_KEY = "exiledesk.gem-break.spread";

const result = ref<Result | null>(null);
const ascendancies = ref<Asc[]>([]);
/** null = まだ決まっていない / "" = 全アセンダンシー / それ以外 = そのアセンダンシー */
const selectedClass = ref<string | null>(null);
/** 既定は 100 人 (search が返す上限) */
const topN = ref<number>(100);
/** 何アセンダンシーに散らすか (1 = 選んだアセだけ) */
const spread = ref<number>(1);
const busy = ref(false);
const error = ref("");
const progress = ref<{ phase: string; done: number; total: number } | null>(null);
/** poe.ninja のレート制限 / 再試行の状態 (MOD 一覧のヘッダーと同じ物を出す) */
interface NetworkStatusRaw {
  global_penalty_waiting: boolean;
  global_penalty_remaining_secs: number;
  global_penalty_reason?: string | null;
  active_retry_count: number;
  last_retry_reason?: string | null;
  last_retry_remaining_secs: number;
}
const net = ref<NetworkStatusRaw | null>(null);
let netTimer: ReturnType<typeof setInterval> | null = null;

function startNetPolling(): void {
  if (netTimer || !inApp) return;
  netTimer = setInterval(async () => {
    try {
      const s = await invoke<NetworkStatusRaw>("get_network_status");
      net.value = s.global_penalty_waiting || s.active_retry_count > 0 ? s : null;
    } catch {
      net.value = null;
    }
  }, 1000);
}
function stopNetPolling(): void {
  if (netTimer) clearInterval(netTimer);
  netTimer = null;
  net.value = null;
}

/** 取得を中止する (レート制限待ちが長い時の逃げ道)。取れた分までで結果が返る */
async function cancelNow(): Promise<void> {
  if (!busy.value) return;
  try {
    await invoke("gem_break_cancel");
  } catch {
    /* 失敗しても取得側はいずれ終わる */
  }
}

function loadStored(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) result.value = JSON.parse(raw) as Result;
    selectedClass.value = localStorage.getItem(CLASS_KEY);
    const n = Number(localStorage.getItem(TOPN_KEY));
    if (n >= 5 && n <= 100) topN.value = n;
    const sp = Number(localStorage.getItem(SPREAD_KEY));
    if (sp >= 1 && sp <= 10) spread.value = sp;
  } catch {
    /* 読めなくても取り直せる */
  }
}

async function loadAscendancies(): Promise<void> {
  if (!inApp) return;
  try {
    ascendancies.value = await invoke<Asc[]>("gem_break_ascendancies");
    // 既定は「全アセンダンシー」(オーナー判断 2026-09-16: 売れるのは個別アセではなく全体で人気のジェム)。
    // 保存済みの選択があればそれを優先する
    if (selectedClass.value === null) selectedClass.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function fetchNow(): Promise<void> {
  if (busy.value || !inApp) return;
  busy.value = true;
  error.value = "";
  progress.value = null;
  startNetPolling();
  try {
    const r = await invoke<Result>("gem_break_fetch", {
      req: { class: selectedClass.value ?? null, topN: topN.value, spread: selectedClass.value ? spread.value : 1 },
    });
    result.value = r;
    // 監視ジェムの「取得先」と同じアセンダンシーで取った時だけ、監視リストを作り直す。
    // (別のアセンダンシーを眺めただけで監視対象が入れ替わらないように。2026-09-17)
    if ((selectedClass.value ?? "") === watchSettings.value.klass) {
      void setWatches(watchesFromRows(r.rows), marketStore.league.value?.Value ?? "", trade2Site());
    }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(r));
      localStorage.setItem(CLASS_KEY, selectedClass.value ?? "");
      localStorage.setItem(TOPN_KEY, String(topN.value));
      localStorage.setItem(SPREAD_KEY, String(spread.value));
    } catch {
      /* 保存できなくても表示はできる */
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
    progress.value = null;
    stopNetPolling();
  }
}

// オーナー指示 (2026-09-16): 並びは 完成品 → レベル 21 → 品質 23%
const SECTIONS = [
  { key: "both", label: "完成品 (両方)", icon: "☠", note: "レベル 21 以上かつ品質 23% 以上で使っている人数" },
  { key: "lvl21", label: "レベル 21 以上", icon: "⬆", note: "コラプトでレベルが上がったジェムを使っている人数" },
  { key: "q23", label: "品質 23% 以上", icon: "✧", note: "コラプトで品質が上がったジェムを使っている人数" },
] as const;
type Key = (typeof SECTIONS)[number]["key"];

/** 売れ行きを追う下限 (完成品を使っている人数) */
const TRACK_MIN_FINISHED = 5;
/** 一覧から監視ジェムに入れる / 外す (すぐ追跡に反映する) */
function toggleWatchGem(name: string): void {
  if (isManualGem(name)) removeManualGem(name);
  else if (!addManualGem(name)) return;
  void rebuildWatches();
}

const PAGE = 25;
const showAll = ref<Record<string, boolean>>({});
function listOf(key: Key): Row[] {
  const rows = result.value?.rows ?? [];
  return rows
    .filter((r) => r[key] > 0)
    .slice()
    .sort((a, b) => b[key] - a[key] || b.users - a.users || a.name.localeCompare(b.name));
}
const visible = (key: Key): Row[] => (showAll.value[key] ? listOf(key) : listOf(key).slice(0, PAGE));

/** 行を開いてレベル / 品質の内訳を見る */
const expanded = ref<Record<string, boolean>>({});
const toggle = (key: Key, name: string): void => {
  const k = key + "::" + name;
  expanded.value = { ...expanded.value, [k]: !expanded.value[k] };
};
const isOpen = (key: Key, name: string): boolean => !!expanded.value[key + "::" + name];
/** "20:5 / 21:12 / 22:3" (人数の多い順ではなく値の昇順、0 は出さない) */
const distText = (d: [number, number][] | undefined, suffix = ""): string =>
  (d ?? []).map(([v, c]) => `${v}${suffix}: ${c}人`).join(" / ") || "—";
/** 集計対象の表示名 (1 アセなら日本語名、複数なら「上位 N アセ合算」) */
const resultClassJa = computed(() => {
  const r = result.value;
  if (!r) return "";
  const cs = (r.classes ?? []).filter((c) => c);
  if (cs.length === 0) return "全アセンダンシー";
  if (cs.length === 1) return `${ascendancyIcon(cs[0])} ${jaAscendancy(cs[0])}`;
  if (cs.length > 1) return `${cs.map((c) => jaAscendancy(c)).join(" / ")}`;
  return jaAscendancy(r.class);
});
const fetchedAtText = computed(() => {
  const t = result.value?.fetched_at;
  if (!t) return "";
  const d = new Date(t * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
});
/** レート制限 / 再試行の待ち中は「取得中」ではない (オーナー指摘 2026-09-16) */
const waiting = computed(() => busy.value && !!net.value && (net.value.global_penalty_waiting || net.value.active_retry_count > 0));
/** 待機中に出す「ここまで取れた」表示 */
const doneText = computed(() => (progress.value ? `${progress.value.done}/${progress.value.total} 人 取得済み` : ""));
/** 取ろうとした人数より大幅に少ない = レート制限や中止で打ち切られた (数字があてにならない) */
const shortfall = computed(() => {
  const r = result.value;
  if (!r || !r.requested) return null;
  if (r.characters >= r.requested) return null;
  return { got: r.characters, want: r.requested, cancelled: !!r.cancelled };
});
const progressText = computed(() => {
  const p = progress.value;
  if (!p) return "";
  if (p.phase === "search") return "上位プレイヤーを検索中…";
  if (p.phase === "completed") return "集計中…";
  return `キャラ取得中 ${p.done}/${p.total}`;
});

let unlisten: UnlistenFn | null = null;
onMounted(async () => {
  loadStored();
  await loadAscendancies();
  if (inApp) {
    unlisten = await listen<{ phase: string; done: number; total: number }>("gem-break-progress", (e) => {
      progress.value = e.payload;
    });
  }
});
onUnmounted(() => {
  unlisten?.();
  stopNetPolling();
});
</script>

<template>
  <section class="@container min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-3">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">使用率ランキング (poe.ninja)</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        上位プレイヤーが「レベル 21 / 品質 23% / 完成品 (両方)」のジェムを実際に何人使っているかの人数ランキング (値段は見ていません)。
        <span class="text-[var(--exile-color-text-primary)]">上の「監視ジェム」の上位はここの結果から決まります。</span>
        行を押すと、そのジェムが実際に何レベル / 何 % で使われているかの内訳が出ます。
      </p>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-1">
        poe.ninja の全体集計にはジェムのレベル・品質が無いので、選んだアセンダンシーの上位キャラを直接読んで数えます
        (1 アセンダンシー = 人数 + 2 リクエスト。レート制限に当たると自動で待つので数分かかることがあります)。
        装備やアセンダンシーの「+1 to Level of Skills」は差し引き、コラプト済みのジェムだけを 21 / 23% として数えています。
        全アセンダンシーで取ると、完成品を {{ TRACK_MIN_FINISHED }} 人以上が使っているジェムを捌き速度の追跡対象にします
        (出品 1 件ずつを 2 時間ごとに追って、売れるまでの時間を測る → ジェムコラプトの賭けに表示)。
        この一覧はアプリ起動時に 1 日 1 回、自動で取り直します。
      </p>
    </header>

    <p v-if="!inApp" class="mb-3 text-[12px] text-amber-300">この画面はアプリ (ExileDesk) の中でだけ取得できます。</p>

    <div
      class="rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-3 text-[12px] mb-4 flex flex-wrap items-center gap-x-5 gap-y-2"
    >
      <label class="inline-flex items-center gap-2 min-w-0">
        <span class="text-[var(--exile-color-text-secondary)]">アセンダンシー</span>
        <select v-model="selectedClass" class="sel max-w-64" :disabled="spread > 1">
          <!-- クラス指定なし = リーグ全体の DPS 上位 100 人 (ジェムリング上位と 75% 別人だった) -->
          <option value="">全アセンダンシー (リーグ全体の上位)</option>
          <option v-if="ascendancies.length === 0 && selectedClass" :value="selectedClass">{{ jaAscendancy(selectedClass) }}</option>
          <option v-for="a in ascendancies" :key="a.class" :value="a.class">
            {{ ascendancyIcon(a.class) }} {{ jaAscendancy(a.class) }} ({{ a.percentage.toFixed(1) }}%)
          </option>
        </select>
      </label>
      <!-- 全アセンダンシーを選んだら「範囲」は意味が無いので出さない (オーナー指示 2026-09-16) -->
      <label v-if="selectedClass" class="inline-flex items-center gap-2">
        <span class="text-[var(--exile-color-text-secondary)]">範囲</span>
        <select v-model.number="spread" class="sel">
          <option :value="1">選んだアセだけ</option>
          <option :value="3">上位 3 アセに散らす</option>
          <option :value="5">上位 5 アセに散らす</option>
        </select>
      </label>
      <label class="inline-flex items-center gap-2">
        <span class="text-[var(--exile-color-text-secondary)]">人数</span>
        <select v-model.number="topN" class="sel">
          <option :value="20">20 人</option>
          <option :value="40">40 人</option>
          <option :value="60">60 人</option>
          <option :value="100">100 人</option>
        </select>
      </label>
      <button
        type="button"
        :disabled="!inApp || busy || selectedClass == null"
        class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed"
        @click="fetchNow"
      >
        {{ busy ? (waiting ? "待機中…" : "取得中…") : "取得" }}
      </button>
      <button
        v-if="busy"
        type="button"
        class="px-2 py-1 rounded border border-[var(--exile-color-border-subtle)] text-[11px] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)] hover:text-[var(--exile-color-text-primary)]"
        title="取得を止める (取れた分までで集計します)"
        @click="cancelNow"
      >
        中止
      </button>
      <span v-if="busy && progressText && !waiting" class="inline-flex items-center gap-1.5 text-[11px] text-emerald-300">
        <span class="inline-block w-2 h-2 rounded-full bg-emerald-300 animate-pulse" aria-hidden="true"></span>
        {{ progressText }}
      </span>
      <span v-if="waiting && doneText" class="text-[11px] text-[var(--exile-color-text-tertiary)] tabular-nums">{{ doneText }}</span>
      <!-- poe.ninja のレート制限待ち / 再試行待ち (MOD 一覧のヘッダーと同じ表示) -->
      <span
        v-if="busy && net?.global_penalty_waiting"
        class="inline-flex items-center gap-1 text-[11px] text-amber-300 font-medium"
        :title="
          net.global_penalty_reason
            ? `poe.ninja から ${net.global_penalty_reason} を受信、自動再開を待機中`
            : 'poe.ninja のレート制限の解除を待機中'
        "
      >
        <span aria-hidden="true" class="animate-pulse">⏱</span>
        リミット制限待機中（あと {{ waitText(net.global_penalty_remaining_secs) }}<template v-if="resumeAtText(net.global_penalty_remaining_secs)">
          · {{ resumeAtText(net.global_penalty_remaining_secs) }} 頃に再開</template
        >）
        <span v-if="net.global_penalty_reason" class="text-amber-200/70 text-[10px]">({{ net.global_penalty_reason }})</span>
      </span>
      <span
        v-else-if="busy && net && net.active_retry_count > 0"
        class="inline-flex items-center gap-1 text-[11px] text-orange-300 font-medium"
        :title="
          net.last_retry_reason
            ? `直近の再試行理由: ${net.last_retry_reason} (あと ${waitText(net.last_retry_remaining_secs)})`
            : 'サーバ応答エラーで再試行待機中'
        "
      >
        <span aria-hidden="true" class="animate-pulse">🔁</span>
        再試行中 {{ net.active_retry_count }} 件
        <span v-if="net.last_retry_reason" class="text-orange-200/70 text-[10px]">
          ({{ net.last_retry_reason }} あと {{ waitText(net.last_retry_remaining_secs) }})
        </span>
      </span>
      <span v-else-if="result" class="text-[11px] text-[var(--exile-color-text-tertiary)]">
        {{ resultClassJa }} の上位 {{ result.characters }} 人 · 取得 {{ fetchedAtText }}
      </span>
      <p v-if="error" class="basis-full text-[12px] text-amber-300">{{ error }}</p>
    </div>

    <!-- 母数が足りていない時の警告 (オーナー指摘 2026-09-16: 「上位 1 人ってなんだ」) -->
    <p v-if="shortfall" class="mb-3 px-3 py-2 rounded border border-amber-600/60 bg-amber-900/15 text-[12px] text-amber-300">
      {{ shortfall.want }} 人中 {{ shortfall.got }} 人しか取れていません（{{ shortfall.cancelled ? "中止しました" : "poe.ninja のレート制限で打ち切り" }}）。
      この人数では順位も割合もあてになりません。時間を置いて取り直してください。
    </p>
    <p v-if="!result" class="text-[12px] text-[var(--exile-color-text-tertiary)]">
      まだ取得していません。アセンダンシーを選んで「取得」を押してください (まずは使用率トップの 1 つで十分です)。
    </p>
    <!-- 段組みは他の「賭け」画面と同じ刻み (狭い時に無理に横並びにしない) -->
    <div v-else class="grid grid-cols-1 @6xl:grid-cols-2 @7xl:grid-cols-3 gap-4 items-start">
      <div v-for="sec in SECTIONS" :key="sec.key" class="rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-4">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-baseline gap-2">
          <span aria-hidden="true">{{ sec.icon }}</span>
          <span>{{ sec.label }}</span>
        </h2>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-0.5 mb-2">{{ sec.note }}</p>
        <ul class="space-y-0.5">
          <li
            v-for="(r, i) in visible(sec.key)"
            :key="r.name"
            class="py-1 px-1 -mx-1 rounded hover:bg-[var(--exile-color-bg-elevated)] cursor-pointer"
            :title="r.name"
            @click="toggle(sec.key, r.name)"
          >
            <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-2">
              <span class="tabular-nums text-[10px] w-5 text-right text-[var(--exile-color-text-tertiary)]">{{ i + 1 }}</span>
              <div class="flex items-baseline gap-1.5 min-w-0">
                <span class="min-w-0 truncate text-[13px]" :title="r.name">
                  {{ jaSkill(r.name) }}
                  <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ isOpen(sec.key, r.name) ? "▲" : "▼" }}</span>
                </span>
                <button
                  v-if="CORRUPTIBLE.has(r.name)"
                  type="button"
                  class="shrink-0 whitespace-nowrap text-[10px] px-1 rounded border border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] transition-colors"
                  :title="`ジェムコラプトの賭けで ${jaSkill(r.name)} を計算する`"
                  @click.stop="openGemCorrupt(r.name)"
                >
                  このジェムで計算 ↗
                </button>
                <!-- 2026-09-17 オーナー指示: 一覧から直接、監視ジェムに入れられるように -->
                <button
                  type="button"
                  class="shrink-0 whitespace-nowrap text-[10px] px-1 rounded border transition-colors"
                  :class="isManualGem(r.name)
                    ? 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-tertiary)] hover:text-rose-300'
                    : 'border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]'"
                  :title="isManualGem(r.name) ? '監視ジェムから外す' : 'このジェムを監視ジェムに入れる (2 時間ごとに捌き速度を測る)'"
                  @click.stop="toggleWatchGem(r.name)"
                >
                  {{ isManualGem(r.name) ? "監視中 ✓" : "監視へ +" }}
                </button>
              </div>
              <span class="tabular-nums text-[13px] whitespace-nowrap">
                {{ r[sec.key] }} <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">/ {{ r.users }} 人</span>
              </span>
            </div>
            <!-- 内訳: 何レベル / 何 % が実際に使われているか -->
            <dl v-if="isOpen(sec.key, r.name)" class="ml-7 mt-1 space-y-0.5 text-[11px] text-[var(--exile-color-text-secondary)]">
              <div class="flex gap-2">
                <dt class="shrink-0 text-[var(--exile-color-text-tertiary)]">レベル</dt>
                <dd class="tabular-nums">{{ distText(r.level_dist) }}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="shrink-0 text-[var(--exile-color-text-tertiary)]">品質</dt>
                <dd class="tabular-nums">{{ distText(r.quality_dist, "%") }}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="shrink-0 text-[var(--exile-color-text-tertiary)]">コラプト済み</dt>
                <dd class="tabular-nums">{{ r.corrupted }} / {{ r.users }} 人</dd>
              </div>
            </dl>
          </li>
          <li v-if="listOf(sec.key).length === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)] italic">該当なし</li>
        </ul>
        <button
          v-if="listOf(sec.key).length > PAGE"
          type="button"
          class="mt-2 text-[11px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)] underline tabular-nums"
          @click="showAll[sec.key] = !showAll[sec.key]"
        >
          {{ showAll[sec.key] ? `▲ 上位 ${PAGE} 件だけ` : `▼ 残り ${listOf(sec.key).length - PAGE} 件を見る` }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sel {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--exile-color-bg-surface);
  border: 1px solid var(--exile-color-border-subtle);
}
.sel:focus {
  outline: none;
  border-color: var(--exile-color-accent-focus);
}
</style>
