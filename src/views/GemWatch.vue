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
import SoldListDialog from "../components/SoldListDialog.vue";
import { SALE_KEYS, SALE_KEY_LABEL, watchKey } from "./gem-corrupt/row-query";
import { jaSkill } from "../i18n/skills-ja";
import { loadFlow, loadFlowStatus, type FlowStatus, type FlowStore } from "../services/market-flow";
import { flowBusyStatus } from "../state/fetch-busy";
import { watchGems, watchSettings, type GemUsageRow } from "../state/watch-settings";
import { cachedRows } from "../state/gem-watch-auto";
import { loadAscendancies } from "../state/ascendancy-list";
import { marketStore } from "../state/market-store";
// 旧「クラフト選定ジェム」タブ。取得と使用率ランキングはここに埋め込む (2026-09-17 タブを統合)
import GemUsageRanking from "./GemBreak.vue";
import WatchTable from "./gem-watch/WatchTable.vue";
import ScreenHeader from "../components/ScreenHeader.vue";
import { useSweep } from "./gem-watch/use-sweep";
// 画面の部品と操作は gem-watch/ へ (2026-09-26 の分割。見た目・動きは同じ)
import SweepControls from "./gem-watch/SweepControls.vue";
import DroppedGemsCard from "./gem-watch/DroppedGemsCard.vue";
import AddGemCard from "./gem-watch/AddGemCard.vue";
import RankingControls from "./gem-watch/RankingControls.vue";
import { useEvAttempts } from "./gem-watch/use-ev-attempts";
import { useWatchActions } from "./gem-watch/use-watch-actions";
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
// 一覧の期待値を出す回数 (この PC に残す) は gem-watch/use-ev-attempts.ts
const evAttempts = useEvAttempts();

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

// 検索欄の文字 (検索と候補は gem-watch/AddGemCard.vue)
const query = ref("");
// 設定の書き換え・監視リストの反映 / 足す / 外す / 戻す・ランキングの取り直しは gem-watch/use-watch-actions.ts
const { apply, diff, sync, add, remove, watchFull, dropped, restore, fetchRanking } = useWatchActions({
  gems,
  flowStore,
  busy,
  message,
  query,
  nowMs,
  fetchNow: () => ranking.value?.fetchNow(),
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
        <SweepControls
          v-model:ev-attempts="evAttempts"
          :cycle-hours="cycleHours"
          :cycle-options="CYCLE_OPTIONS"
          :max-gems="s.maxGems"
          :sweeping="sweeping"
          :status="status"
          :busy="busy"
          :diff="diff"
          :retry-left="retryLeft"
          :pace-left="paceLeft"
          :sweep-clock="sweepClock"
          :sweep-text="sweepText"
          :message="message"
          @apply-cycle="applyCycle"
          @apply="apply"
          @sweep="sweep()"
          @stop-sweep="stopSweep"
          @sync="sync"
        />
      </template>
    </WatchTable>


    <!-- 最近外したジェム (8 時間で消える一時置き場。オーナー指示 2026-09-20) -->
    <DroppedGemsCard :dropped="dropped" @restore="restore" />

    <!-- 手動で足す -->
    <AddGemCard v-model:query="query" :manual="s.manual" @add="add" />

    <!-- 使用率ランキング。アセンダンシーの選択と取得もここに統一 (オーナー指示 2026-09-20) -->
    <div class="mt-4">
      <GemUsageRanking ref="ranking">
        <template #controls>
          <RankingControls
            :settings="s"
            :watch-full="watchFull"
            :ranking-busy="!!ranking?.busy"
            :ranking-waiting="!!ranking?.waiting"
            :ranking-need-fetch="!!ranking?.needFetch"
            :ranking-fetched-at="ranking?.fetchedAt ?? 0"
            @apply="apply"
            @fetch="fetchRanking"
          />
        </template>
      </GemUsageRanking>
    </div>


    <SoldListDialog :open="soldFor !== ''" :title="soldTitle" :keys="soldKeys" :store="flowStore" @close="soldFor = ''" />
  </section>
</template>

