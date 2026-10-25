<!--
  GemCorruptWebPanel.vue — Web 版のジェムコラプト (2026-10-16 ロードマップの土台「ジェムコラプト計算機の Web 版」)

  メモ web-version-plan: 「コラプトは 3 つ手入力で収支だけ」「取引所は自動で取らない」。
    入力 = 売値 3 つ (レベル 21 / 品質 23% / 完成品)。素材はカレンシーの相場 (/boot.json)。
    取引所は「検索を開く」だけ (openTradeQuery、API は叩かない)。売れ行き (捌き速度) は Web では見えないので出さない。
  計算はアプリと同じ関数 (model.ts の evaluateRoutes / bestRoute / roi、素材は materials.ts を取引所なしで。web-materials.ts)。
  前提の確率もアプリと同じ既定 (DEFAULT_PARAMS)。確率はゲームに無いので「仮」と出す。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { isEn, tr, nameOf } from "../../i18n/lang";
import { jaCurrency } from "../../i18n/currencies-ja";
import Disclosure from "../../components/ui/Disclosure.vue";
import MoneyInput from "../../components/vaal-scales/MoneyInput.vue";
import CurrencyPicker from "../../components/vaal-scales/CurrencyPicker.vue";
import { displayCurrency } from "../../state/display-currency";
import { marketStore } from "../../state/market-store";
import { isSpiritGem } from "../../state/gem-spirit";
import { openTradeQuery } from "../../services/pob-check/trade-links";
import { logRecord } from "../../utils/log-record";
import { bestRoute, DEFAULT_PARAMS, evaluateRoutes, roi, vaalProbabilities, type CorruptParams, type RouteResult, type SalePrices } from "./model";
import { FINISHER_JA, FINISHER_TEXT, finisherIsFlux } from "./materials";
import { webBaseGemSource, webMaterialPrices } from "./web-materials";
import { searchGems } from "./search";
import { GEMS, type GemInfo, type SaleKey } from "./gem-list";
import { originalGemQuery, rowQuery } from "./row-query";
import { evClass, money, pct } from "./ui";
import { flag } from "../../web/release-flags";
import { cameBack } from "../../web/page-memo";

// ---- 覚える物 (この端末だけ。localStorage) ----
const KEY = "exiledesk.web.gemCorrupt";
interface Saved { at?: number; gem?: string | null; spirit?: boolean; sale?: SalePrices; baseManual?: number | null; params?: CorruptParams }
function load(): Saved {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Saved; } catch { return {}; }
}
// スイッチ emuFresh (10-25 オーナー「開き直したら全部最初の画面から」「戻るは前の画面」): リロード・開き直しは空から。読むのは同じ読み込みの中で書いた物
// (タブを閉じて開き直した時は続き。at = 書いた読み込みの performance.timeOrigin) と、戻って来た読み込み (page-memo.ts の cameBack) の時だけ
const loaded = load();
const saved: Saved = !flag("emuFresh") || loaded.at === performance.timeOrigin || cameBack() ? loaded : {};

void marketStore.ensureMarket();

// ---- ジェム (選ばなくても計算はできる。選ぶと原石の種類と取引所の検索が決まる) ----
const selected = ref<GemInfo | null>(GEMS.find((g) => g.en === saved.gem) ?? null);
const query = ref(selected.value ? nameOf(selected.value) : "");
const listOpen = ref(false);
const hits = computed(() => (listOpen.value ? searchGems(query.value, 10).hits : []));
function pick(g: GemInfo): void {
  selected.value = g;
  query.value = nameOf(g);
  listOpen.value = false;
}
function clearGem(): void {
  selected.value = null;
  query.value = "";
}
/** ジェムを選んでいない時のスキル / スピリット (原石の種類) */
const spiritPick = ref(!!saved.spirit);
const spirit = computed(() => (selected.value ? isSpiritGem(selected.value.en, selected.value.spirit) : spiritPick.value));
const meta = computed(() => selected.value?.kind === "meta");

// ---- 売値 3 つ (手入力、高貴建て) ----
const sale = ref<SalePrices>({ level21: null, quality23: null, finished: null, ...(saved.sale ?? {}) });
const SALE_ROWS: Array<{ key: SaleKey; ja: string; en: string; condJa: string; condEn: string }> = [
  { key: "level21", ja: "レベル 21 (品質 20%)", en: "Level 21 (20% quality)", condJa: "コラプト済 · 5 ソケット · 2 重コラプトなし", condEn: "Corrupted · 5 sockets · not twice corrupted" },
  { key: "quality23", ja: "品質 23%", en: "23% quality", condJa: "コラプト済 · 5 ソケット · 2 重コラプトなし (レベル不問)", condEn: "Corrupted · 5 sockets · not twice corrupted (any level)" },
  { key: "finished", ja: "完成品 (21 · 23%)", en: "Finished (21 / 23%)", condJa: "レベル 21 · 品質 23% · 5 ソケット · 2 重コラプト済", condEn: "Level 21 · 23% quality · 5 sockets · twice corrupted" },
];
function openSearch(key: SaleKey): void {
  if (selected.value) void openTradeQuery(rowQuery(selected.value.en, key, meta.value));
}

// ---- 素材 (カレンシーの相場。取引所は取らない) ----
const baseManual = ref<number | null>(saved.baseManual ?? null);
const base = computed(() => {
  void marketStore.items.value;
  return webBaseGemSource(spirit.value, selected.value?.en);
});
const materials = computed(() => {
  void marketStore.items.value;
  return webMaterialPrices(spirit.value, base.value, baseManual.value);
});
const uncutName = (lv: number | null): string => {
  const en = spirit.value ? "Uncut Spirit Gem" : "Uncut Skill Gem";
  const name = nameOf({ en, ja: jaCurrency(en) });
  return lv == null ? name : tr(`${name} (レベル ${lv})`, `${name} (Level ${lv})`);
};
const cur = (en: string): string => nameOf({ en, ja: jaCurrency(en) });
const materialRows = computed(() => {
  void marketStore.items.value;
  const m = materials.value;
  const flux = finisherIsFlux(base.value.mode);
  return [
    { key: "baseGem", name: base.value.mode === "buy" ? tr("元のジェム (コラプト無し・原石から作れない)", "Original gem (uncorrupted, can't be made from uncut gems)") : uncutName(base.value.level), n: 1, price: m.baseGem },
    { key: "gcp", name: cur("Gemcutter's Prism"), n: 4, price: m.gcp },
    { key: "perfectJeweller", name: cur("Perfect Jeweller's Orb"), n: 1, price: m.perfectJeweller },
    { key: "vaal", name: cur("Vaal Orb"), n: 1, price: m.vaal },
    { key: "crystal", name: cur("Crystallised Corruption"), n: null, price: m.crystal },
    { key: "uncut20", name: flux ? nameOf({ en: FINISHER_TEXT, ja: FINISHER_JA }) : uncutName(20), n: null, price: m.uncut20 },
  ];
});
const materialsOpen = ref(false);
function openBaseSearch(): void {
  if (selected.value) void openTradeQuery(originalGemQuery(selected.value.en, meta.value));
}

// ---- 前提 (確率はゲームに無い。既定はアプリと同じ、ここで変えられる) ----
const params = ref<CorruptParams>({ ...DEFAULT_PARAMS, ...(saved.params ?? {}) });
const paramsOpen = ref(false);
const vaalP = computed(() => vaalProbabilities(params.value));
const paramsChanged = computed(() => (Object.keys(DEFAULT_PARAMS) as (keyof CorruptParams)[]).some((k) => params.value[k] !== DEFAULT_PARAMS[k]));
const PARAM_ROWS: Array<{ k: keyof CorruptParams; ja: string; en: string; step: number; max?: number }> = [
  { k: "vaalNone", ja: "ヴァール: 変化なし (重み)", en: "Vaal: no change (weight)", step: 0.05 },
  { k: "vaalLevel", ja: "ヴァール: レベル ±1 (重み)", en: "Vaal: level ±1 (weight)", step: 0.05 },
  { k: "vaalQuality", ja: "ヴァール: 品質 −3〜+3 (重み)", en: "Vaal: quality −3 to +3 (weight)", step: 0.05 },
  { k: "vaalSockets", ja: "ヴァール: ソケット ±1 (重み)", en: "Vaal: sockets ±1 (weight)", step: 0.05 },
  { k: "qualitySteps", ja: "品質の刻みの数", en: "Quality steps", step: 1 },
  { k: "crystalDestroy", ja: "結晶で壊れる確率", en: "Crystallised Corruption destroy chance", step: 0.05, max: 1 },
  { k: "leftoverFraction", ja: "外れの生存品の値段 (元の値段の割合)", en: "Leftover value (share of original price)", step: 0.05, max: 1 },
];

// ---- 収支 ----
const routes = computed<RouteResult[]>(() => evaluateRoutes(materials.value, sale.value, params.value));
const best = computed(() => bestRoute(routes.value));
const sorted = computed(() => [...routes.value].sort((a, b) => (roi(b) ?? -Infinity) - (roi(a) ?? -Infinity)));
const hundredEx = computed(() => displayCurrency.fromDisplay(100) ?? 100);
const per100 = (r: RouteResult): number | null => { const v = roi(r); return v == null ? null : v * hundredEx.value; };
const anySale = computed(() => sale.value.level21 != null || sale.value.quality23 != null || sale.value.finished != null);
const expanded = ref<Record<string, boolean>>({});

// ---- 保存と分析用の記録 ----
watch([selected, spiritPick, sale, baseManual, params], () => {
  try { localStorage.setItem(KEY, JSON.stringify({ at: performance.timeOrigin, gem: selected.value?.en ?? null, spirit: spiritPick.value, sale: sale.value, baseManual: baseManual.value, params: params.value } satisfies Saved)); } catch { /* 覚えられなくてよい */ }
}, { deep: true });
/** 入力が落ち着いてから 1 件 (3 つ揃った時だけ。同じ中身は送らない) */
let logTimer: ReturnType<typeof setTimeout> | null = null;
let lastLog = "";
watch([routes, best], () => {
  if (logTimer) clearTimeout(logTimer);
  const s = sale.value;
  if (s.level21 == null || s.quality23 == null || s.finished == null) return;
  logTimer = setTimeout(() => {
    const data = {
      gem: selected.value?.en ?? null, spirit: spirit.value, sale: s, materials: materials.value,
      params: paramsChanged.value ? params.value : null,
      best: best.value?.id ?? null, roi: best.value ? roi(best.value) : null,
      routes: routes.value.map((r) => ({ id: r.id, ok: r.ok, ev: r.ok ? r.ev : null, cost: r.ok ? r.expectedCost : null })),
    };
    const key = JSON.stringify(data);
    if (key === lastLog) return;
    lastLog = key;
    logRecord("gem_corrupt", data);
  }, 3000);
}, { deep: true });
onBeforeUnmount(() => { if (logTimer) clearTimeout(logTimer); });

const fieldClass = "w-full min-w-0 rounded-md border border-white/15 bg-black/40 px-2 py-1 outline-none focus:border-amber-400/60 max-md:min-h-10";
const ASSUMED = () => tr("仮", "assumed");
</script>

<template>
  <section class="g-panel px-4 py-3 text-[13px]" data-rec-part="gem-corrupt">
    <!-- 1. ジェム -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <div class="relative w-80 min-w-0 max-md:w-full">
        <input v-model="query" :class="fieldClass" :placeholder="tr('ジェムの名前 (選ばなくても計算できます)', 'Gem name (optional)')" :aria-label="tr('ジェム', 'Gem')" @focus="listOpen = true" @input="listOpen = true; selected = null" @keydown.esc="listOpen = false" @blur="listOpen = false" />
        <ul v-if="hits.length" class="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-white/15 bg-[#14110d] py-1 shadow-2xl">
          <li v-for="g in hits" :key="g.en">
            <button type="button" class="g-plain flex w-full min-w-0 items-center gap-2 px-2 py-1 text-left hover:bg-white/10 max-md:min-h-10" @mousedown.prevent="pick(g)">
              <span class="min-w-0 flex-1 truncate">{{ nameOf(g) }}</span>
              <span v-if="g.spirit" class="shrink-0 text-[11px] opacity-60">{{ tr("スピリット", "Spirit") }}</span>
            </button>
          </li>
        </ul>
      </div>
      <button v-if="selected" type="button" class="g-btn sm max-md:min-h-10" @click="clearGem">{{ tr("選び直す", "Clear") }}</button>
      <span v-else class="inline-flex gap-1" role="radiogroup" :aria-label="tr('原石の種類', 'Uncut gem type')">
        <button type="button" role="radio" :aria-checked="!spiritPick" class="g-tab !min-h-[30px] !px-3 max-md:!min-h-10" :class="!spiritPick ? 'on' : ''" @click="spiritPick = false">{{ tr("スキルジェム", "Skill gem") }}</button>
        <button type="button" role="radio" :aria-checked="spiritPick" class="g-tab !min-h-[30px] !px-3 max-md:!min-h-10" :class="spiritPick ? 'on' : ''" @click="spiritPick = true">{{ tr("スピリットジェム", "Spirit gem") }}</button>
      </span>
      <span class="ml-auto max-md:ml-0"><CurrencyPicker /></span>
    </div>

    <!-- 2. 売値 3 つ (手入力) -->
    <div class="g-section">
      <h2 class="g-sec-title mb-2">{{ tr("売値", "Sell prices") }}</h2>
      <div class="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        <div v-for="row in SALE_ROWS" :key="row.key" class="flex min-w-0 flex-col gap-1">
          <span class="font-bold text-amber-100" :title="tr(row.condJa, row.condEn)">{{ tr(row.ja, row.en) }}</span>
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <MoneyInput v-model="sale[row.key]" width="w-28" />
            <button v-if="selected" type="button" class="g-btn sm max-md:min-h-10" :title="tr(`取引所でこの条件を検索 (${row.condJa})`, `Search the trade site (${row.condEn})`)" @click="openSearch(row.key)">{{ tr("取引所で検索", "Trade search") }} ↗</button>
          </div>
        </div>
      </div>
      <p v-if="!selected" class="mt-1 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("ジェムを選ぶと取引所の検索を開けます", "Pick a gem to open trade searches") }}</p>
    </div>

    <!-- 3. 収支 -->
    <div class="g-section">
      <h2 class="g-sec-title mb-2">{{ tr("収支", "Profit") }}</h2>
      <p v-if="!anySale" class="py-4 text-center opacity-60">{{ tr("売値を入れると経路ごとの収支が出ます", "Enter sell prices to see the profit of each route") }}</p>
      <template v-else>
        <p v-if="best" class="mb-2 text-[14px] leading-relaxed">
          <template v-if="best.id === 'buyFinished'">{{ tr("今の値段では、どの経路も完成品を買うより損です。", "At these prices, every route loses compared to buying the finished gem.") }}</template>
          <template v-else-if="isEn">
            Best: <span class="font-display text-[var(--exile-color-accent-focus)]">{{ best.label }}</span>, average
            <span class="font-display text-[16px] tabular-nums" :class="evClass(per100(best))">{{ money(per100(best), true) }}</span> per 100 {{ displayCurrency.label.value }}
          </template>
          <template v-else>
            <span class="font-display text-[var(--exile-color-accent-focus)]">{{ best.label }}</span> が一番得: 100 {{ displayCurrency.label.value }} 入れると平均
            <span class="font-display text-[16px] tabular-nums" :class="evClass(per100(best))">{{ money(per100(best), true) }}</span>
          </template>
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="pb-1 text-left font-normal">{{ tr("経路", "Route") }}</th>
                <th class="whitespace-nowrap pb-1 pl-3 text-right font-normal max-md:hidden">{{ tr("1 回の費用", "Cost per try") }}</th>
                <th class="whitespace-nowrap pb-1 pl-3 text-right font-normal max-md:hidden">{{ tr("1 回の収支", "Profit per try") }}</th>
                <th class="whitespace-nowrap pb-1 pl-3 text-right font-normal">{{ tr(`100 ${displayCurrency.label.value} あたり`, `Per 100 ${displayCurrency.label.value}`) }}</th>
                <th class="whitespace-nowrap pb-1 pl-3 text-right font-normal max-md:hidden">{{ tr("完成品の確率", "Finished chance") }}</th>
                <th class="pb-1 pl-3"></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="r in sorted" :key="r.id">
                <tr class="odd:bg-white/[0.025]" :class="best?.id === r.id ? 'text-[var(--exile-color-accent-focus)]' : ''">
                  <td class="py-1.5 pr-2 text-left">
                    <span>{{ r.label }}</span>
                    <div v-if="r.id === 'craft' && r.ok" class="text-[10px] text-[var(--exile-color-text-tertiary)]">
                      {{ tr("レベル +1 のあと", "After level +1") }}: {{ r.gambleAfterLevel ? tr("結晶で賭ける", "gamble with Crystallised Corruption") : tr("そのまま売る", "sell as is") }} /
                      {{ tr("品質 23% のあと", "After 23% quality") }}: {{ r.gambleAfterQuality ? tr("結晶で賭ける", "gamble with Crystallised Corruption") : tr("そのまま売る", "sell as is") }}
                    </div>
                  </td>
                  <template v-if="r.ok">
                    <td class="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums max-md:hidden">{{ money(r.expectedCost) }}</td>
                    <td class="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums max-md:hidden" :class="evClass(r.id === 'buyFinished' ? null : r.ev)">{{ r.id === "buyFinished" ? "0" : money(r.ev, true) }}</td>
                    <td class="whitespace-nowrap py-1.5 pl-3 text-right text-[14px] tabular-nums" :class="evClass(r.id === 'buyFinished' ? null : per100(r))">{{ r.id === "buyFinished" ? tr("0 (基準)", "0 (baseline)") : money(per100(r), true) }}</td>
                    <td class="py-1.5 pl-3 text-right tabular-nums max-md:hidden">{{ pct(r.pFinished) }}</td>
                    <td class="whitespace-nowrap py-1.5 pl-3 text-right"><Disclosure v-model:open="expanded[r.id]" kind="detail" class="text-[11px]" /></td>
                  </template>
                  <td v-else colspan="5" class="py-1.5 pl-3 text-left text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("不足", "Missing") }}: {{ r.missing.join(tr("、", ", ")) }}</td>
                </tr>
                <tr v-if="r.ok && expanded[r.id]">
                  <td colspan="6" class="pb-2 pl-3">
                    <div class="mb-1 flex flex-wrap gap-x-5 gap-y-0.5 text-[11px] text-[var(--exile-color-text-secondary)]">
                      <span>{{ tr("確定費用", "Fixed cost") }} <span class="tabular-nums">{{ money(r.upfront) }}</span></span>
                      <span class="md:hidden">{{ tr("1 回の費用", "Cost per try") }} <span class="tabular-nums">{{ money(r.expectedCost) }}</span></span>
                      <span class="md:hidden">{{ tr("1 回の収支", "Profit per try") }} <span class="tabular-nums" :class="evClass(r.id === 'buyFinished' ? null : r.ev)">{{ r.id === "buyFinished" ? "0" : money(r.ev, true) }}</span></span>
                      <span class="md:hidden">{{ tr("完成品の確率", "Finished chance") }} <span class="tabular-nums">{{ pct(r.pFinished) }}</span></span>
                      <span v-if="r.costPerFinished != null && r.costPerFinished > 0">{{ tr("完成品 1 個の実質コスト", "Effective cost per finished gem") }} <span class="tabular-nums">{{ money(r.costPerFinished) }}</span></span>
                    </div>
                    <table class="w-full text-[11px]">
                      <tbody>
                        <tr v-for="(o, i) in r.outcomes" :key="i" class="odd:bg-white/[0.025]">
                          <td class="py-0.5 pr-1 text-left">{{ o.label }}</td>
                          <td class="w-14 py-0.5 text-right tabular-nums">{{ pct(o.p) }}</td>
                          <td class="w-24 py-0.5 text-right tabular-nums">{{ money(o.net) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- 4. 素材 (相場、既定で閉じる) -->
    <div class="g-section">
      <div class="flex items-center gap-2">
        <h2 class="g-sec-title">{{ tr("素材", "Materials") }}</h2>
        <span class="g-sec-sub min-w-0 truncate max-md:hidden">{{ tr("カレンシーの相場", "Currency market prices") }}</span>
        <Disclosure v-model:open="materialsOpen" kind="section" class="ml-auto text-[11px]" />
      </div>
      <table v-if="materialsOpen" class="mt-2 w-full text-[12px]">
        <tbody>
          <tr v-for="m in materialRows" :key="m.key" class="odd:bg-white/[0.025]">
            <td class="py-1 pr-2 text-left">{{ m.name }}<span v-if="m.n" class="ml-1 opacity-60">× {{ m.n }}</span></td>
            <td class="whitespace-nowrap py-1 pl-3 text-right tabular-nums">
              <template v-if="m.key === 'baseGem' && base.mode === 'buy'">
                <span class="inline-flex flex-wrap items-center justify-end gap-2">
                  <MoneyInput v-model="baseManual" width="w-24" />
                  <button v-if="selected" type="button" class="g-btn sm max-md:min-h-10" @click="openBaseSearch">{{ tr("取引所で検索", "Trade search") }} ↗</button>
                </span>
              </template>
              <template v-else>{{ m.price == null ? tr("相場なし", "No price") : money(m.price) }}</template>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="materialsOpen" class="mt-1 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("結晶と仕上げの原石は結果次第で使う数が変わる (期待値で計算)", "Crystallised Corruption and the levelling gem are used only on some results (counted by expected value)") }}</p>
    </div>

    <!-- 5. 前提 (確率は仮、既定で閉じる) -->
    <div class="g-section">
      <div class="flex items-center gap-2">
        <h2 class="g-sec-title">{{ tr("前提", "Assumptions") }}</h2>
        <span class="shrink-0 rounded-sm bg-amber-500/20 px-1.5 text-[11px] text-amber-200" :title="tr('確率はゲームに無いので推定。変えられます', 'The game does not publish these chances. Estimates; you can change them')">{{ ASSUMED() }}</span>
        <span class="g-sec-sub min-w-0 truncate max-md:hidden">{{ tr("レベル +1", "Level +1") }} {{ pct(vaalP.levelUp) }} / {{ tr("品質 23%", "23% quality") }} {{ pct(vaalP.qualityTop) }}</span>
        <Disclosure v-model:open="paramsOpen" kind="section" class="ml-auto text-[11px]" />
      </div>
      <div v-if="paramsOpen" class="mt-2">
        <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 max-md:grid-cols-1">
          <label v-for="p in PARAM_ROWS" :key="p.k" class="flex min-w-0 items-center gap-2">
            <span class="min-w-0 flex-1 text-left text-[12px]">{{ tr(p.ja, p.en) }}</span>
            <input v-model.number="params[p.k]" type="number" min="0" :max="p.max" :step="p.step" class="num w-24 shrink-0 max-md:min-h-10" />
          </label>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--exile-color-text-tertiary)]">
          <span>{{ tr("ヴァール", "Vaal") }} → {{ tr("レベル +1", "Level +1") }} {{ pct(vaalP.levelUp) }} / {{ tr("品質 23%", "23% quality") }} {{ pct(vaalP.qualityTop) }} / {{ tr("外れ", "Miss") }} {{ pct(vaalP.junk) }}</span>
          <button v-if="paramsChanged" type="button" class="g-btn sm max-md:min-h-10" @click="params = { ...DEFAULT_PARAMS }">{{ tr("既定値に戻す", "Reset to defaults") }}</button>
        </div>
        <p class="mt-1 text-[11px] leading-relaxed text-[var(--exile-color-text-tertiary)]">{{ tr("既定はアプリと同じ: ヴァールは 4 系統が同じ確率・品質は 7 段が同じ確率、結晶は 50% で壊れ、残れば振っていない系統だけを振り直す。レベルは最後に原石で上げる前提 (壊れた物にレベル代を払わない)。", "Defaults match the desktop app: Vaal picks 4 outcomes equally, quality 7 steps equally; Crystallised Corruption destroys 50% and otherwise rerolls only the untouched outcome. Levels are raised last with an uncut gem (no level cost on destroyed gems).") }}</p>
      </div>
    </div>
    <div class="g-list-end" />
  </section>
</template>
