<!--
  GemWatch.vue — 自動ジェム監視 (2026-09-17 オーナー指示)
  ---------------------------------------------------------------------------
  「何を捌き速度の追跡に入れるか」をここで決める。
    - 取得先 (アセンダンシー) / 並べる基準 / 上位何ジェム / 人数の下限 / 上限
    - 手で足したジェムの一覧 (検索で追加、一覧から削除)
    - 今監視している銘柄の状態 (3 条件の判定と記録件数)
  自動取得の動き (8 時間 1 巡) は市場側 (market_flow.rs) のまま。手動の一括取得はいつでも押せる。
-->
<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref } from "vue";
import BaseCard from "../components/decor/BaseCard.vue";
import SoldListDialog from "../components/SoldListDialog.vue";
import { SALE_KEYS, SALE_KEY_LABEL, watchKey } from "./gem-corrupt/row-query";
import { sampleBusy, sampleGemNow, sampleTarget } from "./gem-corrupt/sample-now";
import { jaSkill } from "../i18n/skills-ja";
import { GEMS } from "./gem-corrupt/useGemCorrupt";
/** 画面に出す日本語名 (無ければ英語名のまま) */
const jaGemName = (en: string): string => GEMS.find((g) => g.en === en)?.ja ?? en;
import { jaAscendancy } from "../i18n/ascendancies-ja";
import { loadFlow, loadFlowStatus, type FlowStatus, type FlowStore } from "../services/market-flow";
import { searchGems } from "./gem-corrupt/search";
import {
  addManualGem,
  dropWatchGem,
  forgetDropped,
  recentlyDropped,
  restoreWatchGem,
  resetWatchList,
  watchListEdited,
  updateWatchSettings,
  watchGems,
  watchSettings,
  MANUAL_ONLY,
  MAX_WATCH_GEMS,
  WATCH_METRIC_LABEL,
  type GemUsageRow,
  type WatchMetric,
} from "../state/watch-settings";
import { cachedRows, rebuildWatches } from "../state/gem-watch-auto";
import { ascendancies, loadAscendancies } from "../state/ascendancy-list";
import { resumeAtText, waitText } from "../utils/wait-text";
import { marketStore } from "../state/market-store";
// 旧「クラフト選定ジェム」タブ。取得と使用率ランキングはここに埋め込む (2026-09-17 タブを統合)
import GemUsageRanking from "./GemBreak.vue";
import WatchTable from "./gem-watch/WatchTable.vue";
import { useSweep } from "./gem-watch/use-sweep";
/** 使用率ランキング (下に埋め込んでいる) を上のボタンから押すための参照 */
const ranking = ref<InstanceType<typeof GemUsageRanking> | null>(null);

/** クラフト選定ジェムが保存した取得結果 (これを基準に上位を決める) */
const rows = ref<GemUsageRow[]>([]);
const flowStore = ref<FlowStore | null>(null);
const busy = ref(false);
const message = ref<{ ok: boolean; text: string } | null>(null);

const s = watchSettings;
/** 設定と取得結果から決まる「監視するジェム」 */
const gems = computed(() => watchGems(rows.value, s.value));

/**
 * 取得先の選択肢。使用率つきの一覧を poe.ninja から取る (使用率ランキングと同じ物)。
 * 2026-09-19 オーナー指示で、アセンダンシーの選択はここに一本化した
 * (使用率ランキング側のプルダウンは撤去)。取れていない間は空 = 全アセだけ出す。
 */
/** 選んだアセンダンシーの結果をまだ持っていない (下の使用率ランキングで「取得」が要る) */
/** カスタム監視スキル = 使用率ランキングを使わない */
const manualOnly = computed(() => s.value.klass === MANUAL_ONLY);

/**
 * 記録を読み直す。読むのはこの PC のファイルだけなので、何回呼んでも通信は発生しない
 * (オーナー指示 2026-09-17:「自動ジェム監視はアプリ内更新だからレート無い。タブ開くたびに読み直して。
 * 手動で取った情報が反映されないとズレる」)。
 */
const status = ref<FlowStatus | null>(null);
function reload(): void {
  rows.value = cachedRows() ?? [];
  void loadFlow().then((f) => {
    flowStore.value = f;
  });
  void loadFlowStatus().then((s) => (status.value = s));
}

/**
 * 監視している全銘柄を今すぐ 1 巡する (自動巡回と同じ処理を手で走らせるだけ)。
 * オーナー指示 2026-09-17:「一括取得は手動は自由で、自動が 8 時間に 1 回ね」→ 手で押す分に制限は付けない。
 */
/** レート制限の残り秒を毎秒数え直すための時計 */
const nowMs = ref(Date.now());
let tick: number | null = null;
// 一括取得と巡回の状態・時計・周期の設定は gem-watch/use-sweep.ts へ (2026-09-19 の分割)
const { sweeping, stopSweep, sweep, retryLeft, paceLeft, sweepClock, CYCLE_OPTIONS, sweepMinutes, cycleHours, applyCycle, sweepText } = useSweep({
  reload,
  message,
  status,
  nowMs,
  gemCount: () => gems.value.length,
});
onMounted(() => {
  reload();
  void loadAscendancies();
  // 期待値の計算に素材の相場が要る (30 分以内に取っていれば通信しない)
  void marketStore.ensureMarket();
  if (tick === null) tick = window.setInterval(() => (nowMs.value = Date.now()), 1000);
});
onActivated(() => {
  reload();
  if (tick === null) tick = window.setInterval(() => (nowMs.value = Date.now()), 1000);
  // 開いている間は 20 秒ごとに読み直す (別のタブで再取得した分がすぐ出るように)
  if (timer === null) timer = window.setInterval(reload, 20_000);
});
onDeactivated(() => {
  if (tick !== null) {
    clearInterval(tick);
    tick = null;
  }
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
});
onUnmounted(() => {
  if (tick !== null) clearInterval(tick);
  if (timer !== null) clearInterval(timer);
});
let timer: number | null = null;

// ---- 検索 (ジェムコラプトの賭けと同じ関数。正規表現も使える) ----
const query = ref("");
const search = computed(() => searchGems(query.value));
const matches = computed(() => search.value.hits);
// 副作用のない computed から取る (以前は matches の中で ref を書いていて、欄を空にしても警告が残った)
const regexError = computed(() => search.value.regexError);


/**
 * 設定を書き換えるだけ。監視の切り替えは「監視を開始」ボタンで明示的に行う
 * (オーナー指示 2026-09-17:「アセンダンシー変えるとすぐ自動取得が止まって新しいのが始まる。
 * 一覧を取得して表示してから、開始ボタンで始めたい」)。
 */
function apply(patch: Parameters<typeof updateWatchSettings>[0]): void {
  updateWatchSettings(patch);
}

/** 設定から決まる監視リストと、今まさに巡回している銘柄の差 */
const diff = computed(() => {
  const want = new Set(gems.value.map((g) => g.name));
  const now = new Set((flowStore.value?.watches ?? []).filter((w) => w.auto).map((w) => w.key.split("::")[0]));
  const add = [...want].filter((n) => !now.has(n));
  const drop = [...now].filter((n) => !want.has(n));
  return { add, drop, changed: add.length > 0 || drop.length > 0 };
});

/** 設定を追跡に反映する (poe.ninja は叩かず、保存済みの取得結果から作り直す) */
async function sync(confirmDrop = false): Promise<void> {
  if (busy.value) return;
  // 今測っているジェムが外れる時は先に確認 (間違えて押した時の保険。2026-09-20)
  if (confirmDrop && diff.value.drop.length > 0) {
    const names = diff.value.drop.map((n) => jaGemName(n)).join(" / ");
    if (!window.confirm(`今の監視から ${diff.value.drop.length} ジェム (${names}) が外れます。
続けますか?`)) return;
  }
  busy.value = true;
  try {
    const ok = await rebuildWatches();
    flowStore.value = await loadFlow();
    message.value = ok
      ? { ok: true, text: `監視リストを更新しました (${gems.value.length} ジェム / ${gems.value.length * 3} 銘柄)` }
      : { ok: false, text: "使用率ランキングをまだ取得していません。下の「取得」を押してください (手動で足したジェムは反映済み)" };
  } finally {
    busy.value = false;
  }
}

async function add(en: string): Promise<void> {
  if (!addManualGem(en)) {
    message.value = { ok: false, text: `追加できません (既に入っているか、上限 ${s.value.maxGems} ジェムに達しています)` };
    return;
  }
  query.value = "";
  await sync();
  // 足したその場で 3 条件の最安を 1 回ずつ取る (6 リクエスト)。オーナー 2026-09-19
  // 「監視ボタン押したら各項目の最安値だけ 1 件取れるみたいなのでいい、それでクラフトするか決める」
  busy.value = true;
  message.value = { ok: true, text: `監視に入れました。${jaGemName(en)} の 3 条件の最安を取っています… (6 リクエスト、約 40 秒)` };
  try {
    const r = await sampleGemNow(en);
    flowStore.value = await loadFlow();
    message.value =
      r.skipped === 0
        ? { ok: true, text: `${jaGemName(en)} の 3 条件の最安を取りました` }
        : { ok: false, text: `${jaGemName(en)}: ${r.done} / 3 条件を取りました。残りはトレードの枠待ちで飛ばしたので、次の巡回か「一括」で入ります` };
  } finally {
    busy.value = false;
  }
}
/**
 * 監視リストから 1 件外す。手で足した物は消し、使用率ランキングから入った物は除外に入れる
 * (オーナー指示 2026-09-20:「アセンダンシー選んでてもジェムのリスト変更できるように」)。
 */
async function remove(en: string): Promise<void> {
  dropWatchGem(en);
  await sync();
}
/**
 * 最近外したジェム (8 時間だけ置いておく)。オーナー指示 2026-09-20:
 * 「監視中ジェムの下に除外したジェムたちを 1 日だけ置いておこう。8 時間でキャッシュクリアで
 *   そこ表示しなくて OK になるように。メモリ機能的な」。
 * 1 秒ごとの時計 (nowMs) を見ているので、8 時間を過ぎた分は自然に消える。
 */
const dropped = computed(() => recentlyDropped(nowMs.value));
function restore(en: string): void {
  if (!restoreWatchGem(en)) {
    message.value = { ok: false, text: `戻せません (監視の上限 ${s.value.maxGems} ジェムに達しています)` };
    return;
  }
  void sync();
}

/**
 * 使用率ランキングを取り直す。
 * オーナー指示 2026-09-20:「もしジェムが入ってて間違えて取得ボタン押しちゃったら
 * 『上書きしますか』ポップアップを出そう」。上位を自動で入れる設定の時だけ、取り直すと
 * 監視リストが新しい上位で置き換わるので、その時は先に確認する
 * (手で選んでいる時は取り直しても監視リストは変わらないので、黙って取る)。
 */
async function fetchRanking(): Promise<void> {
  if (s.value.autoTop && gems.value.length > 0) {
    const ok = window.confirm(
      `「上位を自動で入れる」が有効です。取り直すと、今の ${gems.value.length} ジェムが新しい上位で置き換わります。
取得しますか?`,
    );
    if (!ok) return;
  }
  await ranking.value?.fetchNow();
}

/** 手で足した / 外した分を捨てて、使用率ランキングどおりの並びに戻す */
const listEdited = computed(() => watchListEdited(s.value));
async function resetList(): Promise<void> {
  const n = s.value.manual.length;
  if (n > 0 && !window.confirm(`手で足した ${n} ジェムも消して、使用率ランキングどおりの並びに戻します。よろしいですか?`)) return;
  resetWatchList();
  await sync();
  message.value = { ok: true, text: "監視リストを最初の並びに戻しました (記録は残っています)" };
}

/**
 * 設定に載っていないのに記録が残っているジェム。
 *
 * 以前は「ジェムコラプトの賭けで再取得を押す」と自動で手動登録されていたので、
 * その名残がここに出る。巡回には入っていないので、必要なら監視に入れられるようにする。
 */
const orphans = computed(() => {
  const inList = new Set(gems.value.map((g) => g.name));
  const names = new Map<string, number>();
  for (const w of flowStore.value?.watches ?? []) {
    const en = w.key.split("::")[0];
    if (inList.has(en)) continue;
    const st = flowStore.value?.states?.[w.key];
    names.set(en, (names.get(en) ?? 0) + (st?.tracked?.length ?? 0));
  }
  return [...names.entries()].map(([name, tracked]) => ({ name, tracked })).sort((a, b) => b.tracked - a.tracked);
});


// ---- 売れたリスト ----
const soldFor = ref("");
const soldOnly = ref<(typeof SALE_KEYS)[number] | null>(null);
const soldKeys = computed(() =>
  (soldOnly.value ? [soldOnly.value] : SALE_KEYS).map((k) => ({ key: watchKey(soldFor.value, k), label: SALE_KEY_LABEL[k] })),
);
const soldTitle = computed(() => (soldFor.value ? `${jaSkill(soldFor.value)}${soldOnly.value ? ` · ${SALE_KEY_LABEL[soldOnly.value]}` : ""}` : ""));
function openSold(en: string, key: (typeof SALE_KEYS)[number] | null): void {
  soldOnly.value = key;
  soldFor.value = en;
}
</script>

<template>
  <section class="p-6 @container">
    <!-- 監視中の一覧 (手で選んだジェム)。設定より先に出す (オーナー指示 2026-09-20:
         「上の監視ジェムだけ独立させて、その下に上の設定を持ってきて、その下にアセンダンシープルダウン」) -->
    <WatchTable :gems="gems" :flow-store="flowStore" @remove="remove" @open-sold="openSold" />

    <!-- 最近外したジェム (8 時間で消える一時置き場。オーナー指示 2026-09-20) -->
    <BaseCard v-if="dropped.length" class="mb-4">
      <div class="p-4 pl-5">
        <h3 class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-[13px] mb-1">最近外したジェム ({{ dropped.length }})</h3>
        <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mb-2">
          監視から外した分をしばらく置いておきます (8 時間で消えます)。売れ行きの記録は 7 日残るので、戻せば続きから測れます。
        </p>
        <ul class="flex flex-wrap gap-2">
          <li v-for="d in dropped" :key="d.name" class="flex items-center gap-2 px-2 py-1 rounded border border-[var(--exile-color-border-subtle)] text-[11px]">
            <span>{{ jaGemName(d.name) }}</span>
            <button type="button" class="underline text-[var(--exile-color-accent-focus)] hover:opacity-80" @click="restore(d.name)">戻す</button>
            <button type="button" class="underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-text-secondary)]" title="ここから消すだけ (監視には入りません)" @click="forgetDropped(d.name)">×</button>
          </li>
        </ul>
      </div>
    </BaseCard>

    <!-- 手動で足す -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <h3 class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-[13px] mb-2">ジェムを足す</h3>
        <label class="block text-[11px] text-[var(--exile-color-text-secondary)] mb-1">ジェム (日本語 / 英語 / 正規表現)</label>
        <input v-model="query" type="text" placeholder="例: アーク / Cast on / ^ヘラルド" class="num w-96 max-w-full" />
        <p v-if="regexError" class="text-[10px] text-amber-300 mt-1">正規表現として読めないので、普通の文字で探しています ({{ regexError }})</p>
        <ul v-if="matches.length" class="mt-2 border border-[var(--exile-color-border-subtle)] rounded divide-y divide-[var(--exile-color-border-subtle)] max-w-xl">
          <li v-for="g in matches" :key="g.en" class="flex items-center justify-between gap-3 px-3 py-1.5 text-[12px]">
            <span>
              {{ g.ja }}
              <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ g.en }}<span v-if="g.kind === 'meta'"> · メタジェム</span></span>
            </span>
            <button
              v-if="!s.manual.includes(g.en)"
              type="button"
              class="px-2 py-0.5 rounded border border-[var(--exile-color-border-brass)] text-[11px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]"
              @click="add(g.en)"
            >
              監視に入れる
            </button>
            <span v-else class="text-[11px] text-[var(--exile-color-text-tertiary)]">監視中</span>
          </li>
        </ul>
      </div>
    </BaseCard>

    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-1">自動ジェム監視</h2>
        <p class="text-[12px] text-[var(--exile-color-text-secondary)] mb-3">
          ここで選んだジェムを {{ status?.auto_off ? "手動の一括取得だけで" : `${cycleHours} 時間ごとに 1 巡して` }} 売れるまでの時間を測ります (1 ジェムにつきレベル 21 / 品質 23% / 完成品 の 3 条件。手動の一括取得もこの時計を進めます)。
          {{ manualOnly ? "カスタム監視スキル: 下の「ジェムを足す」で入れたジェムだけを監視します (使用率ランキングは使いません)。" : "上位は下の「使用率ランキング」で取得した結果から決まります。" }}
        </p>

        <!-- 設定 -->
        <div class="flex items-end gap-x-4 gap-y-2 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
          <!-- 使用率ランキングの操作はここに集約 (オーナー指示 2026-09-20:
               「使用率ランキング; ここでは何もプルダウンなしで基本設定は自動ジェム監視」)。
               **このプルダウンで監視ジェムは変わらない** (監視は手で選んだ分だけ。下の一覧の中身が変わる) -->
          <label class="inline-flex flex-col gap-1">
            使用率を見るアセンダンシー
            <select class="num w-56" :value="s.klass" @change="apply({ klass: ($event.target as HTMLSelectElement).value })">
              <option value="">全アセンダンシー (リーグ上位)</option>
              <option v-for="a in ascendancies" :key="a.class" :value="a.class">{{ jaAscendancy(a.class) }} ({{ a.percentage.toFixed(1) }}%)</option>
            </select>
          </label>
          <label v-if="s.klass" class="inline-flex flex-col gap-1">
            範囲
            <select class="num w-40" :value="ranking?.spread ?? 1" @change="ranking && (ranking.spread = Number(($event.target as HTMLSelectElement).value))">
              <option :value="1">選んだアセだけ</option>
              <option :value="3">上位 3 アセに散らす</option>
              <option :value="5">上位 5 アセに散らす</option>
            </select>
          </label>
          <label class="inline-flex flex-col gap-1">
            人数
            <select class="num w-24" :value="ranking?.topN ?? 100" @change="ranking && (ranking.topN = Number(($event.target as HTMLSelectElement).value))">
              <option :value="20">20 人</option>
              <option :value="40">40 人</option>
              <option :value="60">60 人</option>
              <option :value="100">100 人</option>
            </select>
          </label>
          <button
            type="button"
            :disabled="!!ranking?.busy"
            class="px-3 py-1 rounded border font-display tracking-[0.06em] hover:bg-[var(--exile-color-bg-elevated)] disabled:cursor-not-allowed"
            :class="ranking?.needFetch && !ranking?.busy ? 'border-amber-500/70 bg-amber-500/15 text-amber-200' : 'border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)]'"
            title="選んだアセンダンシーの使用率を poe.ninja から取り直します。一度取った分はそのまま出るので、取り直したい時だけ押してください"
            @click="fetchRanking"
          >
            {{ ranking?.busy ? (ranking?.waiting ? "待機中…" : "取得中…") : ranking?.needFetch ? "ランキングを取得" : "ランキングを取り直す" }}
          </button>
          <label v-if="s.autoTop && !manualOnly" class="inline-flex flex-col gap-1">
            上位の基準
            <select class="num w-56" :value="s.metric" @change="apply({ metric: ($event.target as HTMLSelectElement).value as WatchMetric })">
              <option v-for="(label, key) in WATCH_METRIC_LABEL" :key="key" :value="key">{{ label }}</option>
            </select>
          </label>
          <label v-if="s.autoTop && !manualOnly" class="inline-flex flex-col gap-1">
            人数の下限
            <input type="number" min="1" max="100" class="num w-20" :value="s.minUsers" @change="apply({ minUsers: Number(($event.target as HTMLInputElement).value) })" />
          </label>
          <label class="inline-flex flex-col gap-1">
            監視の上限
            <input type="number" min="1" :max="MAX_WATCH_GEMS" class="num w-20" :value="s.maxGems" @change="apply({ maxGems: Number(($event.target as HTMLInputElement).value) })" />
          </label>
          <label class="inline-flex flex-col gap-1">
            自動取得の間隔
            <select
              class="num w-36"
              :value="cycleHours"
              title="前回の一括取得 (手動でも自動でも) から何時間後に、自動でもう 1 巡するか。短いほど売れた時刻が細かく分かりますが、リクエストは増えます (trade2 の上限は毎時 100 回)"
              @change="applyCycle(Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="h in CYCLE_OPTIONS" :key="h" :value="h">{{ h }} 時間ごとに 1 巡</option>
              <option :value="0">自動取得しない (手動の一括だけ)</option>
            </select>
          </label>
          <label v-if="!manualOnly" class="inline-flex items-center gap-2 pb-1">
            <input type="checkbox" :checked="s.autoTop" @change="apply({ autoTop: ($event.target as HTMLInputElement).checked })" />
            上位を自動で入れる (既定は手で選んだ分だけ)
          </label>
          <!-- 手で足した / 外した分を捨てて元の並びに戻す (オーナー指示 2026-09-20「いつでも最初の並びに戻せるようにリセット機能つきで」) -->
          <button
            type="button"
            :disabled="!listEdited || busy"
            class="px-3 py-1 rounded border border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)] hover:text-[var(--exile-color-accent-focus)] disabled:opacity-40 disabled:cursor-not-allowed"
            :title="
              listEdited
                ? `手で足した ${s.manual.length} ジェムと外した ${s.excluded.length} ジェムを捨てて、使用率ランキングどおりの並びに戻します (売れ行きの記録は消えません)`
                : '手を入れていないので、今が最初の並びです'
            "
            @click="resetList"
          >
            ↺ リストを元に戻す
          </button>
          <!-- オーナー指示 2026-09-17: 自動巡回と同じ処理を手で 1 巡させるボタン -->
          <button
            type="button"
            :disabled="sweeping || !!status?.manual_sampling || sampleBusy"
            class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed"
            :title="sampleBusy ? `${jaGemName(sampleTarget)} の取得中です。終わってから押せます (通信が重ならないように 1 本ずつ流します)` : `監視している全銘柄を今すぐ 1 巡します (自動巡回と同じ処理)。銘柄数 × 2 回ほど検索します。手で押す分に回数の制限はなく、押した時刻から次の自動取得までの ${cycleHours} 時間を数え直します`"
            @click="sweep()"
          >
            {{ sampleBusy ? `${jaGemName(sampleTarget)} を取得中…` : sweeping || status?.sampling ? sweepText || "取得中…" : "⟳ 一括取得 (今すぐ 1 巡)" }}
          </button>
          <!-- 取り切るまで繰り返すので、途中でやめる口を取得中だけ出す (オーナー指示 2026-09-19) -->
          <button
            v-if="sweeping || status?.manual_sampling"
            type="button"
            class="px-3 py-1 rounded border border-amber-500/70 bg-amber-500/10 font-display tracking-[0.06em] text-amber-200 hover:bg-amber-500/20"
            title="一括取得をやめます。今取っている銘柄を取り終えたら止まります (取れた分の記録は残ります)"
            @click="stopSweep"
          >
            ■ 中止
          </button>
          <button
            type="button"
            :disabled="busy || !diff.changed"
            class="px-3 py-1 rounded border font-display tracking-[0.06em] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed"
            :class="diff.changed ? 'border-[var(--exile-color-accent-focus)] text-[var(--exile-color-accent-focus)]' : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-tertiary)]'"
            :title="diff.changed ? `入れる ${diff.add.map(jaSkill).join(', ') || 'なし'} / 外す ${diff.drop.map(jaSkill).join(', ') || 'なし'}` : '設定と監視中の銘柄は一致しています'"
            @click="sync(true)"
          >
            {{ busy ? "反映中…" : diff.changed ? `監視を開始 (+${diff.add.length} / -${diff.drop.length})` : "監視リストは最新です" }}
          </button>
        </div>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
          <template v-if="status?.auto_off">
            自動巡回は<span class="text-[var(--exile-color-text-secondary)]">しない設定</span>です。「一括取得」を押した時だけ回ります。
          </template>
          <template v-else>
            自動巡回は <span class="text-[var(--exile-color-text-secondary)]">1 巡およそ {{ sweepMinutes }} 分</span>で終わる速さに均して流します
            (今は {{ status?.pace_secs ?? 8 }} 秒おきに 1 回)。
            監視 {{ gems.length }} ジェム = {{ gems.length * 3 }} 銘柄 × 検索 1 回 + 値段 1 回 = 1 巡 {{ gems.length * 6 }} リクエストを、
            {{ cycleHours }} 時間ごとに回します。
          </template>
          手動の「一括取得」は上限の許す限り速く回すので、その間だけ待ちが出ます (自動とは別に走ります)。
          間隔を短くすると「消えた」のに気付くのが早くなる分、売れるまでの時間も細かく出ます。
          監視から外したジェムの記録は消えません。7 日間触られなかった分だけ掃除されるので、その間に戻せば<span class="text-[var(--exile-color-text-secondary)]">前の記録の続きから</span>追えます。
          記録を作り直すのは検索条件そのものが変わった時だけです (別の条件で貯めた記録は混ぜられないため)。
        </p>
        <p v-if="retryLeft > 0" class="text-[11px] text-amber-300 mt-1">
          トレードのレート制限中（あと {{ waitText(retryLeft) }}<template v-if="resumeAtText(retryLeft)"> · {{ resumeAtText(retryLeft) }} 頃に再開</template>）。解除まで取得は止まります
        </p>
        <p v-else-if="paceLeft > 0" class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-1">
          次の 1 本まで {{ waitText(paceLeft) }}（止まってはいません。一定の間隔で流しています）
        </p>
        <p v-if="sweepClock" class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-1">{{ sweepClock }}</p>
        <p v-if="message" class="text-[12px] mt-2" :class="message.ok ? 'text-emerald-300' : 'text-amber-300'">{{ message.text }}</p>
      </div>
    </BaseCard>

    <!-- 設定外だが記録が残っているジェム -->
    <BaseCard v-if="orphans.length" class="mt-4">
      <div class="p-4 pl-5">
        <h3 class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-[13px] mb-1">巡回に入っていないジェム ({{ orphans.length }})</h3>
        <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mb-2">
          記録はあるが監視には入っていないジェムです (手で外した分と、ジェムコラプトの賭けで「再取得」を押して記録だけ作られた分)。
          記録は 7 日で掃除されるので、続けて測りたい物は監視に戻してください。
        </p>
        <ul class="flex flex-wrap gap-2">
          <li v-for="o in orphans" :key="o.name" class="flex items-center gap-2 px-2 py-1 rounded border border-[var(--exile-color-border-subtle)] text-[11px]">
            <span>{{ jaSkill(o.name) }}</span>
            <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">記録 {{ o.tracked }} 件</span>
            <button type="button" class="underline text-[var(--exile-color-accent-focus)] hover:opacity-80" @click="add(o.name)">監視に入れる</button>
            <button type="button" class="underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" @click="openSold(o.name, null)">記録を見る</button>
          </li>
        </ul>
      </div>
    </BaseCard>

    <!-- 使用率ランキング (poe.ninja)。ここでアセンダンシーを選んで取得し、気になるジェムを「監視へ」で上に入れる -->
    <div class="mt-4">
      <GemUsageRanking ref="ranking" />
    </div>

    <SoldListDialog :open="soldFor !== ''" :title="soldTitle" :keys="soldKeys" :store="flowStore" @close="soldFor = ''" />
  </section>
</template>

