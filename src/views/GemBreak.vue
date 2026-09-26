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
import { resumeAtText, waitText } from "../utils/wait-text";
import { MANUAL_ONLY, watchSettings } from "../state/watch-settings";
import { rankingClass } from "../state/gem-watch-auto";
import { loadAscendancies } from "../state/ascendancy-list";
import UsageTable from "./gem-watch/UsageTable.vue";
import UsageRankingHeader from "./gem-watch/UsageRankingHeader.vue";
// 型・poe.ninja の待ち状態・見出しの文は gem-watch/ へ (2026-09-26 の分割)
import type { Progress, Result } from "./gem-watch/gem-break-types";
import { useNetStatus } from "./gem-watch/use-net-status";
import { useUsageDisplay } from "./gem-watch/usage-display";

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
const progress = ref<Progress | null>(null);
/** poe.ninja のレート制限 / 再試行の状態 (MOD 一覧のヘッダーと同じ物を出す) */
const { net, startNetPolling, stopNetPolling } = useNetStatus(inApp);

/** 取得を中止する (レート制限待ちが長い時の逃げ道)。取れた分までで結果が返る */
async function cancelNow(): Promise<void> {
  if (!busy.value) return;
  try {
    await invoke("gem_break_cancel");
  } catch {
    /* 失敗しても取得側はいずれ終わる */
  }
}

/** そのアセンダンシーで前に出した結果 (この PC に残っている分) */
function storedFor(klass: string): Result | null {
  try {
    const raw = localStorage.getItem(`${STORE_KEY}.${klass || "all"}`);
    return raw ? (JSON.parse(raw) as Result) : null;
  } catch {
    return null;
  }
}

function loadStored(): void {
  try {
    const mine = storedFor(selectedClass.value);
    const raw = mine ? JSON.stringify(mine) : localStorage.getItem(STORE_KEY);
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
  if (busy.value) return;
  // まずこの PC に残っている前回の結果を出す (通信も IPC もしない)。
  // オーナー指摘 2026-09-20:「使用率のアセンダンシー、一度取得したらキャッシュで表示してくれ。
  // なんか毎回取得してる気がする」。Rust 側のキャッシュは 6 時間で切れるので、
  // 半日空けてアセンダンシーを選び直すと毎回「ランキングを取得」に戻っていた。
  // 使用率の顔ぶれが変わるのは 3 日に 1 回の扱いなので、表示は前の物で構わない。
  const mine = storedFor(selectedClass.value);
  if (mine?.rows?.length) result.value = mine;
  if (!inApp) return;
  try {
    const r = await invoke<Result | null>("gem_break_cached", {
      req: { class: selectedClass.value, topN: topN.value },
    });
    if (!r?.rows?.length) return;
    // 手元に残っている方が新しければそのまま (Rust のキャッシュは取り直すと古い方に戻ることがある)
    if (mine?.rows?.length && (mine.fetched_at ?? 0) > (r.fetched_at ?? 0)) return;
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

/** 集計対象の表示名・取得時刻・待機中・進み具合・母数不足 (gem-watch/usage-display.ts) */
const { resultClassJa, fetchedAtText, waiting, doneText, shortfall, progressText } = useUsageDisplay(result, progress, busy, net);

let unlisten: UnlistenFn | null = null;
watch(selectedClass, () => void showCached());
watch(resultClass, (v) => (rankingClass.value = v), { immediate: true });

onMounted(async () => {
  loadStored();
  await loadAscendancies();
  void showCached();
  if (inApp) {
    unlisten = await listen<Progress>("gem-break-progress", (e) => {
      progress.value = e.payload;
    });
  }
});
onUnmounted(() => {
  unlisten?.();
  stopNetPolling();
});

// 取得ボタンを上の「自動ジェム監視」に置いたので、親から押せるようにする (2026-09-19)
/** 今出している結果をいつ取ったか (unix 秒)。0 = まだ何も無い。
 *  キャッシュで出していることが分かるように画面に出す (オーナー指摘 2026-09-20) */
const fetchedAt = computed(() => result.value?.fetched_at ?? 0);
defineExpose({ fetchNow, cancelNow, busy, waiting, needFetch, topN, spread, selectedClass, fetchedAt });
</script>

<template>
  <!-- 自動ジェム監視のページに埋め込まれる (2026-09-17 タブ統合)。単独ページの余白と h1 は持たない -->
  <section class="@container block rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-4 pl-5 text-[var(--exile-color-text-primary)]">
    <UsageRankingHeader />

    <p v-if="!inApp" class="mb-3 text-[12px] text-amber-300">この画面はアプリ (ExileDesk) の中でだけ取得できます。</p>

    <div
      class="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px] mb-4 flex flex-wrap items-center gap-x-5 gap-y-2"
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

