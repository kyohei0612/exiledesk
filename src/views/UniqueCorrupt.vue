<!--
  UniqueCorrupt.vue — ユニークコラプトの賭け (2026-09-13、「ヴァールの天秤」の 1 つ)
  安いユニークを買って束でヴァールオーブを打ち、狙いのコラプト付加 (Vaal enchantment) が付いた物を高く売る。
  続けてアーキテクトオーブで 2 個目の付加 (2 重コラプト) を賭けることもできる。
    views/unique-corrupt/model.ts            期待値モデル (純粋関数)
    views/unique-corrupt/useUniqueCorrupt.ts 状態 / 相場 / trade2
    i18n/vaal-enchants.json                  付加プール (GGG クライアント由来、build-vaal-enchants-from-client.mjs)
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { openExternal } from "../services/trade2/open-external";
import { refetchState } from "../services/trade2/auto-price";
import BaseCard from "../components/decor/BaseCard.vue";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import MoneyInput from "../components/vaal-scales/MoneyInput.vue";
import { displayCurrency } from "../state/display-currency";
import { CLASS_JA, MAX_SECOND_TARGETS, MAX_TARGETS, useUniqueCorrupt } from "./unique-corrupt/useUniqueCorrupt";
const money = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed });
const unit = displayCurrency.label;

async function open(url: string | null): Promise<void> {
  await openExternal(url);
}

const u = useUniqueCorrupt();
onMounted(() => {
  void u.loadMarket();
});
const showAssumptions = ref(false);
const listOpen = ref(false);

function pct(p: number): string {
  if (!Number.isFinite(p)) return "—";
  const v = p * 100;
  return `${v.toFixed(v >= 10 ? 1 : 2)}%`;
}
function evClass(v: number | null): string {
  if (v == null) return "text-[var(--exile-color-text-tertiary)]";
  return v > 0 ? "text-emerald-300" : v < 0 ? "text-red-300" : "";
}
const classJa = (cls: string): string => CLASS_JA[cls] ?? cls;
const fourthLabel = computed(() => {
  const f = u.selected.value?.fourth;
  return f === "socket" ? "ルーンソケット +1" : f === "quality" ? "品質が上がる (最大 23%)" : "何もなし (変化なしに合流)";
});

// ---- 候補リストのキーボード操作 (ジェムと同じ) ----
const hi = ref(0);
const listEl = ref<HTMLUListElement | null>(null);
function onQueryInput(): void {
  listOpen.value = true;
  hi.value = 0;
  if (u.selected.value && u.query.value !== u.selected.value.ja) u.selected.value = null;
}
function scrollHiIntoView(): void {
  void nextTick(() => {
    const li = listEl.value?.children[hi.value] as HTMLElement | undefined;
    li?.scrollIntoView({ block: "nearest" });
  });
}
function onQueryKeydown(e: KeyboardEvent): void {
  const n = u.matches.value.length;
  const visible = listOpen.value && !u.selected.value && n > 0;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!visible) {
      listOpen.value = true;
      return;
    }
    hi.value = (hi.value + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
    scrollHiIntoView();
  } else if (e.key === "Enter") {
    if (!visible) return;
    e.preventDefault();
    const m = u.matches.value[Math.min(hi.value, n - 1)];
    if (m) u.select(m);
  } else if (e.key === "Escape") {
    listOpen.value = false;
  }
}

/** 再取得ボタン (検索中 / レート制限 / 間隔待ち のカウントダウン) */
const refetch = computed(() => refetchState(u.pricing.value, "trade2 で取り直す", `trade2 で検索中… (残り ${u.pending.value} 件、1 件 約 10 秒)`));

/** 「N 回やった場合」の N (5 刻み) */
const ATTEMPT_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const attempts = ref(10);
const atN = computed(() => {
  const r = u.result.value;
  const n = attempts.value;
  return {
    pAny: r.pHit > 0 ? 1 - Math.pow(1 - r.pHit, n) : 0,
    expected: n * r.pHit,
    cost: r.ok ? n * r.cost : null,
    revenue: r.ok ? n * r.expectedSale : null,
    profit: r.ok ? n * r.ev : null,
  };
});
/** 素材表 (1 回 / N 回) */
const materialRows = computed(() => {
  const n = attempts.value;
  const rows = [
    { key: "unique", label: u.selected.value ? `${u.selected.value.ja} (未コラプト)` : "ユニーク (未コラプト)", note: "失敗しても品物は残る (コラプト済みとして売る)", unit: u.basePrice.value, perAttempt: 1 },
    { key: "vaal", label: "ヴァールオーブ", note: "1 回に 1 個", unit: u.auto.value.vaal, perAttempt: 1 },
  ];
  return rows.map((r) => ({ ...r, costPerAttempt: r.unit == null ? null : r.unit * r.perAttempt, qtyN: r.perAttempt * n, costN: r.unit == null ? null : r.unit * r.perAttempt * n }));
});

/** 付加の表示行 (プール) */
const poolRows = computed(() =>
  u.pool.value.map((m) => {
    const on = u.targets.value.includes(m.id);
    const f = on ? u.get(`target:${m.id}`) : null;
    return { ...m, on, price: f?.price ?? null, none: !!f && f.price == null, url: on ? u.tradeUrl(`target:${m.id}`) : null, priceable: m.trade.length > 0 };
  }),
);
const secondRows = computed(() =>
  u.secondPool.value.map((m) => {
    const on = u.secondTargets.value.includes(m.id);
    const f = on ? u.get(`twice:${m.id}`) : null;
    return { ...m, on, price: f?.price ?? null, none: !!f && f.price == null, url: on ? u.tradeUrl(`twice:${m.id}`) : null, priceable: m.trade.length > 0 };
  }),
);

/**
 * 収支 (実績入力): 使った数と売れた数を手入力 (ユニークごとに保存)。単価は上の相場、売値は相場か実売。
 */
const LEDGER_KEY = "exiledesk.unique-corrupt.ledger";
interface Ledger {
  uniques: number;
  vaals: number;
  architects: number;
  soldHit: number;
  soldFloor: number;
  soldTwice: number;
  soldOther: number;
  eachHit: number | null;
  eachFloor: number | null;
  eachTwice: number | null;
  eachOther: number | null;
}
const EMPTY_LEDGER: Ledger = { uniques: 0, vaals: 0, architects: 0, soldHit: 0, soldFloor: 0, soldTwice: 0, soldOther: 0, eachHit: null, eachFloor: null, eachTwice: null, eachOther: null };
type LedgerBook = Record<string, Partial<Ledger>>;
function loadBook(): LedgerBook {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    return raw ? (JSON.parse(raw) as LedgerBook) : {};
  } catch {
    return {};
  }
}
const book = ref<LedgerBook>(loadBook());
const ledgerKey = computed(() => u.selected.value?.en ?? "");
const ledger = computed<Ledger>(() => ({ ...EMPTY_LEDGER, ...(book.value[ledgerKey.value] ?? {}) }));
type CountKey = "uniques" | "vaals" | "architects" | "soldHit" | "soldFloor" | "soldTwice" | "soldOther";
type EachKey = "eachHit" | "eachFloor" | "eachTwice" | "eachOther";
function setLedger<K extends keyof Ledger>(key: K, v: Ledger[K]): void {
  if (!ledgerKey.value) return;
  book.value = { ...book.value, [ledgerKey.value]: { ...ledger.value, [key]: v } };
}
function ledgerNum(key: CountKey, ev: Event): void {
  const v = Number((ev.target as HTMLInputElement).value);
  setLedger(key, Number.isFinite(v) && v > 0 ? v : 0);
}
function resetLedger(): void {
  if (!ledgerKey.value) return;
  const next = { ...book.value };
  delete next[ledgerKey.value];
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
const ledgerRows = computed(() => {
  const l = ledger.value;
  const rows: { key: CountKey; label: string; unit: number | null; qty: number }[] = [
    { key: "uniques", label: u.selected.value ? `${u.selected.value.ja} (未コラプト)` : "ユニーク", unit: u.basePrice.value, qty: l.uniques },
    { key: "vaals", label: "ヴァールオーブ", unit: u.auto.value.vaal, qty: l.vaals },
    { key: "architects", label: "アーキテクトオーブ", unit: u.auto.value.architect, qty: l.architects },
  ];
  return rows.map((r) => ({ ...r, cost: r.unit == null ? null : r.unit * r.qty }));
});
const ledgerSales = computed(() => {
  const l = ledger.value;
  const r = u.result.value;
  const rows: { qtyKey: CountKey; eachKey: EachKey; label: string; market: number | null; qty: number; each: number | null }[] = [
    { qtyKey: "soldHit", eachKey: "eachHit", label: "狙いの付加つき", market: r.avgHitSale, qty: l.soldHit, each: l.eachHit },
    { qtyKey: "soldFloor", eachKey: "eachFloor", label: "外れ (コラプト済みとして)", market: u.floorPrice.value, qty: l.soldFloor, each: l.eachFloor },
    { qtyKey: "soldTwice", eachKey: "eachTwice", label: "2 重コラプトの当たり", market: u.architect.value.avgHitSale, qty: l.soldTwice, each: l.eachTwice },
    { qtyKey: "soldOther", eachKey: "eachOther", label: "その他", market: null, qty: l.soldOther, each: l.eachOther },
  ];
  return rows.map((row) => {
    const price = row.each ?? row.market;
    return { ...row, price, revenue: price == null ? (row.qty > 0 ? null : 0) : price * row.qty };
  });
});
const ledgerTotals = computed(() => {
  const rows = ledgerRows.value;
  const sales = ledgerSales.value;
  const cost = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  const revenue = sales.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const vaals = ledger.value.vaals;
  const hits = ledger.value.soldHit;
  return {
    cost,
    revenue,
    profit: revenue - cost,
    missingCost: rows.some((r) => r.qty > 0 && r.cost == null),
    missingSale: sales.some((r) => r.qty > 0 && r.revenue == null),
    rate: vaals > 0 ? hits / vaals : null,
    perVaal: vaals > 0 ? (revenue - cost) / vaals : null,
  };
});
</script>

<template>
  <section class="min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-3">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">ユニークコラプトの賭け</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        安いユニークを買って束でヴァールオーブを打ち、狙いのコラプト付加が付いた物を高く売る賭け。外れても品物はコラプト済みとして売れます。
        当たりが出たら、アーキテクトオーブで 2 個目の付加 (2 重コラプト) を賭けるかどうかも判定します。
      </p>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
        素材価格: カレンシーランキングの相場{{ u.league.value ? ` (${u.league.value.Value})` : "" }} · {{ u.marketLabel.value }} / 売値: trade2 最安 (自動) / 付加プール: ゲームクライアント /
        確率は非公開 (コミュニティの仮定、変更可)
        <span v-if="u.marketError.value" class="text-amber-300">— poe2scout 取得失敗: {{ u.marketError.value }}</span>
        <span v-if="u.priceError.value" class="text-amber-300">— trade2: {{ u.priceError.value }}</span>
      </p>
      <div class="mt-1"><CurrencyPicker /></div>
    </header>

    <!-- ユニーク選択 (候補リストがカードからはみ出すので overflow を解放し、最前面に出す) -->
    <BaseCard class="mb-4 !overflow-visible relative z-30">
      <div class="p-4 pl-5 flex flex-wrap gap-4 items-start">
        <div class="relative w-80">
          <label class="block text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)] mb-1">ユニーク (日本語 / 英語で検索)</label>
          <input
            v-model="u.query.value"
            type="text"
            spellcheck="false"
            placeholder="例: ヘッドハンター / Headhunter"
            class="w-full text-[13px] px-2 py-1.5 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
            @input="onQueryInput"
            @focus="listOpen = true"
            @blur="listOpen = false"
            @keydown="onQueryKeydown"
          />
          <ul
            v-if="listOpen && !u.selected.value && u.matches.value.length > 0"
            ref="listEl"
            class="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] shadow-lg"
          >
            <li
              v-for="(m, i) in u.matches.value"
              :key="m.en"
              class="px-2 py-1 text-[13px] cursor-pointer flex items-baseline gap-2"
              :class="i === hi ? 'bg-[var(--exile-color-bg-surface)] text-[var(--exile-color-accent-focus)]' : 'hover:bg-[var(--exile-color-bg-surface)]'"
              @mouseenter="hi = i"
              @mousedown.prevent="u.select(m)"
            >
              <span>{{ m.ja }}</span>
              <span class="text-[11px] text-[var(--exile-color-text-tertiary)] truncate">{{ m.en }}</span>
              <span class="ml-auto text-[10px] px-1 rounded bg-[var(--exile-color-bg-surface)] text-[var(--exile-color-text-secondary)]">{{ classJa(m.cls) }}</span>
            </li>
          </ul>
        </div>
        <div v-if="u.selected.value" class="text-[13px] leading-relaxed">
          <div class="font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] text-base">{{ u.selected.value.ja }}</div>
          <div class="text-[11px] text-[var(--exile-color-text-secondary)]">
            {{ u.selected.value.en }} · {{ u.selected.value.base }} ({{ classJa(u.selected.value.cls) }}) · 付加プール {{ u.poolSize.value }} 種 · 4 つ目の結果: {{ fourthLabel }}
          </div>
        </div>
        <p v-else class="text-[12px] text-[var(--exile-color-text-tertiary)] self-center">ユニークを選ぶと付加プールと相場が出ます。狙いは最大 {{ MAX_TARGETS }} つ。</p>
      </div>
    </BaseCard>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
      <!-- 相場 (trade2 自動) -->
      <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">相場 (trade2 から自動)</h2>
            <button
              type="button"
              :disabled="refetch.disabled || !u.selected.value"
              class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[11px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors tabular-nums"
              @click="u.fetchPrices(true)"
            >
              <span aria-hidden="true">⟳</span>
              {{ refetch.label }}
            </button>
          </div>
          <p v-if="!u.selected.value" class="text-[12px] text-[var(--exile-color-text-tertiary)]">ユニークを選ぶと取りに行きます。</p>
          <div v-else class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 items-center text-[12px]">
            <label>
              <div>
                {{ u.selected.value.ja }} 未コラプト 1 個 ({{ unit }})
                <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" :disabled="!u.tradeUrl('base')" @click="open(u.tradeUrl('base'))">トレード2へ ↗</button>
              </div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">材料。trade2 の「未コラプト」の最安<span v-if="u.auto.value.uniqueRef != null"> (カレンシーランキングの相場 {{ money(u.auto.value.uniqueRef) }})</span></div>
            </label>
            <span class="tabular-nums text-[13px] text-right" :class="u.basePrice.value == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ u.basePrice.value == null ? (u.pricing.value ? "取得中…" : "—") : money(u.basePrice.value) }}</span>
            <label>
              <div>
                コラプト済み 1 個 = 外れの売値
                <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" :disabled="!u.tradeUrl('floor')" @click="open(u.tradeUrl('floor'))">トレード2へ ↗</button>
              </div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">trade2 の「コラプト済み · 2 重コラプトなし」の最安。変化なし / 値が変わった / 狙い以外の付加 / ソケット はこの値で売る前提</div>
            </label>
            <span class="tabular-nums text-[13px] text-right" :class="u.floorPrice.value == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ u.floorPrice.value == null ? (u.pricing.value ? "取得中…" : "—") : money(u.floorPrice.value) }}</span>
            <template v-for="t in u.targetPrices.value" :key="t.id">
              <label>
                <div>
                  狙いの付加つき: {{ t.label }}
                  <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" :disabled="!u.tradeUrl(`target:${t.id}`)" @click="open(u.tradeUrl(`target:${t.id}`))">トレード2へ ↗</button>
                </div>
                <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">「コラプト済み · 2 重コラプトなし · この付加あり」の最安</div>
              </label>
              <span class="tabular-nums text-[13px] text-right" :class="t.price == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ t.price != null ? money(t.price) : u.get(`target:${t.id}`) ? "出品なし (計算から外す)" : u.pricing.value ? "取得中…" : "—" }}</span>
            </template>
            <label>
              <div>ヴァールオーブ</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">カレンシーランキングの相場</div>
            </label>
            <span class="tabular-nums text-[13px] text-right">{{ money(u.auto.value.vaal) }}</span>
          </div>
        </div>
      </BaseCard>

      <!-- 付加プール -->
      <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">付加プール<span v-if="u.selected.value" class="text-[12px] text-[var(--exile-color-text-secondary)] tracking-normal"> · {{ classJa(u.selected.value.cls) }} {{ u.poolSize.value }} 種</span></h2>
            <span class="text-[11px] text-[var(--exile-color-text-secondary)]">狙いを選ぶ (最大 {{ MAX_TARGETS }}) と売値を取りに行く</span>
          </div>
          <p v-if="!u.selected.value" class="text-[12px] text-[var(--exile-color-text-tertiary)]">ユニークを選ぶと、そのクラスに付き得る付加が出ます。</p>
          <table v-else class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1 w-8">狙う</th>
                <th class="text-left font-normal pb-1">付加</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">確率</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">売値</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in poolRows" :key="m.id" class="border-t border-[var(--exile-color-border-subtle)]" :class="m.on ? 'text-[var(--exile-color-accent-focus)]' : ''">
                <td class="py-1">
                  <input type="checkbox" :checked="m.on" :disabled="!m.on && u.targets.value.length >= MAX_TARGETS" class="accent-[var(--exile-color-accent-focus)]" @change="u.toggleTarget(m.id)" />
                </td>
                <td class="py-1">
                  <div>{{ m.ja }}</div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ m.en }}<span v-if="!m.priceable"> · trade2 で検索できない付加 (相場は取れない)</span></div>
                </td>
                <td class="py-1 pl-2 text-right tabular-nums whitespace-nowrap">{{ pct(u.result.value.pPerTarget) }}</td>
                <td class="py-1 pl-2 text-right tabular-nums whitespace-nowrap">
                  <template v-if="m.on">
                    <span :class="m.price == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ m.price != null ? money(m.price) : m.none ? "出品なし" : u.pricing.value ? "取得中…" : "—" }}</span>
                    <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" :disabled="!m.url" @click="open(m.url)">↗</button>
                  </template>
                  <span v-else class="text-[var(--exile-color-text-tertiary)]">—</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="u.selected.value" class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            確率 = 付加が付く確率 ({{ pct(u.result.value.pEnchant) }}) ÷ プール {{ u.poolSize.value }} 種 (一様と仮定。クライアントの spawn 重みは 0/1 しか無い)。
          </p>
        </div>
      </BaseCard>
    </div>

    <!-- 判定 -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-2">ヴァール 1 回あたり</h2>
        <p v-if="!u.selected.value" class="text-[12px] text-[var(--exile-color-text-tertiary)]">ユニークと狙いの付加を選んでください。</p>
        <p v-else-if="u.targets.value.length === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)]">狙いの付加を 1 つ以上選んでください (付加プールの「狙う」)。</p>
        <template v-else-if="u.result.value.ok">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
            <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
              <div class="text-[var(--exile-color-text-secondary)]">当たり 1 個あたりの実質コスト</div>
              <div class="tabular-nums text-[16px]">{{ money(u.result.value.costPerHit) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">(ユニーク + ヴァール − 外れの回収) ÷ 当たり確率 {{ pct(u.result.value.pHit) }}</div>
            </div>
            <div class="rounded border p-3" :class="(u.result.value.profitPerHit ?? 0) > 0 ? 'border-emerald-500/40' : 'border-[var(--exile-color-border-subtle)]'">
              <div class="text-[var(--exile-color-text-secondary)]">当たり 1 個あたりの利益</div>
              <div class="tabular-nums text-[16px]" :class="evClass(u.result.value.profitPerHit)">{{ money(u.result.value.profitPerHit, true) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">当たりの平均売値 {{ money(u.result.value.avgHitSale) }} − 実質コスト</div>
            </div>
            <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
              <div class="text-[var(--exile-color-text-secondary)]">1 回の期待収支</div>
              <div class="tabular-nums text-[16px]" :class="evClass(u.result.value.ev)">{{ money(u.result.value.ev, true) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">期待売上 {{ money(u.result.value.expectedSale) }} − 費用 {{ money(u.result.value.cost) }}</div>
            </div>
          </div>
          <p class="text-[13px] mt-3" :class="evClass(u.result.value.ev)">
            {{ u.result.value.ev > 0 ? `打つ価値あり: 1 回につき平均 ${money(u.result.value.ev)} の利益` : `打たない方が得: 1 回につき平均 ${money(-u.result.value.ev)} の赤字` }}
          </p>
          <table class="mt-3 text-[12px] w-full max-w-2xl">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">結果</th>
                <th class="text-right font-normal pb-1 pl-2">確率</th>
                <th class="text-right font-normal pb-1 pl-2">売値</th>
                <th class="text-right font-normal pb-1 pl-2">損益</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in u.result.value.outcomes" :key="o.key" class="border-t border-[var(--exile-color-border-subtle)] tabular-nums" :class="o.hit ? 'text-[var(--exile-color-accent-focus)]' : ''">
                <td class="py-1 pr-2">{{ o.label }}</td>
                <td class="py-1 pl-2 text-right">{{ pct(o.p) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(o.sale) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap" :class="evClass(o.sale == null ? null : o.sale - u.result.value.cost)">{{ o.sale == null ? "—" : money(o.sale - u.result.value.cost, true) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] mt-3 max-w-xl">
            <span class="text-[var(--exile-color-text-secondary)]">狙いのどれかが付く確率</span>
            <span class="text-right tabular-nums">{{ pct(u.result.value.pHit) }} (約 1 / {{ u.result.value.pHit > 0 ? (1 / u.result.value.pHit).toFixed(1) : "—" }})</span>
            <span class="text-[var(--exile-color-text-secondary)]">1 回の確定費用 (ユニーク + ヴァール)</span>
            <span class="text-right tabular-nums">{{ money(u.result.value.cost) }}</span>
            <span class="text-[var(--exile-color-text-secondary)]">95% で 1 個は当たる資金 (試行数)</span>
            <span class="text-right tabular-nums">{{ u.result.value.bankroll95 ? `${money(u.result.value.bankroll95.cost)} (${u.result.value.bankroll95.attempts} 回)` : "—" }}</span>
            <span class="text-[var(--exile-color-text-secondary)]">99% で 1 個は当たる資金 (試行数)</span>
            <span class="text-right tabular-nums">{{ u.result.value.bankroll99 ? `${money(u.result.value.bankroll99.cost)} (${u.result.value.bankroll99.attempts} 回)` : "—" }}</span>
          </div>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            資金は「少なくとも 1 個当たるまでに要る手持ち (外れの売却前)」で、期待総費用ではありません。
          </p>

          <div class="mt-3 rounded border border-[var(--exile-color-border-subtle)] p-3 text-[12px]">
            <div class="flex items-baseline justify-between mb-1 gap-2 flex-wrap">
              <span class="font-display tracking-[0.04em]">{{ attempts }} 回やった場合</span>
              <label class="text-[11px] text-[var(--exile-color-text-secondary)] inline-flex items-center gap-2">
                回数
                <select v-model.number="attempts" class="num text-left w-20">
                  <option v-for="n in ATTEMPT_OPTIONS" :key="n" :value="n">{{ n }} 回</option>
                </select>
              </label>
            </div>
            <table class="w-full text-[12px] mb-2">
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
                  <td class="py-1 pr-2">
                    <div>{{ m.label }}</div>
                    <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ m.note }}</div>
                  </td>
                  <td class="py-1 pl-2 text-right tabular-nums whitespace-nowrap">{{ money(m.unit) }}</td>
                  <td class="py-1 pl-2 text-right tabular-nums">{{ m.perAttempt }}</td>
                  <td class="py-1 pl-2 text-right tabular-nums whitespace-nowrap">{{ money(m.costPerAttempt) }}</td>
                  <td class="py-1 pl-2 text-right tabular-nums">{{ m.qtyN }}</td>
                  <td class="py-1 pl-2 text-right tabular-nums whitespace-nowrap">{{ money(m.costN) }}</td>
                </tr>
              </tbody>
            </table>
            <div class="grid grid-cols-2 gap-x-6 gap-y-1 max-w-xl">
              <span class="text-[var(--exile-color-text-secondary)]">1 個以上当たる確率</span>
              <span class="text-right tabular-nums">{{ pct(atN.pAny) }}</span>
              <span class="text-[var(--exile-color-text-secondary)]">当たりの期待数</span>
              <span class="text-right tabular-nums">{{ atN.expected.toFixed(2) }} 個</span>
              <span class="text-[var(--exile-color-text-secondary)]">総費用 (ユニーク + ヴァール) × {{ attempts }}</span>
              <span class="text-right tabular-nums">{{ money(atN.cost) }}</span>
              <span class="text-[var(--exile-color-text-secondary)]">期待売上 (当たり + 外れの売却)</span>
              <span class="text-right tabular-nums">{{ money(atN.revenue) }}</span>
              <span class="text-[var(--exile-color-text-secondary)]">期待損益</span>
              <span class="text-right tabular-nums" :class="evClass(atN.profit)">{{ atN.profit == null ? "—" : money(atN.profit, true) }}</span>
            </div>
          </div>
        </template>
        <p v-else class="text-[12px] text-[var(--exile-color-text-tertiary)]">不足: {{ u.result.value.missing.join("、") || "計算できません" }}</p>
      </div>
    </BaseCard>

    <!-- アーキテクトオーブ (2 重コラプト) -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">アーキテクトオーブ (2 重コラプト)</h2>
          <span class="text-[11px] text-[var(--exile-color-text-secondary)]">当たった品にさらに打つか。生存 {{ pct(u.params.value.architectSurvive) }} で 2 個目の付加、残りは破壊</span>
        </div>
        <p v-if="u.targets.value.length === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)]">上で狙いの付加を選ぶと、その品を「1 個目」にして 2 個目を賭ける計算ができます。</p>
        <template v-else>
          <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 items-center text-[12px] mb-3">
            <label>1 個目 (いま持っている付加)</label>
            <select v-model="u.firstEnchant.value" class="num text-left w-full max-w-md">
              <option :value="null">選ばない</option>
              <option v-for="t in u.targetPrices.value" :key="t.id" :value="t.id">{{ t.label }} ({{ money(t.price) }})</option>
            </select>
          </div>
          <div v-if="u.firstEnchant.value" class="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div>
              <div class="text-[11px] text-[var(--exile-color-text-secondary)] mb-1">2 個目の狙い (最大 {{ MAX_SECOND_TARGETS }}、1 個目と別グループの {{ u.secondPool.value.length }} 種から一様)</div>
              <table class="w-full text-[12px]">
                <tbody>
                  <tr v-for="m in secondRows" :key="m.id" class="border-t border-[var(--exile-color-border-subtle)]" :class="m.on ? 'text-[var(--exile-color-accent-focus)]' : ''">
                    <td class="py-1 w-8"><input type="checkbox" :checked="m.on" :disabled="!m.on && u.secondTargets.value.length >= MAX_SECOND_TARGETS" class="accent-[var(--exile-color-accent-focus)]" @change="u.toggleSecond(m.id)" /></td>
                    <td class="py-1">
                      <div>{{ m.ja }}</div>
                      <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ m.en }}</div>
                    </td>
                    <td class="py-1 pl-2 text-right tabular-nums whitespace-nowrap">{{ pct(u.architect.value.pPerTarget) }}</td>
                    <td class="py-1 pl-2 text-right tabular-nums whitespace-nowrap">
                      <template v-if="m.on">
                        <span :class="m.price == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ m.price != null ? money(m.price) : m.none ? "出品なし" : u.pricing.value ? "取得中…" : "—" }}</span>
                        <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" :disabled="!m.url" @click="open(m.url)">↗</button>
                      </template>
                      <span v-else class="text-[var(--exile-color-text-tertiary)]">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="text-[12px]">
              <div class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 items-center">
                <label>
                  <div>いまの品の価値 (1 個目の付加つきの売値)</div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">これを賭ける</div>
                </label>
                <span class="tabular-nums text-right">{{ money(u.firstValue.value) }}</span>
                <label>
                  <div>アーキテクトオーブ</div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">カレンシーランキングの相場</div>
                </label>
                <span class="tabular-nums text-right">{{ money(u.auto.value.architect) }}</span>
                <label>
                  <div>
                    2 重コラプト品の最安 (狙い以外の売値)
                    <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" :disabled="!u.tradeUrl('twice-floor')" @click="open(u.tradeUrl('twice-floor'))">トレード2へ ↗</button>
                  </div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">「2 重コラプト · 1 個目の付加あり」の最安</div>
                </label>
                <span class="tabular-nums text-right" :class="u.twiceFloorPrice.value == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ u.twiceFloorPrice.value == null ? (u.pricing.value ? "取得中…" : "—") : money(u.twiceFloorPrice.value) }}</span>
              </div>
              <template v-if="u.architect.value.ok">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
                    <div class="text-[var(--exile-color-text-secondary)]">1 回の期待収支</div>
                    <div class="tabular-nums text-[16px]" :class="evClass(u.architect.value.ev)">{{ money(u.architect.value.ev, true) }}</div>
                    <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">期待売値 {{ money(u.architect.value.expectedSale) }} − (品の価値 + オーブ {{ money(u.architect.value.cost) }})</div>
                  </div>
                  <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
                    <div class="text-[var(--exile-color-text-secondary)]">2 個目の当たり 1 個あたりの実質コスト</div>
                    <div class="tabular-nums text-[16px]">{{ money(u.architect.value.costPerHit) }}</div>
                    <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">当たり確率 {{ pct(u.architect.value.pHit) }} · 平均売値 {{ money(u.architect.value.avgHitSale) }}</div>
                  </div>
                </div>
                <p class="text-[13px] mt-2" :class="evClass(u.architect.value.ev)">
                  {{ u.architect.value.ev > 0 ? `打つ価値あり: 平均 ${money(u.architect.value.ev)} の上乗せ` : `そのまま売った方が得: 打つと平均 ${money(-u.architect.value.ev)} の損` }}
                </p>
                <table class="mt-2 text-[12px] w-full">
                  <tbody>
                    <tr v-for="o in u.architect.value.outcomes" :key="o.key" class="border-t border-[var(--exile-color-border-subtle)] tabular-nums" :class="o.hit ? 'text-[var(--exile-color-accent-focus)]' : ''">
                      <td class="py-1 pr-2">{{ o.label }}</td>
                      <td class="py-1 pl-2 text-right">{{ pct(o.p) }}</td>
                      <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(o.sale) }}</td>
                    </tr>
                  </tbody>
                </table>
              </template>
              <p v-else class="text-[12px] text-[var(--exile-color-text-tertiary)] mt-3">不足: {{ u.architect.value.missing.join("、") }}<span v-if="u.secondTargets.value.length === 0">。2 個目の狙いも選んでください</span></p>
            </div>
          </div>
        </template>
      </div>
    </BaseCard>

    <!-- 収支 (実績入力) -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">
            収支<span v-if="u.selected.value" class="text-[12px] text-[var(--exile-color-text-secondary)] tracking-normal"> · {{ u.selected.value.ja }}</span>
          </h2>
          <div class="flex items-center gap-3 text-[11px] text-[var(--exile-color-text-secondary)]">
            <span>実際に使った数と売れた数を入れる。単価は上の相場、売値は相場か実売</span>
            <button type="button" class="underline hover:text-[var(--exile-color-accent-focus)] disabled:opacity-40" :disabled="!u.selected.value" @click="resetLedger">全部 0 に</button>
          </div>
        </div>
        <p v-if="!u.selected.value" class="text-[12px] text-[var(--exile-color-text-tertiary)]">ユニークを選ぶと、そのユニークの帳簿が出ます。</p>
        <template v-else>
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">素材</th>
                <th class="text-right font-normal pb-1 pl-3">単価</th>
                <th class="text-right font-normal pb-1 pl-3">使った数</th>
                <th class="text-right font-normal pb-1 pl-3">費用</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in ledgerRows" :key="r.key" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">{{ r.label }}</td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap" :class="r.unit == null ? 'text-amber-300' : ''">{{ r.unit == null ? "相場なし" : money(r.unit) }}</td>
                <td class="py-1.5 pl-3 text-right"><input :value="r.qty || ''" type="number" min="0" step="1" placeholder="0" class="num w-24" @input="ledgerNum(r.key, $event)" /></td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.cost) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)]">
                <td class="py-1.5 pr-2 font-display tracking-[0.04em]">費用合計</td>
                <td></td>
                <td class="py-1.5 pl-3 text-right tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">{{ ledgerTotals.rate != null ? `実測の当たり率 ${pct(ledgerTotals.rate)}` : "" }}</td>
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
                <td class="py-1.5 pl-3 text-right"><input :value="r.qty || ''" type="number" min="0" step="1" placeholder="0" class="num w-24" @input="ledgerNum(r.qtyKey, $event)" /></td>
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
                <td></td>
                <td class="py-1.5 pl-3 text-right tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">{{ ledgerTotals.perVaal != null ? `ヴァール 1 回あたり ${money(ledgerTotals.perVaal, true)}` : "" }}</td>
                <td class="py-1.5 pl-3 text-right tabular-nums text-[14px] whitespace-nowrap" :class="evClass(ledgerTotals.profit)">{{ money(ledgerTotals.profit, true) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            売値の欄は空欄なら上の相場 (狙いは平均売値、外れはコラプト済みの最安)、実際に売れた額があればそれを入れてください。入力はユニークごとにこの PC に残ります。
            <span v-if="ledgerTotals.missingCost" class="text-amber-300">相場が取れていない素材があるため費用が不完全です。</span>
            <span v-if="ledgerTotals.missingSale" class="text-amber-300">売値が無い行があるため売上が不完全です。</span>
          </p>
        </template>
      </div>
    </BaseCard>

    <!-- 前提 -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <button type="button" class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-center gap-2" @click="showAssumptions = !showAssumptions">
          <span>{{ showAssumptions ? "▲" : "▼" }}</span>
          <span>前提 (確率は非公開のためコミュニティの仮定。ここで変えられます)</span>
        </button>
        <div v-if="showAssumptions" class="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4 text-[12px]">
          <div class="space-y-2">
            <div class="text-[11px] text-[var(--exile-color-text-secondary)]">ヴァールオーブ (ユニーク装備に 1 回)。4 系統の重み (比率で使う)。Maxroll / U4N: 等確率 25% ずつ</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
              <label>変化なし (コラプト済みになるだけ)</label><input v-model.number="u.params.value.weights.none" type="number" min="0" step="0.05" class="num" />
              <label>各 MOD の値 ×0.78〜1.22</label><input v-model.number="u.params.value.weights.values" type="number" min="0" step="0.05" class="num" />
              <label>コラプト付加を 1 つ追加</label><input v-model.number="u.params.value.weights.enchant" type="number" min="0" step="0.05" class="num" />
              <label>ソケット +1 / 品質 (装飾品は何もなし)</label><input v-model.number="u.params.value.weights.fourth" type="number" min="0" step="0.05" class="num" />
            </div>
            <div class="text-[11px] text-[var(--exile-color-text-secondary)] pt-2">アーキテクトオーブ</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
              <label>壊れずに 2 個目が付く確率</label><input v-model.number="u.params.value.architectSurvive" type="number" min="0" max="1" step="0.05" class="num" />
            </div>
            <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="u.resetParams">既定に戻す</button>
          </div>
          <div class="text-[11px] text-[var(--exile-color-text-secondary)] leading-relaxed space-y-1">
            <p>付加の中身: そのクラスに付き得る付加 (ゲームクライアントの Mods、GenerationType=corrupted) から一様。クライアントの重みは 0/1 しか無いので、実際の偏りは不明。</p>
            <p>装飾品 (指輪 · アミュレット · ベルト) とジュエルは 4 つ目の系統が「何もなし」なので、変化なしが 50% になる。ワンド · 杖はソケットの代わりに品質が上がる。矢筒 · 王笏 · タリスマンの 4 つ目は資料が無く「何もなし」扱い。</p>
            <p>「値が変わる」「ソケット」「狙い以外の付加」で出来た物は、コラプト済みの最安で売る前提 (高ロールで高く売れる分は見ていない、控えめ)。</p>
            <p>アーキテクトオーブ: コラプト済みの品に打つと 50% で 2 個目の付加 (既にある付加と別グループ)、50% で破壊 (アイテム文言 / Maxroll / timesaver、2026-09)。2 個目のプールは 1 個目のグループを除いた数で割る。</p>
            <p>trade2 の検索: 未コラプト / コラプト済み (2 重なし) / 狙い付加あり / 2 重コラプト (1 個目あり) / 2 重 + 2 個目あり。ヴァール付加は trade2 では enchant として載る (JP 実測)。</p>
          </div>
        </div>
      </div>
    </BaseCard>

    <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">
      付加プール: ゲームクライアント (Mods / BaseItemTypes / ItemClasses) · ユニーク一覧: trade2 data/items · 素材価格: カレンシーランキングの相場 (poe2scout 由来) · 売値: trade2 (JP API、検索は 10 秒間隔)
    </p>
  </section>
</template>

<style scoped>
.num {
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
