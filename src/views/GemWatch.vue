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
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from "vue";
import BaseCard from "../components/decor/BaseCard.vue";
import SoldListDialog from "../components/SoldListDialog.vue";
import { SALE_KEYS, SALE_KEY_LABEL, watchKey } from "./gem-corrupt/row-query";
import { queueSample, sampleBusy, sampleQueued, sampleTarget } from "./gem-corrupt/sample-now";
import { jaSkill } from "../i18n/skills-ja";
import { GEMS } from "./gem-corrupt/useGemCorrupt";
/** 画面に出す日本語名 (無ければ英語名のまま) */
const jaGemName = (en: string): string => GEMS.find((g) => g.en === en)?.ja ?? en;
import { jaAscendancy } from "../i18n/ascendancies-ja";
import { loadFlow, loadFlowStatus, type FlowStatus, type FlowStore } from "../services/market-flow";
import { fmtClock } from "../utils/format-time";
import { flowBusyStatus } from "../state/fetch-busy";
import { searchGems } from "./gem-corrupt/search";
import {
  addManualGem,
  dropWatchGem,
  forgetDropped,
  recentlyDropped,
  restoreWatchGem,
  updateWatchSettings,
  watchGems,
  watchSettings,
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
import AttemptsSelect from "../components/AttemptsSelect.vue";
import ScreenHeader from "../components/ScreenHeader.vue";
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

/**
 * 記録を読み直す。読むのはこの PC のファイルだけなので、何回呼んでも通信は発生しない
 * (オーナー指示 2026-09-17:「自動ジェム監視はアプリ内更新だからレート無い。タブ開くたびに読み直して。
 * 手動で取った情報が反映されないとズレる」)。
 */
/**
 * 一覧の期待値を出す回数 (オーナー指示 2026-09-20)。この PC に残す。
 * ジェムコラプトの賭けの回数とは別 (あちらはジェムごとの帳簿の回数)。
 */
const EV_ATTEMPTS_KEY = "exiledesk.gem-watch.evAttempts";
const evAttempts = ref<number>(
  (() => {
    try {
      const n = Number(localStorage.getItem(EV_ATTEMPTS_KEY));
      return n >= 1 ? n : 30;
    } catch {
      return 30;
    }
  })(),
);
watch(evAttempts, (n) => {
  try {
    localStorage.setItem(EV_ATTEMPTS_KEY, String(n));
  } catch {
    /* 残せなくても動く */
  }
});

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
const { sweeping, stopSweep, sweep, retryLeft, paceLeft, sweepClock, CYCLE_OPTIONS, cycleHours, applyCycle, sweepText } = useSweep({
  reload,
  message,
  status,
  nowMs,
  gemCount: () => gems.value.length,
});
/**
 * 取得の状態はアプリ全体で 1 か所 (state/fetch-busy.ts) が 2 秒ごとに見ている。
 * この画面は 20 秒ごとの読み直しなので、そのままだと中止を押しても 20 秒近く
 * 「取得中」のまま押せなかった (2026-09-20 の確認で判明)。新しい方に合わせる。
 */
watch(flowBusyStatus, (v) => {
  if (v) status.value = v;
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
  // 取得は待ち行列に回す (走っていても続けて足せる。2026-09-20)
  queueSample(en);
  message.value = { ok: true, text: `監視に入れました。${jaGemName(en)} の 3 条件を順番に取ります (10 秒後に開始)` };
}
/**
 * 監視リストから 1 件外す。手で足した物は消し、使用率ランキングから入った物は除外に入れる
 * (オーナー指示 2026-09-20:「アセンダンシー選んでてもジェムのリスト変更できるように」)。
 */
async function remove(en: string): Promise<void> {
  dropWatchGem(en);
  await sync();
}
/** 監視の枠が埋まっているか (「監視へ +」が押せない理由を画面に出す) */
const watchFull = computed(() => s.value.manual.length >= s.value.maxGems);

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

/**
 * プルダウンに出すアセンダンシー: poe.ninja の**使用率が多い順に上位 8 個**
 * (オーナー指示 2026-09-20:「範囲は忍者の上位 8 アセンダンシーを…使用率だけ多い順に並べて上から。
 *  これはアプリを開くときにチェックして違うなら変える」)。一覧は起動のたびに取り直す。
 * 今選んでいる物が 8 位圏外に落ちても、選択が消えないように残す。
 */
const topAscendancies = computed(() => {
  const sorted = [...ascendancies.value].sort((a, b) => b.percentage - a.percentage);
  const top = sorted.slice(0, 8);
  const cur = s.value.klass;
  if (cur && !top.some((a) => a.class === cur)) {
    const hit = sorted.find((a) => a.class === cur);
    if (hit) top.push(hit);
  }
  return top;
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
    <!-- 他の画面と同じ見出し (2026-09-21 オーナー指示「UI とか UX 周り、統一感持たせて」)。
         一括取得のボタンはこの画面の主役なので下のカードの操作に残す -->
    <ScreenHeader title="自動ジェム監視">
      監視するジェムの 3 条件 (レベル 21 / 品質 23% / 完成品) の最安と出品数を周期ごとに取り、売れるまでの時間を測ります。期待値の高い順に並びます。
      <template #source>
        売値と捌き速度: trade2 (一括取得と自動取得) · {{ sweepClock || "まだ 1 巡していません" }} / 使用率: poe.ninja
      </template>
    </ScreenHeader>
    <!-- 監視中の一覧 (手で選んだジェム 7 個まで)。操作もこのカードに入れる -->
    <WatchTable :gems="gems" :flow-store="flowStore" :attempts="evAttempts" @remove="remove" @open-sold="openSold">
      <template #controls>
        <div class="flex items-end gap-x-4 gap-y-2 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
          <label class="inline-flex flex-col gap-1">
            自動取得の間隔
            <select
              class="num w-44"
              :value="cycleHours"
              title="前回の一括取得 (手動でも自動でも) から何時間後に、自動でもう 1 巡するか。既定は「しない」で、押した時だけ回ります"
              @change="applyCycle(Number(($event.target as HTMLSelectElement).value))"
            >
              <option :value="0">自動取得しない (一括だけ)</option>
              <option v-for="h in CYCLE_OPTIONS" :key="h" :value="h">{{ h }} 時間ごとに 1 巡</option>
            </select>
          </label>
          <label class="inline-flex flex-col gap-1">
            監視の上限
            <input type="number" min="1" :max="MAX_WATCH_GEMS" class="num w-20" :value="s.maxGems" @change="apply({ maxGems: Number(($event.target as HTMLInputElement).value) })" />
          </label>
          <!-- 期待値を出す回数 (オーナー指示 2026-09-20:「上限の横にプルダウンで回数。5 ずつ 100 まで回数した時の期待値収益」) -->
          <label class="inline-flex flex-col gap-1" title="一覧の「期待値」をこの回数ぶんで出します (1 回あたり × 回数)">
            期待値の回数
            <AttemptsSelect v-model="evAttempts" />
          </label>
          <!--
            自動巡回と同じ処理を手で 1 巡させる。
            オーナー指示 2026-09-20:「巡回中は他の取得は触れないようにしよう」。
            自動巡回が走っている間も押せない (以前は押せたので、押しても順番待ちに並ぶだけで
            何も起きず「止まって見える」状態だった)。中止すればすぐ押せる。
          -->
          <button
            type="button"
            :disabled="sweeping || !!status?.sampling || sampleBusy"
            class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[11px] tabular-nums text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            :title="
              sampleBusy
                ? `${jaGemName(sampleTarget)} の取得中です。終わってから押せます (通信が重ならないように 1 本ずつ流します)`
                : status?.auto_sampling && !status?.manual_sampling
                  ? '自動巡回が走っています。止めたい時は右の「中止」を押してください'
                  : '監視している全銘柄を今すぐ 1 巡します (自動巡回と同じ処理)。銘柄数 × 2 回ほど検索します'
            "
            @click="sweep()"
          >
            {{ sampleBusy ? `${jaGemName(sampleTarget)} を取得中…${sampleQueued > 0 ? ` (あと ${sampleQueued} 件)` : ""}` : sweeping || status?.sampling ? sweepText || "取得中…" : "⟳ 一括取得 (今すぐ 1 巡)" }}
          </button>
          <button
            v-if="sweeping || !!status?.sampling"
            type="button"
            class="px-3 py-1 rounded border border-amber-500/70 bg-amber-500/10 font-display tracking-[0.06em] text-[11px] text-amber-200 hover:bg-amber-500/20 transition-colors"
            title="取得をやめます。今取っている銘柄を取り終えたら止まります (取れた分の記録は残ります)。自動巡回も止められます"
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
        <p v-if="retryLeft > 0" class="text-[11px] text-amber-300 mt-1">
          トレードのレート制限中（あと {{ waitText(retryLeft) }}<template v-if="resumeAtText(retryLeft)"> · {{ resumeAtText(retryLeft) }} 頃に再開</template>）。解除まで取得は止まります
        </p>
        <p v-else-if="paceLeft > 0" class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-1">
          次の 1 本まで {{ waitText(paceLeft) }}（止まってはいません。一定の間隔で流しています）
        </p>
        <p v-if="sweepClock" class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-1">{{ sweepClock }}</p>
        <p v-if="message" class="text-[12px] mt-1" :class="message.ok ? 'text-emerald-300' : 'text-amber-300'">{{ message.text }}</p>
      </template>
    </WatchTable>


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

    <!-- 使用率ランキング。アセンダンシーの選択と取得もここに統一 (オーナー指示 2026-09-20) -->
    <div class="mt-4">
      <GemUsageRanking ref="ranking">
        <template #controls>
          <!-- 押せない理由はその場に出す (オーナー報告 2026-09-20「監視へが反応しない」= 枠が埋まっていた) -->
          <span v-if="watchFull" class="text-[11px] text-amber-300">
            監視は {{ s.maxGems }} ジェムまでです (今 {{ s.manual.length }})。上の一覧から外すと「監視へ +」が押せます
          </span>
          <label class="inline-flex items-center gap-2 min-w-0">
            <span class="text-[var(--exile-color-text-secondary)]">アセンダンシー</span>
            <select class="sel w-64" :value="s.klass" @change="apply({ klass: ($event.target as HTMLSelectElement).value })">
              <option value="">全アセンダンシー (リーグ全体の上位)</option>
              <option v-for="a in topAscendancies" :key="a.class" :value="a.class">{{ jaAscendancy(a.class) }} ({{ a.percentage.toFixed(1) }}%)</option>
            </select>
          </label>
          <button
            type="button"
            :disabled="!!ranking?.busy"
            class="px-3 py-1 rounded border font-display tracking-[0.06em] hover:bg-[var(--exile-color-bg-elevated)] disabled:cursor-not-allowed"
            :class="ranking?.needFetch && !ranking?.busy ? 'border-amber-500/70 bg-amber-500/15 text-amber-200' : 'border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)]'"
            title="選んだアセンダンシーの使用率を poe.ninja から取り直します (上位 100 人)。一度取った分はそのまま出るので、取り直したい時だけ押してください"
            @click="fetchRanking"
          >
            {{ ranking?.busy ? (ranking?.waiting ? "待機中…" : "取得中…") : ranking?.needFetch ? "ランキングを取得" : "ランキングを取り直す" }}
          </button>
          <!-- 取り直していないことが分かるように、出している結果の取得時刻を出す (オーナー指摘 2026-09-20) -->
          <span v-if="ranking?.fetchedAt" class="text-[11px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">
            {{ fmtClock(ranking.fetchedAt) }} に取得した分を表示中
          </span>
          <label class="inline-flex items-center gap-2">
            <input type="checkbox" :checked="s.autoTop" @change="apply({ autoTop: ($event.target as HTMLInputElement).checked })" />
            上位を自動で監視に入れる
          </label>
          <label v-if="s.autoTop" class="inline-flex items-center gap-2">
            <span class="text-[var(--exile-color-text-secondary)]">基準</span>
            <select class="sel w-52" :value="s.metric" @change="apply({ metric: ($event.target as HTMLSelectElement).value as WatchMetric })">
              <option v-for="(label, key) in WATCH_METRIC_LABEL" :key="key" :value="key">{{ label }}</option>
            </select>
          </label>
          <label v-if="s.autoTop" class="inline-flex items-center gap-2">
            <span class="text-[var(--exile-color-text-secondary)]">人数の下限</span>
            <input type="number" min="1" max="100" class="sel w-16" :value="s.minUsers" @change="apply({ minUsers: Number(($event.target as HTMLInputElement).value) })" />
          </label>
        </template>
      </GemUsageRanking>
    </div>


    <SoldListDialog :open="soldFor !== ''" :title="soldTitle" :keys="soldKeys" :store="flowStore" @close="soldFor = ''" />
  </section>
</template>

