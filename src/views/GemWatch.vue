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
    <!-- 監視中の一覧 (手で選んだジェム 7 個まで)。操作もこのカードに入れる -->
    <WatchTable :gems="gems" :flow-store="flowStore" @remove="remove" @open-sold="openSold">
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
          <!-- 自動巡回と同じ処理を手で 1 巡させる。他の取得が走っている間は押せない (2026-09-20) -->
          <button
            type="button"
            :disabled="sweeping || !!status?.manual_sampling || sampleBusy"
            class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed"
            :title="sampleBusy ? `${jaGemName(sampleTarget)} の取得中です。終わってから押せます (通信が重ならないように 1 本ずつ流します)` : '監視している全銘柄を今すぐ 1 巡します (自動巡回と同じ処理)。銘柄数 × 2 回ほど検索します'"
            @click="sweep()"
          >
            {{ sampleBusy ? `${jaGemName(sampleTarget)} を取得中…` : sweeping || status?.sampling ? sweepText || "取得中…" : "⟳ 一括取得 (今すぐ 1 巡)" }}
          </button>
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

