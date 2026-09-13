<!--
  RareCraft.vue — レアクラフトの賭け (2026-09-14、「ヴァールの天秤」の 1 つ。旧「ES 兜のクラフト」を一般化)
  マジックベース (MOD 1 つ) → グレーターエッセンス → 肋骨で冒涜 → 高貴なオーブで空きを埋める、の収支。
  当たり方は poe2db の推定重み × クライアントのティア値でシミュレーションし、trade2 の「売値の段」で期待収支を出す。
    views/rare-craft/sim.ts          シミュレーター + 売値の段 (純粋関数)
    views/rare-craft/recipes.ts      レシピ (ES 兜 / ライフ耐性手袋 / 移動速度靴) と素材
    views/rare-craft/useRareCraft.ts 状態 / 相場 / trade2
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { openExternal } from "../services/trade2/open-external";
import { refetchState } from "../services/trade2/auto-price";
import BaseCard from "../components/decor/BaseCard.vue";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import MoneyInput from "../components/vaal-scales/MoneyInput.vue";
import { displayCurrency } from "../state/display-currency";
import { useRareCraft } from "./rare-craft/useRareCraft";
import { METRIC_LABEL, METRIC_UNIT, type Metric } from "./rare-craft/sim";
import { bucketLabel } from "./rare-craft/recipes";
const money = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed });
const unit = displayCurrency.label;

async function open(url: string | null): Promise<void> {
  await openExternal(url);
}

const c = useRareCraft();
onMounted(() => {
  void c.loadMarket();
});
const showAssumptions = ref(false);
const showAllVariants = ref(false);

function pct(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const v = p * 100;
  return `${v.toFixed(v >= 10 ? 1 : 2)}%`;
}
function evClass(v: number | null | undefined): string {
  if (v == null) return "text-[var(--exile-color-text-tertiary)]";
  return v > 0 ? "text-emerald-300" : v < 0 ? "text-red-300" : "";
}
const condKeys = (conds: Partial<Record<Metric, number>>): Metric[] => Object.keys(conds) as Metric[];
const bucketKind = (key: string): `b:${string}` => `b:${key}`;
const refetch = computed(() => refetchState(c.pricing.value, "trade2 で取り直す", `trade2 で検索中… (残り ${c.remaining.value} 件、1 件 約 10 秒)`));

/** 相場カードの行 */
const priceRows = computed(() => {
  const t = c.currentTier.value;
  const rows: { kind: "base" | "floor" | `b:${string}`; label: string; note: string }[] = [
    {
      kind: "base",
      label: "ベース (マジック)",
      note: `${c.page.value.label} · ilvl ${c.ilvl.value}+ · ${c.recipe.value.baseMod.label} ${t ? `${t.min}〜${t.max} (T${t.tier})` : "—"} · ソケット ${c.sockets.value}+`,
    },
    ...c.buckets.value.map((b) => ({ kind: bucketKind(b.key), label: `売値の段: ${bucketLabel(b.conds)}`, note: `レア · 未コラプト · ソケット ${c.sockets.value}+` })),
    { kind: "floor", label: `外れ: ${bucketLabel(c.floorConds.value)}`, note: "どの段にも届かなかった物をこの値で売る" },
  ];
  return rows.map((r) => {
    const f = c.get(r.kind);
    return { ...r, value: f?.price ?? null, text: f ? (f.price != null ? money(f.price) : "出品なし") : c.pricing.value ? "取得中…" : "—" };
  });
});

/** 「N 回やった場合」 */
const ATTEMPT_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const attempts = ref(10);
const atN = computed(() => {
  const r = c.result.value;
  const top = c.topRow.value;
  const n = attempts.value;
  if (!r || c.cost.value == null) return null;
  return {
    cost: n * c.cost.value,
    revenue: n * r.expectedSale,
    profit: n * r.ev,
    topLabel: top?.label ?? null,
    topExpected: top ? n * top.pSold : 0,
    pTopAny: top ? 1 - Math.pow(1 - top.pSold, n) : 0,
  };
});
const materialTable = computed(() => {
  const n = attempts.value;
  const rows = [
    { key: "base", label: "ベース (マジック)", note: "1 回に 1 個。外れても品物は残る (外れの売値で売る)", unit: c.basePrice.value, qty: 1 },
    ...c.materials.value.map((m) => ({ key: m.key, label: m.label, note: m.note, unit: m.unit, qty: m.qty })),
  ];
  return rows.map((r) => ({ ...r, costPerAttempt: r.unit == null ? null : r.unit * r.qty, qtyN: r.qty * n, costN: r.unit == null ? null : r.unit * r.qty * n }));
});
const variantRows = computed(() => (showAllVariants.value ? c.variants.value : c.variants.value.slice(0, 12)));

/** 収支 (実績入力、レシピごとに保存) */
const LEDGER_KEY = "exiledesk.rare-craft.ledger";
interface Ledger {
  counts: Record<string, number>;
  sold: Record<string, number>;
  each: Record<string, number | null>;
}
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
const ledger = computed<Ledger>(() => {
  const l = book.value[c.recipeId.value] ?? {};
  return { counts: { ...(l.counts ?? {}) }, sold: { ...(l.sold ?? {}) }, each: { ...(l.each ?? {}) } };
});
function saveLedger(next: Ledger): void {
  book.value = { ...book.value, [c.recipeId.value]: next };
}
function setCount(key: string, ev: Event): void {
  const v = Number((ev.target as HTMLInputElement).value);
  const l = ledger.value;
  saveLedger({ ...l, counts: { ...l.counts, [key]: Number.isFinite(v) && v > 0 ? v : 0 } });
}
function setSold(key: string, ev: Event): void {
  const v = Number((ev.target as HTMLInputElement).value);
  const l = ledger.value;
  saveLedger({ ...l, sold: { ...l.sold, [key]: Number.isFinite(v) && v > 0 ? v : 0 } });
}
function setEach(key: string, v: number | null): void {
  const l = ledger.value;
  saveLedger({ ...l, each: { ...l.each, [key]: v } });
}
function resetLedger(): void {
  const next = { ...book.value };
  delete next[c.recipeId.value];
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
  const rows = [
    { key: "base", label: "ベース (マジック)", unit: c.basePrice.value },
    ...c.materials.value.map((m) => ({ key: m.apiId, label: m.label, unit: m.unit })),
  ];
  return rows.map((r) => {
    const qty = l.counts[r.key] ?? 0;
    return { ...r, qty, cost: r.unit == null ? null : r.unit * qty };
  });
});
const ledgerSales = computed(() => {
  const l = ledger.value;
  const rows = [
    ...c.ladderBuckets.value.map((b) => ({ key: b.key, label: b.label, market: b.price })),
    { key: "floor", label: `外れ (${bucketLabel(c.floorConds.value)})`, market: c.floorPrice.value },
  ];
  return rows.map((r) => {
    const qty = l.sold[r.key] ?? 0;
    const each = l.each[r.key] ?? null;
    const price = each ?? r.market;
    return { ...r, qty, each, revenue: price == null ? (qty > 0 ? null : 0) : price * qty };
  });
});
const ledgerTotals = computed(() => {
  const cost = ledgerRows.value.reduce((s, r) => s + (r.cost ?? 0), 0);
  const revenue = ledgerSales.value.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const bases = ledger.value.counts.base ?? 0;
  return {
    cost,
    revenue,
    profit: revenue - cost,
    perAttempt: bases > 0 ? (revenue - cost) / bases : null,
    missingCost: ledgerRows.value.some((r) => r.qty > 0 && r.cost == null),
    missingSale: ledgerSales.value.some((r) => r.qty > 0 && r.revenue == null),
  };
});
</script>

<template>
  <section class="min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-3">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">レアクラフトの賭け</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        マジックベース (MOD 1 つ) → グレーターエッセンス → 肋骨で冒涜 → 高貴なオーブで空きを埋める、の収支。
        どこまで伸びるかは poe2db の推定重み × クライアントのティア値で 2 万回試し、trade2 の「売値の段」で売った時の期待収支を出します。
      </p>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
        素材価格: カレンシーランキングの相場{{ c.league.value ? ` (${c.league.value.Value})` : "" }} · {{ c.marketLabel.value }} / ベースと売値: trade2 最安 (自動) / 重み: poe2db の推定 (PoE1 由来、冒涜は一様)
        <span v-if="c.marketError.value" class="text-amber-300">— poe2scout 取得失敗: {{ c.marketError.value }}</span>
        <span v-if="c.priceError.value" class="text-amber-300">— trade2: {{ c.priceError.value }}</span>
      </p>
      <div class="mt-1 flex items-center gap-4 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
        <CurrencyPicker />
        <label class="inline-flex items-center gap-2">
          レシピ
          <select v-model="c.recipeId.value" class="num text-left w-40">
            <option v-for="r in c.RECIPES" :key="r.id" :value="r.id">{{ r.label }}</option>
          </select>
        </label>
        <label v-if="c.recipe.value.pages.length > 1" class="inline-flex items-center gap-2">
          防御タイプ
          <select v-model="c.pageId.value" class="num text-left w-64">
            <option v-for="p in c.recipe.value.pages" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </label>
        <label class="inline-flex items-center gap-2">
          ソケット
          <select v-model.number="c.sockets.value" class="num text-left w-20">
            <option :value="1">1</option>
            <option :value="2">2</option>
          </select>
        </label>
      </div>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-1">{{ c.recipe.value.note }}</p>
    </header>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
      <!-- 相場 (trade2 自動) -->
      <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">相場 (trade2 から自動)</h2>
            <button
              type="button"
              :disabled="refetch.disabled"
              class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[11px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors tabular-nums"
              @click="c.fetchPrices(true)"
            >
              <span aria-hidden="true">⟳</span>
              {{ refetch.label }}
            </button>
          </div>
          <div class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 items-center text-[12px]">
            <template v-for="r in priceRows" :key="r.kind">
              <label>
                <div>
                  {{ r.label }} ({{ unit }})
                  <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" :disabled="!c.tradeUrl(r.kind)" @click="open(c.tradeUrl(r.kind))">トレード2へ ↗</button>
                </div>
                <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ r.note }}</div>
              </label>
              <span class="tabular-nums text-[13px] text-right" :class="r.value == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ r.text }}</span>
            </template>
          </div>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-3">
            売値はどれも「インスタントバイアウト」の最安。1 回ぶんの結果は、満たす段のうち一番高い売値で売る前提です。段の条件は前提欄で変えられます (変えるとその分だけ取り直す)。
          </p>
        </div>
      </BaseCard>

      <!-- 素材 -->
      <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">素材 ({{ unit }})</h2>
            <label class="text-[11px] text-[var(--exile-color-text-secondary)] inline-flex items-center gap-2">
              回数
              <select v-model.number="attempts" class="num text-left w-20">
                <option v-for="n in ATTEMPT_OPTIONS" :key="n" :value="n">{{ n }} 回</option>
              </select>
            </label>
          </div>
          <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center text-[11px] text-[var(--exile-color-text-secondary)] mb-3">
            <label>ベースの MOD</label>
            <select v-model.number="c.baseTier.value" class="num text-left w-full">
              <option v-for="t in c.tiers.value" :key="t.tier" :value="t.tier">{{ c.recipe.value.baseMod.label }} {{ t.min }}〜{{ t.max }} (T{{ t.tier }} · MOD レベル {{ t.level }})</option>
            </select>
            <label>エッセンス</label>
            <select v-model="c.essenceId.value" class="num text-left w-full">
              <option v-for="e in c.essences.value" :key="e.id" :value="e.id" :disabled="!e.ok">{{ e.label }}{{ e.range ? ` ${e.range.min}〜${e.range.max}` : "" }}{{ e.ok ? "" : ` (${e.reason})` }}</option>
            </select>
            <label>肋骨</label>
            <select v-model="c.rib.value" class="num text-left w-full">
              <option v-for="o in c.RIBS" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
            <label>高貴なオーブ</label>
            <select v-model="c.exalt.value" class="num text-left w-full">
              <option v-for="o in c.EXALTS" :key="o.id" :value="o.id">{{ o.label }} ({{ o.note }})</option>
            </select>
            <label>足す数</label>
            <div class="flex items-center gap-2">
              <select v-model.number="c.exaltCount.value" class="num text-left w-20">
                <option v-for="n in c.EXALT_COUNTS" :key="n" :value="n">{{ n }} 個</option>
              </select>
              <span v-if="c.effectiveCount.value < c.exaltCount.value" class="text-amber-300">空きが足りないので {{ c.effectiveCount.value }} 個</span>
            </div>
            <label>お告げ</label>
            <select v-model="c.side.value" class="num text-left w-full">
              <option v-for="o in c.SIDES" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
            <label>ルーン</label>
            <select v-model="c.runeId.value" class="num text-left w-full">
              <option v-for="o in c.recipe.value.runes" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
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
              <tr v-for="m in materialTable" :key="m.key" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>{{ m.label }}</div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ m.note }}</div>
                </td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap" :class="m.unit == null ? 'text-amber-300' : ''">{{ m.unit == null ? "相場なし" : money(m.unit) }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums">{{ m.qty }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ money(m.costPerAttempt) }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums">{{ m.qtyN }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ money(m.costN) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)] font-display tracking-[0.04em]">
                <td class="py-1.5 pr-2">合計</td>
                <td></td>
                <td></td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ money(c.cost.value) }}</td>
                <td></td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ c.cost.value == null ? "—" : money(c.cost.value * attempts) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </BaseCard>
    </div>

    <!-- 1 回あたり -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-2">1 回あたり</h2>
        <p v-if="!c.sim.value.ok" class="text-[12px] text-amber-300">計算できません: {{ c.sim.value.reason }}</p>
        <p v-else-if="!c.result.value" class="text-[12px] text-[var(--exile-color-text-tertiary)]">不足: {{ c.missing.value.join("、") || "相場を取得中" }}</p>
        <template v-else>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
              <div class="text-[var(--exile-color-text-secondary)]">1 回の費用</div>
              <div class="tabular-nums text-[16px]">{{ money(c.cost.value) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">ベース + 素材</div>
            </div>
            <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
              <div class="text-[var(--exile-color-text-secondary)]">期待売上</div>
              <div class="tabular-nums text-[16px]">{{ money(c.result.value.expectedSale) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">結果ごとの売値の平均</div>
            </div>
            <div class="rounded border p-3" :class="c.result.value.ev > 0 ? 'border-emerald-500/40' : 'border-[var(--exile-color-border-subtle)]'">
              <div class="text-[var(--exile-color-text-secondary)]">期待収支</div>
              <div class="tabular-nums text-[16px]" :class="evClass(c.result.value.ev)">{{ money(c.result.value.ev, true) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">期待売上 − 費用</div>
            </div>
            <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
              <div class="text-[var(--exile-color-text-secondary)]">黒字になる確率</div>
              <div class="tabular-nums text-[16px]">{{ pct(c.result.value.pProfit) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">売値が費用以上になる 1 回の割合</div>
            </div>
          </div>
          <p class="text-[13px] mt-3" :class="evClass(c.result.value.ev)">
            {{ c.result.value.ev > 0 ? `作る価値あり: 1 回につき平均 ${money(c.result.value.ev)} の利益` : `作らない方が得: 1 回につき平均 ${money(-c.result.value.ev)} の赤字` }}
          </p>

          <table class="mt-3 text-[12px] w-full max-w-4xl">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">売値の段</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">条件を満たす確率</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">この段で売る確率</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">売値</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">期待売上への寄与</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in c.result.value.rows" :key="r.key" class="border-t border-[var(--exile-color-border-subtle)] tabular-nums">
                <td class="py-1 pr-2">{{ r.label }}</td>
                <td class="py-1 pl-2 text-right">{{ pct(r.pReach) }}</td>
                <td class="py-1 pl-2 text-right">{{ pct(r.pSold) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ r.price == null ? "出品なし" : money(r.price) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(r.contribution) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)] tabular-nums">
                <td class="py-1 pr-2">外れ ({{ bucketLabel(c.floorConds.value) }} の最安で売る)</td>
                <td></td>
                <td class="py-1 pl-2 text-right">{{ pct(c.result.value.floor.pSold) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(c.result.value.floor.price) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(c.result.value.floor.contribution) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-[var(--exile-color-text-secondary)]">
            <span v-for="m in c.recipe.value.metrics" :key="m">{{ METRIC_LABEL[m] }} の平均 <span class="tabular-nums text-[var(--exile-color-text-primary)]">{{ Math.round(c.result.value.means[m]) }}{{ METRIC_UNIT[m] }}</span></span>
            <span>冒涜のあとの空き: 接頭辞 {{ c.slots.value.prefixOpen }} / 接尾辞 {{ c.slots.value.suffixOpen }}</span>
          </div>

          <div class="mt-3 rounded border border-[var(--exile-color-border-subtle)] p-3 text-[12px] max-w-3xl">
            <div class="flex items-baseline justify-between mb-1 gap-2 flex-wrap">
              <span class="font-display tracking-[0.04em]">{{ attempts }} 回やった場合</span>
              <label class="text-[11px] text-[var(--exile-color-text-secondary)] inline-flex items-center gap-2">
                回数
                <select v-model.number="attempts" class="num text-left w-20">
                  <option v-for="n in ATTEMPT_OPTIONS" :key="n" :value="n">{{ n }} 回</option>
                </select>
              </label>
            </div>
            <div v-if="atN" class="grid grid-cols-2 gap-x-6 gap-y-1">
              <span class="text-[var(--exile-color-text-secondary)]">総費用</span>
              <span class="text-right tabular-nums">{{ money(atN.cost) }}</span>
              <span class="text-[var(--exile-color-text-secondary)]">期待売上</span>
              <span class="text-right tabular-nums">{{ money(atN.revenue) }}</span>
              <span class="text-[var(--exile-color-text-secondary)]">期待損益</span>
              <span class="text-right tabular-nums" :class="evClass(atN.profit)">{{ money(atN.profit, true) }}</span>
              <template v-if="atN.topLabel">
                <span class="text-[var(--exile-color-text-secondary)]">一番高い段 ({{ atN.topLabel }}) が 1 個以上出る確率</span>
                <span class="text-right tabular-nums">{{ pct(atN.pTopAny) }} (期待 {{ atN.topExpected.toFixed(2) }} 個)</span>
              </template>
            </div>
          </div>
        </template>
      </div>
    </BaseCard>

    <!-- 選択肢の比較 -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">選択肢の比較 (高貴なオーブ × 足す数 × お告げ × ルーン)</h2>
          <span class="text-[11px] text-[var(--exile-color-text-secondary)]">期待収支の高い順。ベース / エッセンス / 肋骨 は上の選択のまま</span>
        </div>
        <p v-if="c.variants.value.length === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)]">相場が揃うと出ます (不足: {{ c.missing.value.join("、") || "取得中" }})</p>
        <template v-else>
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">高貴なオーブ</th>
                <th class="text-right font-normal pb-1 pl-2">数</th>
                <th class="text-left font-normal pb-1 pl-2">お告げ</th>
                <th class="text-left font-normal pb-1 pl-2">ルーン</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">1 回の費用</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">期待売上</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">期待収支</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">黒字の確率</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">一番高い段</th>
                <th class="pb-1"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(v, i) in variantRows"
                :key="v.key"
                class="border-t border-[var(--exile-color-border-subtle)] tabular-nums"
                :class="[v.current ? 'text-[var(--exile-color-accent-focus)]' : '', i === 0 ? 'bg-emerald-500/10' : '']"
              >
                <td class="py-1 pr-2 whitespace-nowrap">{{ v.labels.exalt }}</td>
                <td class="py-1 pl-2 text-right">{{ v.count }}</td>
                <td class="py-1 pl-2 whitespace-nowrap">{{ v.labels.side }}</td>
                <td class="py-1 pl-2 whitespace-nowrap">{{ v.labels.rune }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(v.cost) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(v.expectedSale) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap" :class="evClass(v.ev)">{{ money(v.ev, true) }}</td>
                <td class="py-1 pl-2 text-right">{{ pct(v.pProfit) }}</td>
                <td class="py-1 pl-2 text-right">{{ pct(v.pTop) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">
                  <span v-if="i === 0" class="text-[10px] px-1 rounded bg-emerald-500/20 text-emerald-300">最も得</span>
                  <button v-if="!v.current" type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" @click="c.selectVariant(v.key)">これにする</button>
                  <span v-else class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)]">選択中</span>
                </td>
              </tr>
            </tbody>
          </table>
          <button v-if="c.variants.value.length > 12" type="button" class="mt-2 text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="showAllVariants = !showAllVariants">
            {{ showAllVariants ? "▲ 上位 12 件だけ" : `▼ 全 ${c.variants.value.length} 件を見る` }}
          </button>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            <template v-if="c.ribSame.value">古代の肋骨: この装備の冒涜の候補は全部 MOD レベル 40 以上なので、保存された肋骨と当たり方は同じ。費用だけ {{ c.ribCostDiff.value == null ? "" : money(c.ribCostDiff.value) }} 高くなります。</template>
            右側の高貴なお告げは接尾辞 (耐性) にだけ付けるので、空きの数によっては足せる数が減ります。一番高い段 = 取れた売値が一番高い段で売る確率。
          </p>
        </template>
      </div>
    </BaseCard>

    <!-- 収支 (実績入力) -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">収支<span class="text-[12px] text-[var(--exile-color-text-secondary)] tracking-normal"> · {{ c.recipe.value.label }}</span></h2>
          <div class="flex items-center gap-3 text-[11px] text-[var(--exile-color-text-secondary)]">
            <span>実際に使った数と売れた数を入れる。単価は上の相場、売値は相場か実売</span>
            <button type="button" class="underline hover:text-[var(--exile-color-accent-focus)]" @click="resetLedger">全部 0 に</button>
          </div>
        </div>
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
              <td class="py-1.5 pl-3 text-right"><input :value="r.qty || ''" type="number" min="0" step="1" placeholder="0" class="num w-24" @input="setCount(r.key, $event)" /></td>
              <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.cost) }}</td>
            </tr>
            <tr class="border-t border-[var(--exile-color-border-brass)]">
              <td class="py-1.5 pr-2 font-display tracking-[0.04em]">費用合計</td>
              <td></td>
              <td></td>
              <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(ledgerTotals.cost) }}</td>
            </tr>
          </tbody>
          <tbody class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
            <tr>
              <th class="text-left font-normal pt-3 pb-1">売れた物</th>
              <th class="text-right font-normal pt-3 pb-1 pl-3">1 個の売値 (空欄なら相場)</th>
              <th class="text-right font-normal pt-3 pb-1 pl-3">売れた数</th>
              <th class="text-right font-normal pt-3 pb-1 pl-3">売上</th>
            </tr>
          </tbody>
          <tbody>
            <tr v-for="r in ledgerSales" :key="r.key" class="border-t border-[var(--exile-color-border-subtle)]">
              <td class="py-1.5 pr-2">{{ r.label }}</td>
              <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">
                <MoneyInput :model-value="r.each" :placeholder-exalted="r.market" width="w-24" @update:model-value="setEach(r.key, $event)" />
              </td>
              <td class="py-1.5 pl-3 text-right"><input :value="r.qty || ''" type="number" min="0" step="1" placeholder="0" class="num w-24" @input="setSold(r.key, $event)" /></td>
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
              <td class="py-1.5 pl-3 text-right tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">{{ ledgerTotals.perAttempt != null ? `1 回あたり ${money(ledgerTotals.perAttempt, true)}` : "" }}</td>
              <td class="py-1.5 pl-3 text-right tabular-nums text-[14px] whitespace-nowrap" :class="evClass(ledgerTotals.profit)">{{ money(ledgerTotals.profit, true) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
          ベースの「使った数」が回数。売値の欄は空欄なら上の相場、実際に売れた額があればそれを入れてください。入力はレシピごとにこの PC に残ります。
          <span v-if="ledgerTotals.missingCost" class="text-amber-300">相場が取れていない素材があるため費用が不完全です。</span>
          <span v-if="ledgerTotals.missingSale" class="text-amber-300">売値が無い行があるため売上が不完全です。</span>
        </p>
      </div>
    </BaseCard>

    <!-- 前提 -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <button type="button" class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-center gap-2" @click="showAssumptions = !showAssumptions">
          <span>{{ showAssumptions ? "▲" : "▼" }}</span>
          <span>前提 (売値の段の条件と計算の入力。ここで変えられます)</span>
        </button>
        <div v-if="showAssumptions" class="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4 text-[12px]">
          <div class="space-y-2">
            <div class="text-[11px] text-[var(--exile-color-text-secondary)]">売値の段 (trade2 の検索条件。変えるとその分だけ取り直す)</div>
            <div v-for="b in c.buckets.value" :key="b.key" class="flex items-center gap-3 flex-wrap">
              <span class="text-[var(--exile-color-text-tertiary)] w-8">段 {{ b.key.toUpperCase() }}</span>
              <label v-for="k in condKeys(b.conds)" :key="k" class="inline-flex items-center gap-1">
                {{ METRIC_LABEL[k] }}
                <input v-model.number="b.conds[k]" type="number" min="0" step="5" class="num w-20" />
                <span class="text-[var(--exile-color-text-tertiary)]">{{ METRIC_UNIT[k] }}+</span>
              </label>
            </div>
            <div class="flex items-center gap-3 flex-wrap">
              <span class="text-[var(--exile-color-text-tertiary)] w-8">外れ</span>
              <label v-for="k in condKeys(c.floorConds.value)" :key="k" class="inline-flex items-center gap-1">
                {{ METRIC_LABEL[k] }}
                <input v-model.number="c.floorConds.value[k]" type="number" min="0" step="5" class="num w-20" />
                <span class="text-[var(--exile-color-text-tertiary)]">{{ METRIC_UNIT[k] }}+</span>
              </label>
            </div>
            <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="c.resetThresholds">既定値に戻す</button>
            <div class="text-[11px] text-[var(--exile-color-text-secondary)] pt-2">計算の入力</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
              <label>ベースの ilvl (これ以下の MOD だけ付く)</label><input v-model.number="c.ilvl.value" type="number" min="1" max="100" step="1" class="num" />
              <label>品質 % (防御にだけ効く)</label><input v-model.number="c.quality.value" type="number" min="0" max="30" step="1" class="num" />
              <template v-if="c.recipe.value.id === 'es-helmet'">
                <label>ベースの素の ES (先祖のティアラ 109 / カマサのティアラ 101)</label><input v-model.number="c.baseEs.value" type="number" min="0" step="1" class="num" />
              </template>
            </div>
          </div>
          <div class="text-[11px] text-[var(--exile-color-text-secondary)] leading-relaxed space-y-1">
            <p>
              手順 (0.5 の「クラフト MOD 1 + 冒涜 1」): マジックベースの MOD 1 つ → グレーターエッセンス (クラフト MOD 枠、レア化) → 肋骨で冒涜 3 択 (耐性 + 混沌耐性を優先して選ぶ) →
              高貴なオーブで空きを埋める。付く MOD は poe2db の推定重みに比例、ロール値は範囲内で一様、同じ系統は重ならない。
            </p>
            <p>重み: poe2db の値 (PoE1 で同系統だった MOD の重み。PoE2 の新 MOD と冒涜は 1 = 一様)。ティア値と「どの装備に付くか」はクライアントの MOD 表。GGG は PoE2 の重みを公開していない。</p>
            <p>兜 / 手袋 / 靴の冒涜 MOD は接尾辞だけ (クライアントの MOD 表) なので、ネクロマンシーのお告げは使わない。冒涜の候補は全部 MOD レベル 65 なので古代の肋骨でも候補は変わらない。</p>
            <p>売値の段: trade2 の擬似 stat (ライフ合計 / 元素耐性合計 / 混沌耐性合計 / 移動速度) と ES の値で検索した最安。1 回ぶんの結果は満たす段のうち一番高い売値で、どれにも届かなければ外れの最安で売る。</p>
            <p>ルーンと品質はシミュレーションのあとに足す (ソケット数ぶん)。ES = (素の ES + フラット ES) × (1 + %ES + 品質 + 鉄のルーン)。</p>
          </div>
        </div>
      </div>
    </BaseCard>

    <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">
      素材価格: カレンシーランキングの相場 (poe2scout 由来) · ベースと売値: trade2 (JP API、検索は 10 秒間隔、条件ごとに 5 回) · 重み: poe2db (推定) · ティア値: ゲームクライアント
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
