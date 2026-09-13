<!--
  GemCorrupt.vue — ジェムコラプトの賭け (2026-09-12、「ヴァールの天秤」の 1 つ)
  ジェムを選ぶ → 売値 3 つ (レベル 21 / 品質 23% / 完成品) を trade2 で取る or 手入力 →
  自作 / 21 を買って賭け / 23% を買って賭け / 完成品を買う の 4 経路を「1 回あたりの期待収支」で比べる (完成品 1 個の実質コストも併記)。
    views/gem-corrupt/model.ts         期待値モデル (純粋関数)
    views/gem-corrupt/useGemCorrupt.ts 状態 / 相場 / trade2
    i18n/gems-client.json              ジェム一覧 (GGG クライアント由来)
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { openExternal } from "../services/trade2/open-external";
import { refetchState } from "../services/trade2/auto-price";
import BaseCard from "../components/decor/BaseCard.vue";
import { SALE_ROWS, useGemCorrupt } from "./gem-corrupt/useGemCorrupt";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import MoneyInput from "../components/vaal-scales/MoneyInput.vue";
import { displayCurrency } from "../state/display-currency";
const money = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed });
const unit = displayCurrency.label;
import type { RouteId, RouteResult } from "./gem-corrupt/model";

const g = useGemCorrupt();
onMounted(() => {
  void g.loadMarket();
});

const showAssumptions = ref(false);
const expanded = ref<Record<string, boolean>>({});
const listOpen = ref(false);

function pct(p: number): string {
  return `${(p * 100).toFixed(p * 100 >= 10 ? 0 : 1)}%`;
}
function evClass(v: number | null): string {
  if (v == null) return "text-[var(--exile-color-text-tertiary)]";
  return v > 0 ? "text-emerald-300" : v < 0 ? "text-red-300" : "";
}
/** 再取得ボタン (検索中 / レート制限 / 間隔待ち のカウントダウン) */
const refetch = computed(() => refetchState(g.pricing.value, "再取得", "trade2 で検索中… (3 件、約 30 秒)"));
async function open(url: string | null): Promise<void> {
  await openExternal(url);
}
function isBest(r: RouteResult): boolean {
  return !!g.best.value && g.best.value.id === r.id;
}
function onQueryInput(): void {
  listOpen.value = true;
  hi.value = 0;
  if (g.selected.value && g.query.value !== g.selected.value.ja) g.selected.value = null;
}

/** 候補リストのキーボード操作 (オーナー要望 2026-09-13): ↑↓ で選び、Enter で確定、Esc で閉じる */
const hi = ref(0);
const listEl = ref<HTMLUListElement | null>(null);
function scrollHiIntoView(): void {
  void nextTick(() => {
    const li = listEl.value?.children[hi.value] as HTMLElement | undefined;
    li?.scrollIntoView({ block: "nearest" });
  });
}
function onQueryKeydown(e: KeyboardEvent): void {
  const n = g.matches.value.length;
  const visible = listOpen.value && !g.selected.value && n > 0;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!visible) {
      listOpen.value = true;
      return;
    }
    const d = e.key === "ArrowDown" ? 1 : -1;
    hi.value = (hi.value + d + n) % n;
    scrollHiIntoView();
  } else if (e.key === "Enter") {
    if (!visible) return;
    e.preventDefault();
    const m = g.matches.value[Math.min(hi.value, n - 1)];
    if (m) g.select(m);
  } else if (e.key === "Escape") {
    listOpen.value = false;
  }
}

/** 素材の説明 (GGG クライアント CurrencyItems.Description の日本語、2026-09-12 書き出し) */
const MATERIAL_DESC: Record<string, string> = {
  gcp: "スキルジェムの品質を向上させる。",
  perfectJeweller: "スキルジェムに5個のサポートジェムソケットをセットする。",
  vaal: "アイテムをコラプトし、予測不能な変化を与える。",
  crystal: "コラプト状態のスキルジェムを予測不可能に変化させるか、または破壊する。",
  uncut20: "ジェムを生成するか既存のジェムのレベルをレベル20に上げる",
};
/**
 * 収支 (実績入力、オーナー指示 2026-09-13)。単価は上の相場、買ったジェムと売れた物は相場か実際の額。ジェムごとに別帳簿 (localStorage、この PC だけ)。
 * 2026-09-14 オーナー指摘: 使うのは基本「最も得」の経路なのに、帳簿が空で「買ったジェム」の行も無かった。
 * → 経路 (既定は最も得) と回数を入れると、その経路で使う物が「1 回の数 × 回数」で埋まる (空欄 = 自動、違う数だけ上書き)。
 */
const LEDGER_KEY = "exiledesk.gem.ledger";
type BuyKey = "buyLevel21" | "buyQuality23" | "buyFinished";
type RowKey = "baseGem" | "gcp" | "perfectJeweller" | "vaal" | "crystal" | "uncut20" | BuyKey;
type SoldKey = "soldLevel21" | "soldQuality23" | "soldFinished" | "soldOther";
type EachKey = "eachLevel21" | "eachQuality23" | "eachFinished" | "eachOther";
interface GemLedger {
  /** null = 最も得の経路に合わせる */
  route: RouteId | null;
  /** やった回数 */
  attempts: number;
  /** 手で上書きした使った数 (無い行は 1 回の数 × 回数) */
  qty: Partial<Record<RowKey, number>>;
  /** 買ったジェムの実際の 1 個の値段 (高貴)。無ければ相場 */
  buyEach: Partial<Record<BuyKey, number>>;
  /** 売れた数 */
  soldLevel21: number;
  soldQuality23: number;
  soldFinished: number;
  soldOther: number;
  /** 実売の 1 個あたり (高貴)。null なら相場 */
  eachLevel21: number | null;
  eachQuality23: number | null;
  eachFinished: number | null;
  eachOther: number | null;
}
const EMPTY_LEDGER: GemLedger = {
  route: null, attempts: 0, qty: {}, buyEach: {},
  soldLevel21: 0, soldQuality23: 0, soldFinished: 0, soldOther: 0,
  eachLevel21: null, eachQuality23: null, eachFinished: null, eachOther: null,
};
/** 旧形式 (素材ごとの使った数を全部手で入れていた) のキー。0 より大きい物は上書きとして引き継ぐ */
const OLD_QTY_KEYS = ["baseGem", "gcp", "perfectJeweller", "vaal", "crystal", "uncut20"] as const;
type StoredGemLedger = Partial<GemLedger> & Partial<Record<(typeof OLD_QTY_KEYS)[number], number>>;
type LedgerBook = Record<string, StoredGemLedger>;
function loadBook(): LedgerBook {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    return raw ? (JSON.parse(raw) as LedgerBook) : {};
  } catch {
    return {};
  }
}
const book = ref<LedgerBook>(loadBook());
const ledgerGem = computed(() => g.selected.value?.en ?? "");
const ledger = computed<GemLedger>(() => {
  const raw = book.value[ledgerGem.value] ?? {};
  const qty: Partial<Record<RowKey, number>> = { ...(raw.qty ?? {}) };
  if (!raw.qty) {
    for (const k of OLD_QTY_KEYS) {
      const v = raw[k];
      if (typeof v === "number" && v > 0) qty[k] = v;
    }
  }
  return {
    ...EMPTY_LEDGER,
    route: raw.route ?? null,
    attempts: raw.attempts ?? 0,
    qty,
    buyEach: { ...(raw.buyEach ?? {}) },
    soldLevel21: raw.soldLevel21 ?? 0,
    soldQuality23: raw.soldQuality23 ?? 0,
    soldFinished: raw.soldFinished ?? 0,
    soldOther: raw.soldOther ?? 0,
    eachLevel21: raw.eachLevel21 ?? null,
    eachQuality23: raw.eachQuality23 ?? null,
    eachFinished: raw.eachFinished ?? null,
    eachOther: raw.eachOther ?? null,
  };
});
function setLedger<K extends keyof GemLedger>(key: K, v: GemLedger[K]): void {
  if (!ledgerGem.value) return;
  book.value = { ...book.value, [ledgerGem.value]: { ...ledger.value, [key]: v } };
}
/** 数の入力。空欄は null (= 自動) */
function readCount(ev: Event): number | null {
  const raw = (ev.target as HTMLInputElement).value.trim();
  if (raw === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : null;
}
function setAttempts(ev: Event): void {
  setLedger("attempts", Math.floor(readCount(ev) ?? 0));
}
function setRoute(ev: Event): void {
  const v = (ev.target as HTMLSelectElement).value;
  setLedger("route", v === "" ? null : (v as RouteId));
}
function setQty(key: RowKey, ev: Event): void {
  const v = readCount(ev);
  const qty = { ...ledger.value.qty };
  if (v == null) delete qty[key];
  else qty[key] = v;
  setLedger("qty", qty);
}
function setBuyEach(key: BuyKey, v: number | null): void {
  const b = { ...ledger.value.buyEach };
  if (v == null) delete b[key];
  else b[key] = v;
  setLedger("buyEach", b);
}
function setSold(key: SoldKey, ev: Event): void {
  setLedger(key, readCount(ev) ?? 0);
}
function resetLedger(): void {
  if (!ledgerGem.value) return;
  const next = { ...book.value };
  delete next[ledgerGem.value];
  book.value = next;
}
watch(
  book,
  (v) => {
    try {
      localStorage.setItem(LEDGER_KEY, JSON.stringify(v));
    } catch {
      /* 保存できなくても動く */
    }
  },
  { deep: true },
);
/** 帳簿の経路 (既定は最も得。相場が揃わず決まらない間は自作) */
const ledgerRouteId = computed<RouteId>(() => ledger.value.route ?? g.best.value?.id ?? "craft");
interface LedgerRowDef {
  key: RowKey;
  label: string;
  market: number | null;
  /** 買った物 (実際の買値を入れられる) */
  buy: BuyKey | null;
  /** 1 回の数。null は結果次第 (自動では埋めない) */
  perAttempt: number | null;
  hint: string;
}
function routeRows(id: RouteId): LedgerRowDef[] {
  const m = g.materials.value;
  const s = g.sale.value;
  const r = g.routes.value.find((x) => x.id === id);
  const crystal: LedgerRowDef = { key: "crystal", label: "コラプトの結晶", market: m.crystal, buy: null, perAttempt: 1, hint: "" };
  switch (id) {
    case "craft":
      return [
        { key: "baseGem", label: "低レベルのジェム本体", market: m.baseGem, buy: null, perAttempt: 1, hint: "" },
        { key: "gcp", label: "宝石細工師のプリズム", market: m.gcp, buy: null, perAttempt: 4, hint: "" },
        { key: "perfectJeweller", label: "宝飾職人のオーブ (完全)", market: m.perfectJeweller, buy: null, perAttempt: 1, hint: "" },
        { key: "vaal", label: "ヴァールオーブ", market: m.vaal, buy: null, perAttempt: 1, hint: "" },
        {
          ...crystal,
          perAttempt: null,
          hint: `片方当たった時だけ使う。実際の数を入れる${r?.ok ? ` (期待 ${fmtQty(r.expectedCrystals ?? 0)} 本 / 回)` : ""}`,
        },
        {
          key: "uncut20",
          label: g.uncutLabel.value,
          market: m.uncut20,
          buy: null,
          perAttempt: null,
          hint: `売る物にだけ使う。実際の数を入れる${r?.ok ? ` (期待 ${fmtQty(r.expectedUncut ?? 0)} 個 / 回)` : ""}`,
        },
      ];
    case "buy21":
      return [{ key: "buyLevel21", label: "レベル 21 (品質 20%) のジェム", market: s.level21, buy: "buyLevel21", perAttempt: 1, hint: "買った物" }, crystal];
    case "buy23":
      return [{ key: "buyQuality23", label: "品質 23% のジェム", market: s.quality23, buy: "buyQuality23", perAttempt: 1, hint: "買った物" }, crystal];
    case "buyFinished":
      return [{ key: "buyFinished", label: "完成品 (21 · 23%)", market: s.finished, buy: "buyFinished", perAttempt: 1, hint: "買った物" }];
  }
}
const ledgerRows = computed(() => {
  const l = ledger.value;
  return routeRows(ledgerRouteId.value).map((r) => {
    const auto = r.perAttempt == null ? 0 : r.perAttempt * l.attempts;
    const override = l.qty[r.key] ?? null;
    const qty = override ?? auto;
    const each = r.buy ? (l.buyEach[r.buy] ?? null) : null;
    const unit = each ?? r.market;
    return { ...r, auto, override, qty, each, unit, cost: unit == null ? null : unit * qty };
  });
});
const ledgerSales = computed(() => {
  const l = ledger.value;
  const s = g.sale.value;
  const rows: { qtyKey: SoldKey; eachKey: EachKey; label: string; market: number | null; qty: number; each: number | null }[] = [
    { qtyKey: "soldLevel21", eachKey: "eachLevel21", label: "レベル 21 (品質 20%)", market: s.level21, qty: l.soldLevel21, each: l.eachLevel21 },
    { qtyKey: "soldQuality23", eachKey: "eachQuality23", label: "品質 23%", market: s.quality23, qty: l.soldQuality23, each: l.eachQuality23 },
    { qtyKey: "soldFinished", eachKey: "eachFinished", label: "完成品 (21 · 23%)", market: s.finished, qty: l.soldFinished, each: l.eachFinished },
    { qtyKey: "soldOther", eachKey: "eachOther", label: "その他 (外れの生存品など)", market: null, qty: l.soldOther, each: l.eachOther },
  ];
  return rows.map((r) => {
    const price = r.each ?? r.market;
    return { ...r, price, revenue: price == null ? (r.qty > 0 ? null : 0) : price * r.qty };
  });
});
const ledgerTotals = computed(() => {
  const rows = ledgerRows.value;
  const sales = ledgerSales.value;
  const missingCost = rows.some((r) => r.qty > 0 && r.cost == null);
  const missingSale = sales.some((r) => r.qty > 0 && r.revenue == null);
  const cost = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  const revenue = sales.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const n = ledger.value.attempts;
  const finished = ledger.value.soldFinished;
  return {
    cost,
    revenue,
    profit: revenue - cost,
    missingCost,
    missingSale,
    /** 1 回あたりの損益 */
    perAttempt: n > 0 ? (revenue - cost) / n : null,
    /** 完成品 1 個あたりの実コスト */
    perFinished: finished > 0 ? cost / finished : null,
  };
});

/** 「N 回やった場合」の N (5 刻み)。アドニアと同じ (オーナー指示 2026-09-13) */
const ATTEMPT_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const attempts = ref(10);
const craft = computed(() => g.routes.value.find((r) => r.id === "craft") ?? null);
/**
 * 素材表: 自作 1 回あたりの数と費用、N 回分。
 * 結晶と原石は期待値 (結晶は片方当たった時に賭ける場合だけ、原石は壊れなかった物だけ)。
 */
const materialRows = computed(() => {
  const m = g.materials.value;
  const c = craft.value;
  const n = attempts.value;
  const rows: { key: string; label: string; price: number | null; editable: boolean; perAttempt: number | null; expected: boolean }[] = [
    { key: "baseGem", label: "低レベルのジェム本体", price: m.baseGem, editable: true, perAttempt: 1, expected: false },
    { key: "gcp", label: "宝石細工師のプリズム", price: m.gcp, editable: false, perAttempt: 4, expected: false },
    { key: "perfectJeweller", label: "宝飾職人のオーブ (完全)", price: m.perfectJeweller, editable: false, perAttempt: 1, expected: false },
    { key: "vaal", label: "ヴァールオーブ", price: m.vaal, editable: false, perAttempt: 1, expected: false },
    { key: "crystal", label: "コラプトの結晶", price: m.crystal, editable: false, perAttempt: c?.ok ? (c.expectedCrystals ?? 0) : null, expected: true },
    { key: "uncut20", label: g.uncutLabel.value, price: m.uncut20, editable: false, perAttempt: c?.ok ? (c.expectedUncut ?? 0) : null, expected: true },
  ];
  return rows.map((r) => {
    const qtyN = r.perAttempt == null ? null : r.perAttempt * n;
    return {
      ...r,
      costPerAttempt: r.price == null || r.perAttempt == null ? null : r.price * r.perAttempt,
      qtyN,
      costN: r.price == null || qtyN == null ? null : r.price * qtyN,
    };
  });
});
const fmtQty = (q: number | null): string => (q == null ? "—" : Number.isInteger(q) ? String(q) : q.toFixed(2));
/** N 回やった場合 (経路ごと) */
const atN = computed(() => {
  const n = attempts.value;
  return g.routes.value
    .filter((r) => r.ok)
    .map((r) => ({
      id: r.id,
      label: r.label,
      pAny: r.pFinished > 0 ? 1 - Math.pow(1 - r.pFinished, n) : 0,
      expected: n * r.pFinished,
      cost: n * r.expectedCost,
      revenue: n * (r.ev + r.expectedCost),
      profit: n * r.ev,
    }));
});
</script>

<template>
  <section class="@container min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-3">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">ジェムコラプトの賭け</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        レベル 21 · 品質 23% のジェムを手に入れる 4 つの経路 (自作 / レベル 21 を買って賭ける / 品質 23% を買って賭ける / 完成品を買う)
        を「1 回あたりの期待収支」で比べます。
      </p>
      <div class="mt-1"><CurrencyPicker /></div>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
        素材価格: カレンシーランキングの相場{{ g.league.value ? ` (${g.league.value.Value})` : "" }} · {{ g.marketLabel.value }} / 売値: trade2 最安 (取得ボタン) か手入力 / ジェム一覧と素材の説明: ゲームクライアント
        <span v-if="g.marketError.value" class="text-amber-300">— poe2scout 取得失敗: {{ g.marketError.value }}</span>
      </p>
    </header>

    <!-- ジェム選択 (候補リストがカードからはみ出すので overflow を解放し、最前面に出す) -->
    <BaseCard class="mb-4 !overflow-visible relative z-30">
      <div class="p-4 pl-5 flex flex-wrap gap-4 items-start">
        <div class="relative w-80">
          <label class="block text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)] mb-1">ジェム (日本語 / 英語で検索)</label>
          <input
            v-model="g.query.value"
            type="text"
            spellcheck="false"
            placeholder="例: アーク / Cast on Critical"
            class="w-full text-[13px] px-2 py-1.5 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
            @input="onQueryInput"
            @focus="listOpen = true"
            @blur="listOpen = false"
            @keydown="onQueryKeydown"
          />
          <ul
            v-if="listOpen && !g.selected.value && g.matches.value.length > 0"
            ref="listEl"
            class="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] shadow-lg"
          >
            <li
              v-for="(m, i) in g.matches.value"
              :key="m.en"
              class="px-2 py-1 text-[13px] cursor-pointer flex items-baseline gap-2"
              :class="i === hi ? 'bg-[var(--exile-color-bg-surface)] text-[var(--exile-color-accent-focus)]' : 'hover:bg-[var(--exile-color-bg-surface)]'"
              @mouseenter="hi = i"
              @mousedown.prevent="g.select(m)"
            >
              <span>{{ m.ja }}</span>
              <span class="text-[11px] text-[var(--exile-color-text-tertiary)] truncate">{{ m.en }}</span>
              <span v-if="m.spirit" class="ml-auto text-[10px] px-1 rounded bg-[#6AA0B8]/25 text-[#9CC9DA]">スピリット</span>
              <span v-else-if="m.kind === 'meta'" class="ml-auto text-[10px] px-1 rounded bg-[#9B7BCC]/25 text-[#C7A7E5]">メタ</span>
            </li>
          </ul>
        </div>
        <div v-if="g.selected.value" class="text-[13px] leading-relaxed">
          <div class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-base">{{ g.selected.value.ja }}</div>
          <div class="text-[11px] text-[var(--exile-color-text-secondary)]">
            {{ g.selected.value.en }} · {{ g.selected.value.spirit ? "スピリットジェム (原石はスピリット用)" : "スキルジェム" }}
            <span v-if="g.selected.value.kind === 'meta'"> · メタジェム</span>
            <span v-if="g.selected.value.minLevel > 0"> · 必要レベル {{ g.selected.value.minLevel }}</span>
          </div>
        </div>
        <p v-else class="text-[12px] text-[var(--exile-color-text-tertiary)] self-center">ジェムを選ぶと売値の検索と収支が出ます。</p>
      </div>
    </BaseCard>

    <div class="grid grid-cols-1 @6xl:grid-cols-2 gap-4 mb-4">
      <!-- 売値 -->
      <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">売値 ({{ unit }})</h2>
            <div class="flex items-center gap-3 text-[11px]">
              <label class="inline-flex items-center gap-1 text-[var(--exile-color-text-secondary)]">
                <input v-model="g.requireSockets.value" type="checkbox" class="accent-[var(--exile-color-accent-focus)]" />
                5 ソケットに限定
              </label>
              <button
                type="button"
                :disabled="!g.selected.value || refetch.disabled"
                class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                @click="g.fetchSalePrices"
              >
                <span aria-hidden="true">⟳</span>
                {{ refetch.label }}
              </button>
            </div>
          </div>
          <p v-if="g.priceError.value" class="text-[11px] text-amber-300 mb-2">{{ g.priceError.value }}</p>
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">状態</th>
                <th class="text-right font-normal pb-1 w-28">売値</th>
                <th class="text-right font-normal pb-1 w-20">出品数</th>
                <th class="text-right font-normal pb-1 w-16"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in SALE_ROWS" :key="row.key" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>{{ row.label }}</div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ row.condition }}</div>
                </td>
                <td class="py-1.5 text-right">
                  <span class="tabular-nums text-[13px]" :class="g.sale.value[row.key] == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ g.sale.value[row.key] == null ? (g.pricing.value ? "取得中…" : "—") : money(g.sale.value[row.key]) }}</span>
                </td>
                <td class="py-1.5 text-right tabular-nums text-[var(--exile-color-text-secondary)]">
                  {{ g.saleInfo.value[row.key] ? g.saleInfo.value[row.key]!.total : "" }}
                </td>
                <td class="py-1.5 text-right">
                  <button
                    type="button"
                    :disabled="!g.selected.value"
                    class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)] disabled:opacity-40"
                    title="同じ条件でトレードサイト (JP) を開く。API は使わない"
                    @click="open(g.tradeUrl(row.key))"
                  >
                    トレード2へ ↗
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            ジェムを選ぶと自動で trade2 から最安 1 件を取ります (3 件、約 30 秒)。値がおかしい時は「トレード2へ」で一覧を確認してください (取得条件の問題なので手入力はしない方針)。コラプト済みの品はプリズムやオーブで直せないので、買う場合は品質 20% · 5 ソケット前提です。
          </p>
        </div>
      </BaseCard>

      <!-- 素材 -->
      <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">素材 (自作、{{ unit }})</h2>
            <label class="text-[11px] text-[var(--exile-color-text-secondary)] inline-flex items-center gap-2">
              回数
              <select v-model.number="attempts" class="num text-left w-20">
                <option v-for="n in ATTEMPT_OPTIONS" :key="n" :value="n">{{ n }} 回</option>
              </select>
            </label>
          </div>
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">素材</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">単価</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">1 回の数</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">1 回の費用</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">{{ attempts }} 回の数</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">{{ attempts }} 回の費用</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in materialRows" :key="m.key" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>{{ m.label }}</div>
                  <div v-if="MATERIAL_DESC[m.key]" class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ MATERIAL_DESC[m.key] }}</div>
                </td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">
                  <MoneyInput v-if="m.editable" v-model="g.baseGemPrice.value" />
                  <span v-else :class="m.price == null ? 'text-amber-300' : ''">{{ m.price == null ? "相場なし" : money(m.price) }}</span>
                </td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ fmtQty(m.perAttempt) }}<span v-if="m.expected && m.perAttempt != null" class="text-[10px] text-[var(--exile-color-text-tertiary)]"> (期待)</span></td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ money(m.costPerAttempt) }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ fmtQty(m.qtyN) }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ money(m.costN) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)] font-display tracking-[0.04em]">
                <td class="py-1.5 pr-2">合計 (期待)</td>
                <td></td>
                <td></td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ craft?.ok ? money(craft.expectedCost) : "—" }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap text-[10px] text-[var(--exile-color-text-tertiary)]">{{ craft?.ok ? `完成 ${(attempts * craft.pFinished).toFixed(2)} 個` : "" }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ craft?.ok ? money(attempts * craft.expectedCost) : "—" }}</td>
              </tr>
            </tbody>
          </table>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            原石 (レベル 20) は「売る物」にだけ掛かります。壊れた物や売らない物には掛かりません。低レベルのジェム本体は相場が無いので手入力です。
            結晶は「片方当たった時に賭ける」と決めた場合だけ使うので、1 回の数は期待値 (賭けない判断なら 0)。売値が揃うまでは「—」。
          </p>
        </div>
      </BaseCard>
    </div>

    <!-- 結果 -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">経路の比較</h2>
          <span v-if="g.best.value" class="text-[11px] text-[var(--exile-color-text-secondary)]">
            最も得: <span class="text-[var(--exile-color-accent-focus)]">{{ g.best.value.label }}</span>
            <span v-if="g.best.value.id === 'buyFinished'"> (どの経路も期待収支がマイナス)</span>
          </span>
        </div>
        <div class="grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-4 gap-3">
          <div
            v-for="r in g.routes.value"
            :key="r.id"
            class="rounded border p-3 text-[12px]"
            :class="isBest(r) ? 'border-[var(--exile-color-accent-focus)] ring-1 ring-[var(--exile-color-accent-focus)]/40' : 'border-[var(--exile-color-border-subtle)]'"
          >
            <div class="font-display tracking-[0.06em] text-[13px] mb-1 flex items-center gap-2">
              <span>{{ r.label }}</span>
              <span v-if="isBest(r)" class="text-[10px] px-1 rounded bg-[var(--exile-color-accent-focus)]/15 text-[var(--exile-color-accent-focus)]">最も得</span>
            </div>
            <template v-if="r.ok">
              <div class="flex items-baseline justify-between">
                <span class="text-[var(--exile-color-text-secondary)]">1 回の期待収支</span>
                <span class="tabular-nums text-[14px]" :class="evClass(r.id === 'buyFinished' ? null : r.ev)">
                  {{ r.id === "buyFinished" ? "基準 (0)" : money(r.ev, true) }}
                </span>
              </div>
              <div class="hidden">
              </div>
              <div class="flex items-baseline justify-between">
                <span class="text-[var(--exile-color-text-secondary)]">完成品 1 個の実質コスト</span>
                <span class="tabular-nums">
                  <template v-if="r.costPerFinished == null">—</template>
                  <template v-else-if="r.costPerFinished <= 0">0 (途中の売上で回収)</template>
                  <template v-else>{{ money(r.costPerFinished) }}</template>
                </span>
              </div>
              <div class="flex items-baseline justify-between">
                <span class="text-[var(--exile-color-text-secondary)]">1 回の確定費用</span>
                <span class="tabular-nums">{{ money(r.upfront) }}</span>
              </div>
              <div class="flex items-baseline justify-between">
                <span class="text-[var(--exile-color-text-secondary)]">完成品になる確率</span>
                <span class="tabular-nums">{{ pct(r.pFinished) }}</span>
              </div>
              <div v-if="r.id === 'craft'" class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-1">
                レベル +1 のあと: {{ r.gambleAfterLevel ? "結晶で品質を賭ける" : "そのまま売る" }} /
                品質 23% のあと: {{ r.gambleAfterQuality ? "結晶でレベルを賭ける" : "そのまま売る" }}
              </div>
              <button
                type="button"
                class="mt-2 text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]"
                @click="expanded[r.id] = !expanded[r.id]"
              >
                {{ expanded[r.id] ? "▲ 内訳を閉じる" : "▼ 内訳" }}
              </button>
              <table v-if="expanded[r.id]" class="w-full mt-1 text-[11px]">
                <tbody>
                  <tr v-for="(o, i) in r.outcomes" :key="i" class="border-t border-[var(--exile-color-border-subtle)]">
                    <td class="py-0.5 pr-1">{{ o.label }}</td>
                    <td class="py-0.5 text-right tabular-nums w-12">{{ pct(o.p) }}</td>
                    <td class="py-0.5 text-right tabular-nums w-20">{{ money(o.net) }}</td>
                  </tr>
                </tbody>
              </table>
            </template>
            <div v-else class="text-[11px] text-[var(--exile-color-text-tertiary)]">
              不足: {{ r.missing.join("、") }}
            </div>
          </div>
        </div>
        <div v-if="atN.length > 0" class="mt-3 rounded border border-[var(--exile-color-border-subtle)] p-3 text-[12px]">
          <div class="flex items-baseline justify-between mb-1 gap-2 flex-wrap">
            <span class="font-display tracking-[0.04em]">{{ attempts }} 回やった場合 (経路ごと)</span>
            <label class="text-[11px] text-[var(--exile-color-text-secondary)] inline-flex items-center gap-2">
              回数
              <select v-model.number="attempts" class="num text-left w-20">
                <option v-for="n in ATTEMPT_OPTIONS" :key="n" :value="n">{{ n }} 回</option>
              </select>
            </label>
          </div>
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">経路</th>
                <th class="text-right font-normal pb-1 pl-2">1 個以上できる確率</th>
                <th class="text-right font-normal pb-1 pl-2">完成の期待数</th>
                <th class="text-right font-normal pb-1 pl-2">期待総費用</th>
                <th class="text-right font-normal pb-1 pl-2">期待売上</th>
                <th class="text-right font-normal pb-1 pl-2">期待損益</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in atN" :key="r.id" class="border-t border-[var(--exile-color-border-subtle)]" :class="g.best.value && g.best.value.id === r.id ? 'text-[var(--exile-color-accent-focus)]' : ''">
                <td class="py-1 pr-2">{{ r.label }}</td>
                <td class="py-1 pl-2 text-right tabular-nums">{{ pct(r.pAny) }}</td>
                <td class="py-1 pl-2 text-right tabular-nums">{{ r.expected.toFixed(2) }} 個</td>
                <td class="py-1 pl-2 text-right tabular-nums whitespace-nowrap">{{ money(r.cost) }}</td>
                <td class="py-1 pl-2 text-right tabular-nums whitespace-nowrap">{{ money(r.revenue) }}</td>
                <td class="py-1 pl-2 text-right tabular-nums whitespace-nowrap" :class="evClass(r.profit)">{{ r.id === 'buyFinished' ? "基準 (0)" : money(r.profit, true) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-1">
            期待総費用は「確定費用 + 結晶の期待本数 × 結晶」× 回数。期待売上は出来た物 (完成品・21・23%・外れの生存品) を全部売った時の平均 × 回数。買って賭ける経路の費用は買値込み。
          </p>
        </div>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-3">
          「1 回の期待収支」は 1 回試して出来た物を全部売った時の平均損益で、完成品を買う経路が 0 の基準。これで「最も得」を決めます。
          実質コスト = (費用の期待値 − 完成品以外で回収できる期待額) ÷ 完成品になる確率。自作で片方だけ売る戦略の時は完成率 0 なので出ません。
        </p>
      </div>
    </BaseCard>

    <!-- 収支 (実績入力) 2026-09-13、経路と回数で埋める 2026-09-14 -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">
            収支<span v-if="g.selected.value" class="text-[12px] text-[var(--exile-color-text-secondary)] tracking-normal"> · {{ g.selected.value.ja }}</span>
          </h2>
          <div class="flex items-center gap-3 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
            <span>経路と回数を入れると使った数が埋まる。違った数だけ上書き</span>
            <button type="button" class="underline hover:text-[var(--exile-color-accent-focus)] disabled:opacity-40" :disabled="!g.selected.value" @click="resetLedger">全部 0 に</button>
          </div>
        </div>
        <p v-if="!g.selected.value" class="text-[12px] text-[var(--exile-color-text-tertiary)]">ジェムを選ぶと、そのジェムの帳簿が出ます。</p>
        <template v-else>
          <div class="mb-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
            <label class="inline-flex items-center gap-2 min-w-0 max-w-full">
              経路
              <select :value="ledger.route ?? ''" class="num text-left w-72 max-w-full min-w-0" @change="setRoute">
                <option value="">最も得に合わせる{{ g.best.value ? ` (${g.best.value.label})` : "" }}</option>
                <option v-for="r in g.routes.value" :key="r.id" :value="r.id">{{ r.label }}</option>
              </select>
            </label>
            <label class="inline-flex items-center gap-2">
              回数
              <input :value="ledger.attempts || ''" type="number" min="0" step="1" placeholder="0" class="num w-20" @input="setAttempts" />
            </label>
          </div>
          <table class="w-full text-[12px] break-words">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">素材</th>
                <th class="text-right font-normal pb-1 pl-3">単価 (買った物は空欄なら相場)</th>
                <th class="text-right font-normal pb-1 pl-3">使った数 (空欄は 1 回の数 × 回数)</th>
                <th class="text-right font-normal pb-1 pl-3">費用</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in ledgerRows" :key="r.key" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>{{ r.label }}</div>
                  <div v-if="r.hint" class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ r.hint }}</div>
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap" :class="!r.buy && r.unit == null ? 'text-amber-300' : ''">
                  <MoneyInput v-if="r.buy" :model-value="r.each" :placeholder-exalted="r.market" width="w-24" @update:model-value="setBuyEach(r.buy as BuyKey, $event)" />
                  <template v-else>{{ r.unit == null ? "相場なし" : money(r.unit) }}</template>
                </td>
                <td class="py-1.5 pl-3 text-right">
                  <input :value="r.override ?? ''" type="number" min="0" step="1" :placeholder="fmtQty(r.auto)" class="num w-24" @input="setQty(r.key, $event)" />
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.cost) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)]">
                <td class="py-1.5 pr-2 font-display tracking-[0.04em]">費用合計</td>
                <td></td>
                <td></td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(ledgerTotals.cost) }}</td>
              </tr>
            </tbody>
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pt-3 pb-1">売れた物</th>
                <th class="text-right font-normal pt-3 pb-1 pl-3">1 個の売値 (空欄なら相場)</th>
                <th class="text-right font-normal pt-3 pb-1 pl-3">売れた数</th>
                <th class="text-right font-normal pt-3 pb-1 pl-3">売上</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in ledgerSales" :key="r.qtyKey" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">{{ r.label }}</td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">
                  <MoneyInput :model-value="r.each" :placeholder-exalted="r.market" width="w-24" @update:model-value="setLedger(r.eachKey, $event)" />
                </td>
                <td class="py-1.5 pl-3 text-right">
                  <input :value="r.qty || ''" type="number" min="0" step="1" placeholder="0" class="num w-24" @input="setSold(r.qtyKey, $event)" />
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.revenue) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)]">
                <td class="py-1.5 pr-2 font-display tracking-[0.04em]">売上合計</td>
                <td></td>
                <td></td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(ledgerTotals.revenue) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)]">
                <td class="py-1.5 pr-2 font-display tracking-[0.04em]">収支</td>
                <td class="py-1.5 pl-3 text-right tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">
                  {{ ledgerTotals.perFinished != null ? `完成 1 個あたり ${money(ledgerTotals.perFinished)}` : "" }}
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">
                  {{ ledgerTotals.perAttempt != null ? `1 回あたり ${money(ledgerTotals.perAttempt, true)}` : "" }}
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums text-[14px] whitespace-nowrap" :class="evClass(ledgerTotals.profit)">{{ money(ledgerTotals.profit, true) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            使った数は空欄なら「経路の 1 回の数 × 回数」、実際に違った数だけ入れてください。自作の結晶と原石は結果次第なので実際の数を入れます。
            買ったジェムと売れた物の値段は空欄なら上の売値 (trade2 最安)、実際の額があればそれを入れてください。「その他」は外れの生存品など、相場が無い物の実売用。入力はジェムごとにこの PC に残ります。
            <span v-if="ledgerTotals.missingCost" class="text-amber-300">相場が取れていない素材があるため費用が不完全です。</span>
            <span v-if="ledgerTotals.missingSale" class="text-amber-300">売値が無い行があるため売上が不完全です。</span>
          </p>
        </template>
      </div>
    </BaseCard>

    <!-- 前提 -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <button
          type="button"
          class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-center gap-2"
          @click="showAssumptions = !showAssumptions"
        >
          <span>{{ showAssumptions ? "▲" : "▼" }}</span>
          <span>前提 (確率は非公開のためコミュニティ推定。ここで変えられます)</span>
        </button>
        <div v-if="showAssumptions" class="mt-3 grid grid-cols-1 @4xl:grid-cols-2 gap-4 text-[12px]">
          <div class="space-y-2">
            <div class="text-[11px] text-[var(--exile-color-text-secondary)]">ヴァールオーブ (未コラプトのジェムに 1 回)。4 系統の重み (比率で使う)</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
              <label>変化なし</label><input v-model.number="g.params.value.vaalNone" type="number" min="0" step="0.05" class="num" />
              <label>レベル ±1 (半々)</label><input v-model.number="g.params.value.vaalLevel" type="number" min="0" step="0.05" class="num" />
              <label>品質 −3〜+3 (均等)</label><input v-model.number="g.params.value.vaalQuality" type="number" min="0" step="0.05" class="num" />
              <label>ソケット ±1</label><input v-model.number="g.params.value.vaalSockets" type="number" min="0" step="0.05" class="num" />
              <label>品質の段数 (−3〜+3 なら 7)</label><input v-model.number="g.params.value.qualitySteps" type="number" min="2" step="1" class="num" />
            </div>
            <div class="text-[11px] text-[var(--exile-color-text-tertiary)]">
              → レベル +1: {{ pct(g.vaalP.value.levelUp) }} / 品質 23%: {{ pct(g.vaalP.value.qualityTop) }} / 外れ: {{ pct(g.vaalP.value.junk) }}
            </div>
          </div>
          <div class="space-y-2">
            <div class="text-[11px] text-[var(--exile-color-text-secondary)]">コラプトの結晶 (コラプト済みのジェムに)。生き残れば「まだ振っていない系統」だけを振り直す</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
              <label>破壊される確率</label><input v-model.number="g.params.value.crystalDestroy" type="number" min="0" max="1" step="0.05" class="num" />
              <label>外れた生存品の価値 (元の値段の割合)</label><input v-model.number="g.params.value.leftoverFraction" type="number" min="0" max="1" step="0.05" class="num" />
            </div>
            <div class="text-[11px] text-[var(--exile-color-text-tertiary)]">
              レベル 21 から品質 23% を当てる: 生存 × 1/{{ Math.max(2, Math.round(g.params.value.qualitySteps)) - 1 }} /
              品質 23% からレベル +1 を当てる: 生存 × 1/2
            </div>
            <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="g.resetParams">
              既定値に戻す
            </button>
          </div>
          <div class="@4xl:col-span-2 text-[11px] text-[var(--exile-color-text-tertiary)] leading-relaxed">
            ゲームクライアントにあるのは「コラプトの結晶: コラプト状態のスキルジェムを予測不可能に変化させるか、または破壊する」「穢れにより +1 レベル」
            といった文言と対象アイテム種 (スキル / サポート / メタジェム) までで、確率は入っていません。既定値は 4 系統等確率・品質 7 段階均等・結晶の破壊 50% です。
            レベル上げは「原石」でコラプト後も可能なので、レベルは最後に上げる前提で計算しています (壊れた物にレベル代を払わない)。
          </div>
        </div>
      </div>
    </BaseCard>

    <footer class="text-[11px] text-[var(--exile-color-text-tertiary)] flex items-center gap-4 flex-wrap">
      <span>ジェム一覧 / 素材の名前と説明: ゲームクライアント (SkillGems, BaseItemTypes, GemTags, CurrencyItems)</span>
      <span>素材価格: カレンシーランキングの相場 (poe2scout 由来)</span>
      <span>売値: trade2 (取得ボタンは検索 3 回、鑑定は API 不使用)</span>
    </footer>
  </section>
</template>

<style scoped>
.num {
  width: 5.5rem;
  text-align: right;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--exile-color-bg-surface);
  border: 1px solid var(--exile-color-border-subtle);
  font-variant-numeric: tabular-nums;
}
.num:focus {
  outline: none;
  border-color: var(--exile-color-accent-focus);
}
</style>
