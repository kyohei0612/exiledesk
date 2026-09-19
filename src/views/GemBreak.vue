<!--
  GemBreak.vue — 使用率ランキング (2026-09-16、2026-09-17 に自動ジェム監視の中へ統合)
  オーナー指示: 「21 とか 23% とか完成品を使ってる人数をランキングで見たい」「一旦ジェムリングのみで試してもええ」
  「クラフト選定ジェムって名前で、そこでクラフトするジェムを選ぶ感じで」
  → poe.ninja のアセンダンシー 1 つ分の上位キャラだけ取って、そのジェムを
     レベル 21 以上 / 品質 23% 以上 / 両方 (完成品) で使っている人数を数える。
  poe.ninja の全体集計 (search の dimension) にはレベル / 品質の軸が無いので、ここだけは実データを数えている。
    src-tauri/src/gem_break.rs  取得 + 集計 (gem-break-progress を emit)
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { jaAscendancy, ascendancyIcon } from "../i18n/ascendancies-ja";
import { resumeAtText, waitText } from "../utils/wait-text";
import { MANUAL_ONLY, watchSettings } from "../state/watch-settings";
import { rankingClass } from "../state/gem-watch-auto";
import { loadAscendancies } from "../state/ascendancy-list";
import UsageTable from "./gem-watch/UsageTable.vue";


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
  /** そのうちキャッシュ / 同梱データから流用した人数 */
  reused?: number;
  requested?: number;
  cancelled?: boolean;
  league: string;
  snapshot: string;
  fetched_at: number;
  rows: Row[];
}
const inApp = isTauriRuntime();
const STORE_KEY = "exiledesk.gem-break.result";
const TOPN_KEY = "exiledesk.gem-break.topn";
const SPREAD_KEY = "exiledesk.gem-break.spread";

const result = ref<Result | null>(null);
/**
 * どのアセンダンシーを見るかは 自動ジェム監視の「取得先」で決める ("" = 全アセンダンシー)。
 * 2026-09-19 オーナー指示:「監視で個別アセを選んでも画面が変わらない。選んだら、取得済みなら
 * 変えてくれ。そしたら使用率ランキングのプルダウンは要らないでしょ」。ここは表示専用にした。
 */
/**
 * この一覧で見ているアセンダンシー。値は上の「自動ジェム監視」のプルダウンと同じ (設定に持つ)。
 *
 * オーナー指示 2026-09-20:「自動ジェム監視; ここではプルダウンで監視ジェムは変わらない」。
 * 監視するジェムは**手で選んだ分だけ**なので (既定 autoTop = false)、ここを変えても監視は変わらない。
 * 変わるのはこの一覧の中身だけ。
 */
const selectedClass = computed(() => {
  const k = watchSettings.value.klass ?? "";
  return k === MANUAL_ONLY ? "" : k;
});

/** 今出している結果が 1 アセンダンシーの物ならその名前 (散らした結果や未取得は null) */
const resultClass = computed(() => {
  const cs = result.value?.classes;
  return Array.isArray(cs) && cs.length === 1 ? cs[0] : null;
});
/** 選んだアセンダンシーの結果をまだ持っていない = 取得を促す */
const needFetch = computed(() => result.value == null || resultClass.value !== selectedClass.value);
/** 既定は 100 人 (search が返す上限) */
const topN = ref<number>(100);
/** 何アセンダンシーに散らすか (1 = 選んだアセだけ) */
const spread = ref<number>(1);
const busy = ref(false);
const error = ref("");
const progress = ref<{ phase: string; done: number; total: number; reused?: number } | null>(null);
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
    else void loadSeed(); // この PC でまだ取っていない → 同梱データ / 前回の結果を使う
    const n = Number(localStorage.getItem(TOPN_KEY));
    if (n >= 5 && n <= 100) topN.value = n;
    const sp = Number(localStorage.getItem(SPREAD_KEY));
    if (sp >= 1 && sp <= 10) spread.value = sp;
  } catch {
    /* 読めなくても取り直せる */
  }
}

/**
 * まだ一度も取っていない PC 用。app_data に置かれた集計結果 (インストーラ同梱分を含む) を読む
 * (オーナー指示 2026-09-18:「自動ジェム周りのデータだけ内蔵してビルドに食い込んで」)。
 */
async function loadSeed(): Promise<void> {
  if (!inApp) return;
  try {
    const stored = await invoke<Result | null>("gem_break_stored_result");
    if (stored && !result.value) {
      result.value = stored;
      localStorage.setItem(STORE_KEY, JSON.stringify(stored));
    }
  } catch {
    /* 無ければ普通に取得してもらう */
  }
}

/**
 * 取得先を変えた時: そのアセンダンシーを 1 リクエストも投げずに出せるなら差し替える。
 * 出せなければ何もしない (needFetch が立つので「取得」を促す)。
 */
async function showCached(): Promise<void> {
  if (!inApp || busy.value) return;
  try {
    const r = await invoke<Result | null>("gem_break_cached", {
      req: { class: selectedClass.value, topN: topN.value },
    });
    if (!r?.rows?.length) return;
    result.value = r;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(r));
      // アセンダンシーごとにも残す。監視は「自分の取得先」の分だけを読むので、
      // ここで別のアセを見ても監視リストは変わらない (2026-09-20)
      localStorage.setItem(`${STORE_KEY}.${selectedClass.value || "all"}`, JSON.stringify(r));
    } catch {
      /* 保存できなくても表示はできる */
    }
  } catch {
    /* キャッシュから出せないだけ。needFetch が「取得」を促す */
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
      req: { class: selectedClass.value, topN: topN.value, spread: selectedClass.value ? spread.value : 1 },
    });
    result.value = r;
    // 取得しただけでは監視は切り替えない (オーナー指示 2026-09-17:
    // 「アセンダンシー変えたら一覧取得後に表示して、自動取得開始ボタンがあれば便利」)。
    // 上の自動ジェム監視に「新しい一覧で監視を開始」ボタンが出るので、そこで明示的に切り替える。
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(r));
      // アセンダンシーごとにも残す。監視は「自分の取得先」の分だけを読むので、
      // ここで別のアセを見ても監視リストは変わらない (2026-09-20)
      localStorage.setItem(`${STORE_KEY}.${selectedClass.value || "all"}`, JSON.stringify(r));
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
  // キャッシュから流用した人数を出す (poe.ninja に取りに行くのは差分だけ)
  const reused = p.reused ? ` (うちキャッシュ ${p.reused} 人)` : "";
  return `キャラ取得中 ${p.done}/${p.total}${reused}`;
});

let unlisten: UnlistenFn | null = null;
watch(selectedClass, () => void showCached());
watch(resultClass, (v) => (rankingClass.value = v), { immediate: true });

onMounted(async () => {
  loadStored();
  await loadAscendancies();
  void showCached();
  if (inApp) {
    unlisten = await listen<{ phase: string; done: number; total: number; reused?: number }>("gem-break-progress", (e) => {
      progress.value = e.payload;
    });
  }
});
onUnmounted(() => {
  unlisten?.();
  stopNetPolling();
});

// 取得ボタンを上の「自動ジェム監視」に置いたので、親から押せるようにする (2026-09-19)
defineExpose({ fetchNow, cancelNow, busy, waiting, needFetch, topN, spread, selectedClass });
</script>

<template>
  <!-- 自動ジェム監視のページに埋め込まれる (2026-09-17 タブ統合)。単独ページの余白と h1 は持たない -->
  <section class="@container block rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-4 pl-5 text-[var(--exile-color-text-primary)]">
    <header class="mb-3">
      <h3 class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-[13px]">使用率ランキング (poe.ninja)</h3>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        上位プレイヤーが「レベル 21 / 品質 23% / 完成品」のジェムを実際に何人使っているかの人数ランキング。
        <span class="text-[var(--exile-color-text-primary)]">気になるジェムの「監視へ +」で、上の監視リストに入れられます (7 ジェムまで)。</span>
        行を押すと内訳 (何レベル / 何 % で使われているか) が出ます。
      </p>
      <!-- 細かい話はたたんでおく (2026-09-19 オーナー「分かりづらい、簡潔に」) -->
      <details class="mt-1">
        <summary class="text-[11px] text-[var(--exile-color-text-tertiary)] cursor-pointer select-none hover:text-[var(--exile-color-text-secondary)]">
          数え方と取得のしくみ
        </summary>
        <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-1">
          poe.ninja の全体集計にはジェムのレベル・品質が無いので、選んだアセンダンシーの上位キャラを直接読んで数えます
          (1 アセンダンシー = 人数 + 2 リクエスト。見たキャラは保存するので 2 回目以降は数分)。
          装備やアセンダンシーの「+1 to Level of Skills」は差し引き、コラプト済みのジェムだけを 21 / 23% として数えます。
          上位プレイヤーMOD一覧と同じ poe.ninja を叩くので、そちらの取得が終わった直後に相乗りして取り直します
          (間隔は設定の「自動再取得」、既定 3 日)。
        </p>
      </details>
    </header>

    <p v-if="!inApp" class="mb-3 text-[12px] text-amber-300">この画面はアプリ (ExileDesk) の中でだけ取得できます。</p>

    <div
      class="rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-3 text-[12px] mb-4 flex flex-wrap items-center gap-x-5 gap-y-2"
    >
      <!-- アセンダンシーの選択と取得は親から差し込む (オーナー指示 2026-09-20:
           「使用率ランキングと監視ジェム設定を一緒に。ここは使用率ランキングで統一」) -->
      <slot name="controls" />
      <span v-if="needFetch && !busy" class="text-[11px] text-amber-300">
        まだ取得していません。「ランキングを取得」を押してください
        <template v-if="result">（今出ているのは {{ resultClassJa }} の結果）</template>
      </span>
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
        poe.ninja のリミット待機中（あと {{ waitText(net.global_penalty_remaining_secs) }}<template v-if="resumeAtText(net.global_penalty_remaining_secs)">
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
        poe.ninja に再試行中 {{ net.active_retry_count }} 件
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
    <UsageTable v-else :rows="result.rows" />
  </section>
</template>

