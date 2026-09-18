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
import { GEMS } from "./gem-corrupt/useGemCorrupt";
import { SALE_KEYS, SALE_KEY_LABEL, watchKey } from "./gem-corrupt/row-query";
import { jaSkill } from "../i18n/skills-ja";
import { jaAscendancy } from "../i18n/ascendancies-ja";
import { DEFAULT_CYCLE_SECS, flowSentence, fmtSellTime, loadFlow, loadFlowStatus, setFlowCycle, summarizeFlow, sweepNow, type FlowStatus, type FlowStore } from "../services/market-flow";
import { fmtClock } from "../utils/format-time";
import { searchGems } from "./gem-corrupt/search";
import { averageExalted, displayCurrency } from "../state/display-currency";
import {
  addManualGem,
  removeManualGem,
  updateWatchSettings,
  watchGems,
  watchSettings,
  WATCH_METRIC_LABEL,
  type GemUsageRow,
  type WatchMetric,
} from "../state/watch-settings";
import { cachedRows, rebuildWatches } from "../state/gem-watch-auto";
import { tradeAuto } from "../services/trade2/auto-price";
import { expectedValueOf } from "./gem-corrupt/expected-value";
import { marketStore } from "../state/market-store";
import { openGemCorrupt } from "../state/app-nav";
// 旧「クラフト選定ジェム」タブ。取得と使用率ランキングはここに埋め込む (2026-09-17 タブを統合)
import GemUsageRanking from "./GemBreak.vue";

/** クラフト選定ジェムが保存した取得結果 (これを基準に上位を決める) */
const rows = ref<GemUsageRow[]>([]);
const flowStore = ref<FlowStore | null>(null);
const busy = ref(false);
const message = ref<{ ok: boolean; text: string } | null>(null);

const s = watchSettings;
/** 設定と取得結果から決まる「監視するジェム」 */
const gems = computed(() => watchGems(rows.value, s.value));

/** 取得結果に出てくるアセンダンシー一覧 (取得先の選択肢) */
const ASCENDANCIES = [
  "",
  "Infernalist",
  "Blood Mage",
  "Stormweaver",
  "Chronomancer",
  "Titan",
  "Warbringer",
  "Deadeye",
  "Pathfinder",
  "Witchhunter",
  "Gemling Legionnaire",
  "Invoker",
  "Acolyte of Chayula",
  "Ritualist",
  "Lich",
  "Amazon",
  "Smith of Kitava",
  "Tactician",
];

/**
 * 記録を読み直す。読むのはこの PC のファイルだけなので、何回呼んでも通信は発生しない
 * (オーナー指示 2026-09-17:「自動ジェム監視はアプリ内更新だからレート無い。タブ開くたびに読み直して。
 * 手動で取った情報が反映されないとズレる」)。
 */
const readAt = ref<number>(0);
const status = ref<FlowStatus | null>(null);
function reload(): void {
  rows.value = cachedRows() ?? [];
  void loadFlow().then((f) => {
    flowStore.value = f;
    readAt.value = Date.now();
  });
  void loadFlowStatus().then((s) => (status.value = s));
}

/**
 * 監視している全銘柄を今すぐ 1 巡する (自動巡回と同じ処理を手で走らせるだけ)。
 * オーナー指示 2026-09-17:「一括取得は手動は自由で、自動が 8 時間に 1 回ね」→ 手で押す分に制限は付けない。
 */
const sweeping = ref(false);
async function sweep(reason?: string): Promise<void> {
  if (sweeping.value || status.value?.sampling) return;
  sweeping.value = true;
  message.value = { ok: true, text: `${reason ? `${reason} ` : ""}一括取得を始めました (終わるまで数分かかります)` };
  const poll = window.setInterval(reload, 3000);
  try {
    const ok = await sweepNow();
    message.value = ok
      ? { ok: true, text: "一括取得が終わりました" }
      : { ok: false, text: "一括取得に失敗しました (レート制限か通信)" };
  } finally {
    clearInterval(poll);
    sweeping.value = false;
    reload();
  }
}

/** 前回の一括取得 / 次の自動取得 (手動で押した分も同じ時計を使う) */
const sweepClock = computed(() => {
  const st = status.value;
  if (!st) return "";
  const last = st.swept_at > 0 ? `前回の一括取得 ${fmtClock(st.swept_at)}` : "まだ 1 巡していません";
  const next = st.swept_at > 0 ? ` · 次の自動取得 ${fmtClock(st.next_at)}` : "";
  return `${last}${next}`;
});

/**
 * 自動取得の間隔 (オーナー指示 2026-09-17:「自動取得の時間数を UI で変更できるようにしたい」)。
 * 記録側 (market_flow.rs) が持っている値をそのまま出し入れする。
 * 前回の一括取得 (手動でも自動でも) からこの時間ぶん経ったら、全銘柄をまとめて 1 巡する。
 */
const CYCLE_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 24];
const cycleHours = computed(() => Math.round(((status.value?.cycle_secs ?? DEFAULT_CYCLE_SECS) / 3600) * 10) / 10);
async function applyCycle(hours: number): Promise<void> {
  const applied = await setFlowCycle(Math.round(hours * 3600));
  status.value = await loadFlowStatus();
  if (applied == null) {
    message.value = { ok: false, text: "間隔を変更できませんでした" };
    return;
  }
  const st = status.value;
  const h = Math.round(applied / 3600);
  const swept = !!st && st.swept_at > 0;
  /**
   * 新しい間隔で見てもう予定時刻を過ぎているなら、そのまま 1 巡して周期を始める
   * (オーナー指示 2026-09-17:「もし一括取得できるなら、そのまま一括取得周期開始しよう」)。
   */
  const due = !st || !swept || st.next_at <= Math.floor(Date.now() / 1000);
  if (due && !st?.sampling && !sweeping.value) {
    const why = swept ? `前回の一括取得は ${fmtClock(st.swept_at)} で、もう ${h} 時間経っているので` : "まだ 1 巡していないので";
    await sweep(`自動取得を ${h} 時間ごとにしました。${why}`);
    return;
  }
  message.value = {
    ok: true,
    text: `自動取得を ${h} 時間ごとにしました。前回の一括取得は ${fmtClock(st?.swept_at)} · 次の自動取得は ${fmtClock(st?.next_at)}`,
  };
}

/**
 * 取得中の進捗表示。レート制限の残り秒は共通の時計 (tradeAuto) から取るので、
 * 待っている間もちゃんと減っていく (オーナー指示 2026-09-17:
 * 「取得中でレート制限の秒数動かすようにして、一律で同じところを見るように」)。
 */
const sweepText = computed(() => {
  const s = status.value;
  if (!s?.sampling) return "";
  // 自動巡回は周期いっぱいに薄く流すので、「待ち」ではなく間隔として出す
  if (!sweeping.value && s.pace_secs > 5) {
    return `自動巡回中 ${s.sweep_done}/${s.total || gems.value.length * 3} 銘柄 · ${s.pace_secs} 秒おき${s.current ? ` · ${s.current}` : ""}`;
  }
  // 罰則待ちも通常の間隔待ちも同じ時計で出す (裏の門番 = pace_until、画面側 = tradeAuto)
  const wait = Math.max(tradeAuto.waitSecs.value, (s.pace_until || 0) - Math.floor(Date.now() / 1000));
  // 残り時間の目安。trade2 の上限 (5 分に 30 回) から、1 銘柄あたり約 20 秒で見積もる
  const left = Math.max(0, s.total - s.done);
  const eta = left > 0 ? ` · 残りおよそ ${Math.max(1, Math.round((left * 20) / 60))} 分` : "";
  return `取得中 ${s.done}/${s.total}${eta}${wait > 0 ? ` · トレードのレート待ち ${wait} 秒` : ""}${s.current ? ` · ${s.current}` : ""}`;
});
onMounted(() => {
  reload();
  // 期待値の計算に素材の相場が要る (30 分以内に取っていれば通信しない)
  void marketStore.ensureMarket();
});
onActivated(() => {
  reload();
  // 開いている間は 20 秒ごとに読み直す (別のタブで再取得した分がすぐ出るように)
  if (timer === null) timer = window.setInterval(reload, 20_000);
});
onDeactivated(() => {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
});
onUnmounted(() => {
  if (timer !== null) clearInterval(timer);
});
let timer: number | null = null;
const readAtText = computed(() => {
  if (!readAt.value) return "";
  const d = new Date(readAt.value);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
});

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
async function sync(): Promise<void> {
  if (busy.value) return;
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
}
async function remove(en: string): Promise<void> {
  removeManualGem(en);
  await sync();
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

/**
 * 期待値を出す時の試行回数 (オーナー指示 2026-09-17:「期待値は 30 回回した時の期待値で」)。
 * 1 回だと金額が小さすぎて差が見えないため、30 回分でまとめて出す。
 */
const EV_ATTEMPTS = 30;

/** スピリットジェムかどうか (期待値の素材が別物なので要る) */
const SPIRIT = new Map(GEMS.map((g) => [g.en, g.spirit]));

/**
 * 1 行分の計算。期待値は実売の平均をジェムコラプトの賭けの式に入れて出し、画面には今の最安値を出す。
 * 「1 回回したら手元にいくら残るか」(期待値) を出す (オーナー指示 2026-09-17)。
 */
const scoredGems = computed(() => {
  return gems.value.map((gem) => {
    const cs = cells(gem.name);
    const price: Record<(typeof SALE_KEYS)[number], number | null> = { level21: null, quality23: null, finished: null };
    const fastKeys = new Set<string>();
    for (const c of cs) {
      // 見出しを押した時の並べ替えは、画面に出ている値 (今の最安値) で
      price[c.key] = c.cheapest;
      if (c.tone === "fast") fastKeys.add(c.key);
    }
    // 期待値は**実売の平均**で計算する (画面に出す最安値ではない。オーナー指示 2026-09-18:
    // 「並び順だけ上から 3 つの平均で期待値を出すだけ」)
    const soldAvg: Record<(typeof SALE_KEYS)[number], number | null> = { level21: null, quality23: null, finished: null };
    for (const c of cs) soldAvg[c.key] = c.avgExalted;
    const e = expectedValueOf({ spirit: SPIRIT.get(gem.name) ?? false }, soldAvg);
    return {
      ...gem,
      cells: cs,
      price,
      fastKeys,
      fast: fastKeys.size,
      allFast: fastKeys.size === 3,
      /** レベル 21 と完成品が速い (オーナーの言う「2 番目に大事」) */
      coreFast: fastKeys.has("level21") && fastKeys.has("finished"),
      /** 30 回回した時の期待収支 */
      ev: e ? e.ev * EV_ATTEMPTS : null,
      /** 1 回あたりの期待収支 */
      evPer1: e?.ev ?? null,
      evRoute: e?.route.label ?? "",
      evRoi: e?.roi ?? null,
      evUpfront: e?.route.upfront ?? null,
    };
  });
});

/**
 * 並べ替え (オーナー指示 2026-09-17)。
 *   既定「期待値」: 3 条件とも速い物を一番上 → レベル 21 と完成品が速い物 → 速い数 → 期待値の高い順
 *   条件名 (レベル 21 / 品質 23% / 完成品) を押した時: その条件が速い物を上に、その中で今の最安値が高い順
 * どちらも記録を読み直すたびに勝手に並び替わる (flowStore が変われば再計算される)。
 */
type SortMode = "ev" | (typeof SALE_KEYS)[number];
const sortBy = ref<SortMode>("ev");
const sortedGems = computed(() => {
  const mode = sortBy.value;
  const rows = scoredGems.value.slice();
  const num = (v: number | null): number => (v == null ? Number.NEGATIVE_INFINITY : v);
  if (mode === "ev") {
    rows.sort((a, b) => {
      if (a.allFast !== b.allFast) return a.allFast ? -1 : 1;
      if (a.coreFast !== b.coreFast) return a.coreFast ? -1 : 1;
      if (a.fast !== b.fast) return b.fast - a.fast;
      if (num(a.ev) !== num(b.ev)) return num(b.ev) - num(a.ev);
      return a.name.localeCompare(b.name);
    });
  } else {
    rows.sort((a, b) => {
      const af = a.fastKeys.has(mode);
      const bf = b.fastKeys.has(mode);
      if (af !== bf) return af ? -1 : 1;
      if (num(a.price[mode]) !== num(b.price[mode])) return num(b.price[mode]) - num(a.price[mode]);
      if (num(a.ev) !== num(b.ev)) return num(b.ev) - num(a.ev);
      return a.name.localeCompare(b.name);
    });
  }
  return rows;
});
const SORT_NOTE: Record<SortMode, string> = {
  ev: `3 条件とも「速い」ジェムを一番上、次にレベル 21 と完成品が速い物。その中では期待値 (${EV_ATTEMPTS} 回回した時の手残り) が高い順。`,
  level21: "レベル 21 が「速い」ジェムを上に、その中では レベル 21 の今の最安値が高い順。",
  quality23: "品質 23% が「速い」ジェムを上に、その中では 品質 23% の今の最安値が高い順。",
  finished: "完成品が「速い」ジェムを上に、その中では 完成品の今の最安値が高い順。",
};
function sortHead(mode: SortMode): string {
  return sortBy.value === mode ? "text-[var(--exile-color-accent-focus)]" : "hover:text-[var(--exile-color-text-secondary)]";
}

// ---- 監視中の状態 ----
function cells(en: string) {
  return SALE_KEYS.map((k) => {
    const st = flowStore.value?.states?.[watchKey(en, k)];
    const f = summarizeFlow(st);
    const watched = flowStore.value?.watches?.some((w) => w.key === watchKey(en, k));
    /**
     * 画面に出すのは**今の最安値** (オーナー指示 2026-09-18:
     * 「ここ平均じゃなくて現在の最安値ね表示は。並び順だけ上から 3 つの平均で期待値を出すだけで、
     *   売値の平均を表示は間違ってる」)。巡回のたびに更新される最安 1 件の値段。
     */
    const cheapest =
      st?.cheapest_amount != null && st.cheapest_currency
        ? averageExalted([{ amount: st.cheapest_amount, currency: st.cheapest_currency }])
        : null;
    /** 期待値の計算に使う実売の平均 (画面には出さない) */
    const avg = averageExalted(f.soldPrices);
    const parts = [f.gone > 0 ? fmtSellTime(f.medianMin) : "", cheapest != null ? displayCurrency.money(cheapest) : ""].filter(Boolean);
    return {
      key: k,
      /** 期待値に渡す実売の平均 (高貴建て) */
      avgExalted: avg,
      /** 並べ替えと表示に使う今の最安値 (高貴建て) */
      cheapest,
      label: SALE_KEY_LABEL[k],
      verdict: f.label || (f.gone + f.alive > 0 ? `判定待ち ${f.gone + f.alive} 件` : watched ? "巡回待ち" : "未登録"),
      // 判定の横: 売れるまでの時間と、今の最安値
      detail: parts.join(" · "),
      title: `${flowSentence(f)}${avg != null ? `。売れた値段の平均は ${displayCurrency.money(avg)} (期待値の計算に使う値)` : ""}`,
      tone: f.tone,
      gone: f.gone,
      alive: f.alive,
    };
  });
}
function toneClass(tone: string): string {
  switch (tone) {
    case "fast":
      return "text-emerald-300";
    case "normal":
      return "text-amber-200";
    case "slow":
      return "text-rose-300";
    default:
      return "text-[var(--exile-color-text-tertiary)]";
  }
}

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
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-1">自動ジェム監視</h2>
        <p class="text-[12px] text-[var(--exile-color-text-secondary)] mb-3">
          ここで選んだジェムを {{ cycleHours }} 時間ごとに 1 巡して、売れるまでの時間を測ります (1 ジェムにつきレベル 21 / 品質 23% / 完成品 の 3 条件。手動の一括取得もこの時計を進めます)。
          上位は下の「使用率ランキング」で取得した結果から決まります。
        </p>

        <!-- 設定 -->
        <div class="flex items-end gap-x-4 gap-y-2 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
          <label class="inline-flex flex-col gap-1">
            取得先
            <select class="num text-left w-56" :value="s.klass" @change="apply({ klass: ($event.target as HTMLSelectElement).value })">
              <option value="">全アセンダンシー (リーグ上位)</option>
              <option v-for="a in ASCENDANCIES.filter((x) => x)" :key="a" :value="a">{{ jaAscendancy(a) }}</option>
            </select>
          </label>
          <label class="inline-flex flex-col gap-1">
            上位の基準
            <select class="num text-left w-56" :value="s.metric" @change="apply({ metric: ($event.target as HTMLSelectElement).value as WatchMetric })">
              <option v-for="(label, key) in WATCH_METRIC_LABEL" :key="key" :value="key">{{ label }}</option>
            </select>
          </label>
          <label class="inline-flex flex-col gap-1">
            上位いくつ
            <input type="number" min="0" max="25" class="num w-20" :value="s.topN" @change="apply({ topN: Number(($event.target as HTMLInputElement).value) })" />
          </label>
          <label class="inline-flex flex-col gap-1">
            人数の下限
            <input type="number" min="1" max="100" class="num w-20" :value="s.minUsers" @change="apply({ minUsers: Number(($event.target as HTMLInputElement).value) })" />
          </label>
          <label class="inline-flex flex-col gap-1">
            監視の上限
            <input type="number" min="1" max="25" class="num w-20" :value="s.maxGems" @change="apply({ maxGems: Number(($event.target as HTMLInputElement).value) })" />
          </label>
          <label class="inline-flex flex-col gap-1">
            自動取得の間隔
            <select
              class="num text-left w-36"
              :value="cycleHours"
              title="前回の一括取得 (手動でも自動でも) から何時間後に、自動でもう 1 巡するか。短いほど売れた時刻が細かく分かりますが、リクエストは増えます (trade2 の上限は毎時 100 回)"
              @change="applyCycle(Number(($event.target as HTMLSelectElement).value))"
            >
              <option v-for="h in CYCLE_OPTIONS" :key="h" :value="h">{{ h }} 時間ごとに 1 巡</option>
            </select>
          </label>
          <label class="inline-flex items-center gap-2 pb-1">
            <input type="checkbox" :checked="s.autoTop" @change="apply({ autoTop: ($event.target as HTMLInputElement).checked })" />
            上位を自動で入れる
          </label>
          <!-- オーナー指示 2026-09-17: 自動巡回と同じ処理を手で 1 巡させるボタン -->
          <button
            type="button"
            :disabled="sweeping || !!status?.sampling"
            class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed"
            :title="`監視している全銘柄を今すぐ 1 巡します (自動巡回と同じ処理)。銘柄数 × 2 回ほど検索します。手で押す分に回数の制限はなく、押した時刻から次の自動取得までの ${cycleHours} 時間を数え直します`"
            @click="sweep()"
          >
            {{ sweeping || status?.sampling ? sweepText || "取得中…" : "⟳ 一括取得 (今すぐ 1 巡)" }}
          </button>
          <button
            type="button"
            class="underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]"
            title="記録を読み直します (この PC のファイルを読むだけなので通信はしません)"
            @click="reload"
          >
            🔄 記録を読み直す<span v-if="readAtText" class="text-[10px] text-[var(--exile-color-text-tertiary)]"> ({{ readAtText }})</span>
          </button>
          <button
            type="button"
            :disabled="busy || !diff.changed"
            class="px-3 py-1 rounded border font-display tracking-[0.06em] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed"
            :class="diff.changed ? 'border-[var(--exile-color-accent-focus)] text-[var(--exile-color-accent-focus)]' : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-tertiary)]'"
            :title="diff.changed ? `入れる ${diff.add.map(jaSkill).join(', ') || 'なし'} / 外す ${diff.drop.map(jaSkill).join(', ') || 'なし'}` : '設定と監視中の銘柄は一致しています'"
            @click="sync"
          >
            {{ busy ? "反映中…" : diff.changed ? `監視を開始 (+${diff.add.length} / -${diff.drop.length})` : "監視リストは最新です" }}
          </button>
        </div>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
          自動巡回は <span class="text-[var(--exile-color-text-secondary)]">1 巡およそ 15 分</span>で終わる速さに均して流します
          ({{ status?.pace_secs ?? 11 }} 秒おきに 1 回) のでレート制限に当たりません。
          手動の「一括取得」だけは上限の許す限り速く回すので、その間だけ待ちが出ます。
          監視 {{ gems.length }} ジェム = {{ gems.length * 3 }} 銘柄。1 銘柄あたり {{ cycleHours }} 時間に検索 1 回 + 値段 1 回なので、
          {{ gems.length * 3 }} 銘柄なら毎時およそ {{ Math.round((gems.length * 3 * 2) / cycleHours) }} 回のリクエストになります (trade2 の上限は毎時 100 回)。手動の一括取得はこれとは別に走ります。
          間隔を短くすると「消えた」のに気付くのが早くなる分、売れるまでの時間も細かく出ます。
          監視から外したジェムの記録は消えません。7 日間触られなかった分だけ掃除されるので、その間に戻せば<span class="text-[var(--exile-color-text-secondary)]">前の記録の続きから</span>追えます。
          記録を作り直すのは検索条件そのものが変わった時だけです (別の条件で貯めた記録は混ぜられないため)。
        </p>
        <p v-if="sweepClock" class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-1">{{ sweepClock }}</p>
        <p v-if="message" class="text-[12px] mt-2" :class="message.ok ? 'text-emerald-300' : 'text-amber-300'">{{ message.text }}</p>
      </div>
    </BaseCard>

    <!-- 手動で足す -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <h3 class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-[13px] mb-2">ジェムを足す</h3>
        <label class="block text-[11px] text-[var(--exile-color-text-secondary)] mb-1">ジェム (日本語 / 英語 / 正規表現)</label>
        <input v-model="query" type="text" placeholder="例: アーク / Cast on / ^ヘラルド" class="num text-left w-96 max-w-full" />
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

    <!-- 監視中の一覧 -->
    <BaseCard>
      <div class="p-4 pl-5">
        <h3 class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-[13px] mb-1">監視中 ({{ gems.length }} ジェム)</h3>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mb-2">
          {{ SORT_NOTE[sortBy] }}記録を読み直すたびに並び替わります (見出しを押すと並べ替えが変わります)。
        </p>
        <p v-if="gems.length === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)]">
          まだ 1 つもありません。上の検索で足すか、下の「使用率ランキング」で取得すると上位が自動で入ります。
        </p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <!-- 一番左が期待値。見出しを押すとその条件で並べ替える (オーナー指示 2026-09-17) -->
                <th class="text-left font-normal pb-1 whitespace-nowrap">
                  <button type="button" class="underline decoration-dotted" :class="sortHead('ev')" :title="`${EV_ATTEMPTS} 回回した時の手残り (期待値) の高い順に並べる。売値は実際に売れた値段の平均、素材はジェムコラプトの賭けと同じ (相場と取引所の繰り上げ単価の安い方)、前提の確率は既定値です`" @click="sortBy = 'ev'">
                    期待値{{ sortBy === "ev" ? " ▼" : "" }}
                  </button>
                </th>
                <th class="text-left font-normal pb-1 pl-3">ジェム</th>
                <th class="text-left font-normal pb-1 pl-3">入り方 / 速い数</th>
                <th class="text-left font-normal pb-1 pl-3">使用状況</th>
                <th v-for="k in SALE_KEYS" :key="k" class="text-left font-normal pb-1 pl-3">
                  <button type="button" class="underline decoration-dotted" :class="sortHead(k)" :title="`${SALE_KEY_LABEL[k]} が速い物を上に、その中で今の最安値が高い順に並べる`" @click="sortBy = k">
                    {{ SALE_KEY_LABEL[k] }}{{ sortBy === k ? " ▼" : "" }}
                  </button>
                </th>
                <th class="pb-1 pl-3"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="gem in sortedGems" :key="gem.name" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 whitespace-nowrap">
                  <span
                    v-if="gem.ev != null"
                    class="text-[12px]"
                    :class="gem.ev > 0 ? 'text-emerald-300' : gem.ev < 0 ? 'text-rose-300' : 'text-[var(--exile-color-text-tertiary)]'"
                    :title="`${EV_ATTEMPTS} 回回した時の期待収支 ${displayCurrency.money(gem.ev, { signed: true })} (1 回あたり ${displayCurrency.money(gem.evPer1, { signed: true })})
入り方: ${gem.evRoute}${gem.evRoi != null ? ` · 利回り ${(gem.evRoi * 100).toFixed(0)}%` : ''}${gem.evUpfront ? ` · 1 回の元手 ${displayCurrency.money(gem.evUpfront)} (${EV_ATTEMPTS} 回で ${displayCurrency.money(gem.evUpfront * EV_ATTEMPTS)})` : ''}
売値は実際に売れた値段の平均を使っています`"
                  >
                    {{ displayCurrency.money(gem.ev, { signed: true }) }}
                  </span>
                  <span v-else class="text-[11px] text-[var(--exile-color-text-tertiary)]" title="売れた記録か素材の相場がまだ足りません">—</span>
                </td>
                <td class="py-1.5 pl-3">
                  {{ jaSkill(gem.name) }}
                  <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ gem.name }}</span>
                </td>
                <td class="py-1.5 pl-3 text-[11px] text-[var(--exile-color-text-secondary)] whitespace-nowrap">
                  {{ gem.manual ? "手動" : "上位" }}
                  <span v-if="gem.fast > 0" class="ml-1 text-[10px]" :class="gem.fast === 3 ? 'text-emerald-300' : 'text-[var(--exile-color-text-tertiary)]'">速い {{ gem.fast }}/3</span>

                </td>
                <td class="py-1.5 pl-3 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ gem.note }}</td>
                <td v-for="c in gem.cells" :key="c.key" class="py-1.5 pl-3">
                  <button type="button" class="text-[11px] hover:underline text-left" :class="toneClass(c.tone)" :title="`${c.label}: ${c.title} (押すと記録の一覧)`" @click="openSold(gem.name, c.key)">
                    {{ c.verdict }}<span v-if="c.detail" class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)]">{{ c.detail }}</span>
                  </button>
                </td>
                <td class="py-1.5 pl-3 text-right whitespace-nowrap">
                  <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" title="ジェムコラプトの賭けでこのジェムを計算する" @click="openGemCorrupt(gem.name)">計算 ↗</button>
                  <!-- オーナー指示 2026-09-17: 固定は消して、代わりに売り履歴 (3 条件まとめて) を出す -->
                  <button
                    type="button"
                    class="ml-3 text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]"
                    title="このジェムの売れたリスト (値段・出品者・並んでいた時間) を 3 条件まとめて見る"
                    @click="openSold(gem.name, null)"
                  >
                    📋 売り履歴
                  </button>
                  <button
                    v-if="gem.manual"
                    type="button"
                    class="ml-3 text-[11px] underline text-[var(--exile-color-text-tertiary)] hover:text-rose-300"
                    title="監視から外す (記録は残るので、7 日以内に戻せば続きから追える)"
                    @click="remove(gem.name)"
                  >
                    外す
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </BaseCard>

    <!-- 設定外だが記録が残っているジェム -->
    <BaseCard v-if="orphans.length" class="mt-4">
      <div class="p-4 pl-5">
        <h3 class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-[13px] mb-1">巡回に入っていないジェム ({{ orphans.length }})</h3>
        <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mb-2">
          ジェムコラプトの賭けで「再取得」を押して記録は作られたが、監視には入れていないジェムです (記録は 7 日で掃除されます)。
          続けて測りたい物だけ監視に入れてください。
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

    <!-- 使用率ランキング (poe.ninja)。ここで取得した結果が上の「上位」の元になる -->
    <div class="mt-4">
      <GemUsageRanking />
    </div>

    <SoldListDialog :open="soldFor !== ''" :title="soldTitle" :keys="soldKeys" :store="flowStore" @close="soldFor = ''" />
  </section>
</template>

<style scoped>
.num {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--exile-color-bg-surface);
  border: 1px solid var(--exile-color-border-subtle);
  text-align: right;
}
.num:focus {
  outline: none;
  border-color: var(--exile-color-accent-focus);
}
</style>
