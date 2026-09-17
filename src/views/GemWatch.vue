<!--
  GemWatch.vue — 自動ジェム監視 (2026-09-17 オーナー指示)
  ---------------------------------------------------------------------------
  「何を捌き速度の追跡に入れるか」をここで決める。
    - 取得先 (アセンダンシー) / 並べる基準 / 上位何ジェム / 人数の下限 / 上限
    - 手で足したジェムの一覧 (検索で追加、一覧から削除)
    - 今監視している銘柄の状態 (3 条件の判定と記録件数)
  自動取得の動き (2 時間 1 巡・ID 直接照会で裏取り) は市場側 (market_flow.rs) のまま。
-->
<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref } from "vue";
import BaseCard from "../components/decor/BaseCard.vue";
import SoldListDialog from "../components/SoldListDialog.vue";
import { GEMS } from "./gem-corrupt/useGemCorrupt";
import { SALE_KEYS, SALE_KEY_LABEL, watchKey } from "./gem-corrupt/row-query";
import { jaSkill } from "../i18n/skills-ja";
import { jaAscendancy } from "../i18n/ascendancies-ja";
import { flowSentence, fmtSellTime, loadFlow, loadFlowStatus, summarizeFlow, sweepNow, type FlowStatus, type FlowStore } from "../services/market-flow";
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

/** 監視している全銘柄を今すぐ 1 巡する (自動巡回と同じ処理を手で走らせるだけ) */
const sweeping = ref(false);
async function sweep(): Promise<void> {
  if (sweeping.value || status.value?.sampling) return;
  sweeping.value = true;
  message.value = { ok: true, text: "一括取得を始めました (終わるまで数分かかります)" };
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

/** 取得中の進捗表示 */
const sweepText = computed(() => {
  const s = status.value;
  if (!s?.sampling) return "";
  return `取得中 ${s.done}/${s.total}${s.current ? ` · ${s.current}` : ""}`;
});
onMounted(reload);
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

// ---- 検索 (ジェムコラプトの賭けと同じ。正規表現も使える) ----
const query = ref("");
const regexError = ref("");
const matches = computed(() => {
  const q = query.value.trim();
  if (!q) return [];
  regexError.value = "";
  let test: (g: { ja: string; en: string }) => boolean;
  // 正規表現として読めるならそれで、駄目なら普通の部分一致で探す
  try {
    const re = new RegExp(q, "i");
    test = (g) => re.test(g.ja) || re.test(g.en);
  } catch (e) {
    regexError.value = e instanceof Error ? e.message : String(e);
    const lower = q.toLowerCase();
    test = (g) => g.ja.toLowerCase().includes(lower) || g.en.toLowerCase().includes(lower);
  }
  const lower = q.toLowerCase();
  const hit = GEMS.filter(test);
  hit.sort((a, b) => {
    const as = a.ja.toLowerCase().startsWith(lower) || a.en.toLowerCase().startsWith(lower) ? 0 : 1;
    const bs = b.ja.toLowerCase().startsWith(lower) || b.en.toLowerCase().startsWith(lower) ? 0 : 1;
    return as - bs || a.ja.localeCompare(b.ja, "ja");
  });
  return hit.slice(0, 12);
});


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
 * 一覧の並び (オーナー指示 2026-09-17):
 *   1. 3 条件 (レベル 21 / 品質 23% / 完成品) が**全部「速い」**の物を最優先
 *   2. その中では 3 条件の平均売値が高い順
 *   3. 以降は「速い」の数が多い順 → 平均売値が高い順
 * 記録を読み直すたびに勝手に並び替わる (flowStore が変わると再計算される)。
 */
const sortedGems = computed(() => {
  const scored = gems.value.map((gem) => {
    const cs = cells(gem.name);
    const fast = cs.filter((c) => c.tone === "fast").length;
    const prices = cs.map((c) => c.avgExalted).filter((v): v is number => v != null);
    const avg = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    return { gem, fast, allFast: fast === 3, avg };
  });
  return scored
    .sort((a, b) => {
      if (a.allFast !== b.allFast) return a.allFast ? -1 : 1;
      if (a.fast !== b.fast) return b.fast - a.fast;
      if ((a.avg ?? -1) !== (b.avg ?? -1)) return (b.avg ?? -1) - (a.avg ?? -1);
      return a.gem.name.localeCompare(b.gem.name);
    })
    .map((x) => ({ ...x.gem, fast: x.fast, avg: x.avg }));
});

// ---- 監視中の状態 ----
function cells(en: string) {
  return SALE_KEYS.map((k) => {
    const f = summarizeFlow(flowStore.value?.states?.[watchKey(en, k)]);
    const watched = flowStore.value?.watches?.some((w) => w.key === watchKey(en, k));
    const avg = averageExalted(f.soldPrices);
    return {
      key: k,
      /** 並べ替えに使う平均売値 (高貴建て) */
      avgExalted: avg,
      label: SALE_KEY_LABEL[k],
      verdict: f.label || (f.gone + f.alive > 0 ? `判定待ち ${f.gone + f.alive} 件` : watched ? "巡回待ち" : "未登録"),
      // 判定の横に出す実測 (売れるまでの時間と平均売値)
      detail: f.gone > 0 ? `${fmtSellTime(f.medianMin)}${avg != null ? ` · ${displayCurrency.money(avg)}` : ""}` : "",
      title: flowSentence(f),
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
          ここで選んだジェムを 2 時間ごとに巡回して、売れるまでの時間を測ります (1 ジェムにつきレベル 21 / 品質 23% / 完成品 の 3 条件)。
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
          <label class="inline-flex items-center gap-2 pb-1">
            <input type="checkbox" :checked="s.autoTop" @change="apply({ autoTop: ($event.target as HTMLInputElement).checked })" />
            上位を自動で入れる
          </label>
          <!-- オーナー指示 2026-09-17: 自動巡回と同じ処理を手で 1 巡させるボタン -->
          <button
            type="button"
            :disabled="sweeping || !!status?.sampling"
            class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed"
            title="監視している全銘柄を今すぐ 1 巡します (2 時間ごとの巡回と同じ処理)。銘柄数 × 2 回ほど検索します"
            @click="sweep"
          >
            {{ sweeping || status?.sampling ? (sweepText || "取得中…") : "⟳ 一括取得 (今すぐ 1 巡)" }}
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
          監視 {{ gems.length }} ジェム = {{ gems.length * 3 }} 銘柄。1 銘柄あたり 2 時間に検索 1 回 + 値段 1 回なので、
          {{ gems.length * 3 }} 銘柄なら毎時およそ {{ Math.round((gems.length * 3 * 2) / 2) + 24 }} 回のリクエストになります (trade2 の上限は毎時 100 回)。
          監視から外したジェムの記録は消えません。7 日間触られなかった分だけ掃除されるので、その間に戻せば<span class="text-[var(--exile-color-text-secondary)]">前の記録の続きから</span>追えます。
          記録を作り直すのは検索条件そのものが変わった時だけです (別の条件で貯めた記録は混ぜられないため)。
        </p>
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
          3 条件とも「速い」ジェムを上に、その中では 3 条件の平均売値が高い順。記録を読み直すたびに並び替わります。
        </p>
        <p v-if="gems.length === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)]">
          まだ 1 つもありません。上の検索で足すか、「クラフト選定ジェム」で取得すると上位が自動で入ります。
        </p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">ジェム</th>
                <th class="text-left font-normal pb-1 pl-3">入り方 / 速い数 / 平均売値</th>
                <th class="text-left font-normal pb-1 pl-3">使用状況</th>
                <th class="text-left font-normal pb-1 pl-3">レベル 21</th>
                <th class="text-left font-normal pb-1 pl-3">品質 23%</th>
                <th class="text-left font-normal pb-1 pl-3">完成品</th>
                <th class="pb-1 pl-3"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="gem in sortedGems" :key="gem.name" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5">
                  {{ jaSkill(gem.name) }}
                  <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ gem.name }}</span>
                </td>
                <td class="py-1.5 pl-3 text-[11px] text-[var(--exile-color-text-secondary)] whitespace-nowrap">
                  {{ gem.manual ? "手動" : "上位" }}
                  <span v-if="gem.fast > 0" class="ml-1 text-[10px]" :class="gem.fast === 3 ? 'text-emerald-300' : 'text-[var(--exile-color-text-tertiary)]'">速い {{ gem.fast }}/3</span>
                  <span v-if="gem.avg != null" class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)]">平均 {{ displayCurrency.money(gem.avg) }}</span>
                </td>
                <td class="py-1.5 pl-3 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ gem.note }}</td>
                <td v-for="c in cells(gem.name)" :key="c.key" class="py-1.5 pl-3">
                  <button type="button" class="text-[11px] hover:underline text-left" :class="toneClass(c.tone)" :title="`${c.label}: ${c.title} (押すと記録の一覧)`" @click="openSold(gem.name, c.key)">
                    {{ c.verdict }}<span v-if="c.detail" class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)]">{{ c.detail }}</span>
                  </button>
                </td>
                <td class="py-1.5 pl-3 text-right whitespace-nowrap">
                  <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="openGemCorrupt(gem.name)">計算 ↗</button>
                  <button
                    v-if="gem.manual"
                    type="button"
                    class="ml-3 text-[11px] underline text-[var(--exile-color-text-tertiary)] hover:text-rose-300"
                    title="監視から外す (記録は残るので、7 日以内に戻せば続きから追える)"
                    @click="remove(gem.name)"
                  >
                    外す
                  </button>
                  <button
                    v-else
                    type="button"
                    class="ml-3 text-[11px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]"
                    title="上位から外れても監視し続けるように、手動の一覧へ移す"
                    @click="add(gem.name)"
                  >
                    固定
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
          以前の版で「再取得」を押して記録が作られたジェムです。今は巡回に入っていません (記録は 7 日で掃除されます)。
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
