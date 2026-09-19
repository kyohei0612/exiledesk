<!--
  LedgerPanel.vue — 収支 (実績入力、レシピごとに保存)
  2026-09-19 に RareCraft.vue から切り出した。中身は変えていない。
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import BaseCard from "../../components/decor/BaseCard.vue";
import MoneyInput from "../../components/vaal-scales/MoneyInput.vue";
import { bucketLabel } from "./recipes";
import { evClass, money } from "./ui";
import type { useRareCraft } from "./useRareCraft";

const props = defineProps<{ c: ReturnType<typeof useRareCraft> }>();
const c = props.c;

/**
 * 収支 (実績入力、レシピごとに保存)
 * 2026-09-14 オーナー指摘: 使うのは基本「最も得」の組み合わせなので、回数を入れたら素材欄の組み合わせ (既定は最も得) の
 * 「1 回の数 × 回数」で使った数を埋める (空欄 = 自動、違った数だけ上書き)。
 * 2026-09-15 オーナー指示: 売れた数も「売値の段ごとに売る確率 × 回数」で埋める。
 * 回数を入れた時点の組み合わせを帳簿に固定する (相場で最も得が変わっても、やった分を別の組み合わせの素材で数え直さない)。
 */
const LEDGER_KEY = "exiledesk.rare-craft.ledger";
interface Ledger {
  attempts: number;
  /** 帳簿の組み合わせ (Variant.key)。null = 素材欄の組み合わせに合わせる */
  variant: string | null;
  /** 手で上書きした使った数 (無い行は 1 回の数 × 回数) */
  qty: Record<string, number>;
  /** 手で上書きした売れた数 (無い行は 売る確率 × 回数) */
  sold: Record<string, number>;
  each: Record<string, number | null>;
}
interface StoredLedger extends Partial<Ledger> {
  /** 旧形式: 使った数を全部手で入れていた (0 より大きい物は上書きとして引き継ぐ) */
  counts?: Record<string, number>;
  /** 売れた数が「空欄 = 自動」の形式で保存されているか (それ以前は空欄を 0 で保存していた) */
  soldV2?: boolean;
}
type LedgerBook = Record<string, StoredLedger>;
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
  const qty: Record<string, number> = { ...(l.qty ?? {}) };
  if (!l.qty && l.counts) {
    for (const [k, v] of Object.entries(l.counts)) if (typeof v === "number" && v > 0) qty[k] = v;
  }
  const sold: Record<string, number> = {};
  for (const [k, v] of Object.entries(l.sold ?? {})) {
    // 旧形式は空欄を 0 で保存していたので、0 は自動 (期待値) に戻す
    if (typeof v === "number" && (l.soldV2 ? v >= 0 : v > 0)) sold[k] = v;
  }
  return { attempts: l.attempts ?? 0, variant: l.variant ?? null, qty, sold, each: { ...(l.each ?? {}) } };
});
function saveLedger(next: Ledger): void {
  book.value = { ...book.value, [c.recipeId.value]: { ...next, soldV2: true } };
}
/** 数の入力。空欄は null (= 自動) */
function readCount(ev: Event): number | null {
  const raw = (ev.target as HTMLInputElement).value.trim();
  if (raw === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : null;
}
function setAttempts(ev: Event): void {
  const n = Math.floor(readCount(ev) ?? 0);
  const l = ledger.value;
  // 回数を入れた時点の素材欄の組み合わせ (既定は最も得) で帳簿を固定する (相場が揃ってから)
  const variant = l.variant ?? (n > 0 && c.result.value ? c.currentKey.value : null);
  saveLedger({ ...l, attempts: n, variant });
}
function pinCurrentVariant(): void {
  saveLedger({ ...ledger.value, variant: c.currentKey.value });
}
function setCount(key: string, ev: Event): void {
  const v = readCount(ev);
  const l = ledger.value;
  const qty = { ...l.qty };
  if (v == null) delete qty[key];
  else qty[key] = v;
  saveLedger({ ...l, qty });
}
function setSold(key: string, ev: Event): void {
  const v = readCount(ev);
  const l = ledger.value;
  const sold = { ...l.sold };
  if (v == null) delete sold[key];
  else sold[key] = v;
  saveLedger({ ...l, sold });
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
/** 帳簿の組み合わせ (回数を入れた時に固定。固定前は素材欄の組み合わせ) */
const ledgerVariantKey = computed(() => ledger.value.variant ?? c.currentKey.value);
const ledgerDetail = computed(() => c.detailFor(ledgerVariantKey.value));
const ledgerRows = computed(() => {
  const l = ledger.value;
  const rows = [
    { key: "base", label: "ベース (規格外のマジック)", unit: c.basePrice.value, perAttempt: 1 },
    ...ledgerDetail.value.materials.map((m) => ({ key: m.apiId, label: m.label, unit: m.unit, perAttempt: m.qty })),
  ];
  return rows.map((r) => {
    const auto = r.perAttempt * l.attempts;
    const override = l.qty[r.key] ?? null;
    const qty = override ?? auto;
    return { ...r, auto, override, qty, cost: r.unit == null ? null : r.unit * qty };
  });
});
const ledgerSales = computed(() => {
  const l = ledger.value;
  const lr = ledgerDetail.value.ladder;
  const rows = [
    ...c.ladderBuckets.value.map((b) => ({ key: b.key, label: b.label, market: b.price, p: lr?.rows.find((x) => x.key === b.key)?.pSold ?? null })),
    { key: "floor", label: `外れ (${bucketLabel(c.floorConds.value)})`, market: c.floorPrice.value, p: lr?.floor.pSold ?? null },
  ];
  return rows.map((r) => {
    // 空欄は「この段で売る確率 × 回数」(相場が揃うまでは 0)
    const auto = r.p == null ? 0 : r.p * l.attempts;
    const override = l.sold[r.key] ?? null;
    const qty = override ?? auto;
    const each = l.each[r.key] ?? null;
    const price = each ?? r.market;
    return { ...r, auto, override, qty, each, revenue: price == null ? (qty > 0 ? null : 0) : price * qty };
  });
});
const ledgerTotals = computed(() => {
  const cost = ledgerRows.value.reduce((s, r) => s + (r.cost ?? 0), 0);
  const revenue = ledgerSales.value.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const bases = ledgerRows.value.find((r) => r.key === "base")?.qty ?? 0;
  return {
    cost,
    revenue,
    profit: revenue - cost,
    perAttempt: bases > 0 ? (revenue - cost) / bases : null,
    missingCost: ledgerRows.value.some((r) => r.qty > 0 && r.cost == null),
    missingSale: ledgerSales.value.some((r) => r.qty > 0 && r.revenue == null),
  };
});
const fmtCount = (q: number): string => (Number.isInteger(q) ? String(q) : q.toFixed(2));
</script>

<template>
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">収支<span class="text-[12px] text-[var(--exile-color-text-secondary)] tracking-normal"> · {{ c.recipe.value.label }}</span></h2>
          <div class="flex items-center gap-3 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
            <span>回数を入れると使った数と売れた数が期待値で埋まる。実際と違う数だけ上書き</span>
            <button type="button" class="underline hover:text-[var(--exile-color-accent-focus)]" @click="resetLedger">全部 0 に</button>
          </div>
        </div>
        <div class="mb-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
          <label class="inline-flex items-center gap-2">
            回数
            <input :value="ledger.attempts || ''" type="number" min="0" step="1" placeholder="0" class="num w-20" @input="setAttempts" />
          </label>
          <span class="min-w-0">
            帳簿の組み合わせ: {{ c.variantLabel(ledgerVariantKey) }}
            <template v-if="!ledger.variant">({{ c.autoBest.value ? "素材欄 = 最も得" : "素材欄で選んだ物" }}。回数を入れた時点で固定)</template>
          </span>
          <button v-if="ledger.variant && ledger.variant !== c.currentKey.value" type="button" class="underline hover:text-[var(--exile-color-accent-focus)]" @click="pinCurrentVariant">素材欄の組み合わせに変える</button>
        </div>
        <table class="w-full text-[12px] break-words">
          <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
            <tr>
              <th class="text-left font-normal pb-1">素材</th>
              <th class="text-right font-normal pb-1 pl-3">単価</th>
              <th class="text-right font-normal pb-1 pl-3">使った数 (空欄は 1 回の数 × 回数)</th>
              <th class="text-right font-normal pb-1 pl-3">費用</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in ledgerRows" :key="r.key" class="border-t border-[var(--exile-color-border-subtle)]">
              <td class="py-1.5 pr-2">{{ r.label }}</td>
              <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap" :class="r.unit == null ? 'text-amber-300' : ''">{{ r.unit == null ? "相場なし" : money(r.unit) }}</td>
              <td class="py-1.5 pl-3 text-right"><input :value="r.override ?? ''" type="number" min="0" step="1" :placeholder="fmtCount(r.auto)" class="num w-24" @input="setCount(r.key, $event)" /></td>
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
              <td class="py-1.5 pl-3 text-right"><input :value="r.override ?? ''" type="number" min="0" step="1" :placeholder="fmtCount(r.auto)" class="num w-24" @input="setSold(r.key, $event)" /></td>
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
          使った数は空欄なら「帳簿の組み合わせの 1 回の数 × 回数」、売れた数は空欄なら「その段で売る確率 × 回数」(期待値) です。実際に違った数だけ入れてください。
          帳簿の組み合わせは回数を入れた時点の素材欄 (既定は最も得) で固定し、相場で最も得が変わっても数え直しません。売値の欄は空欄なら上の相場、実際に売れた額があればそれを入れてください。入力はレシピごとにこの PC に残ります。
          <span v-if="ledgerTotals.missingCost" class="text-amber-300">相場が取れていない素材があるため費用が不完全です。</span>
          <span v-if="ledgerTotals.missingSale" class="text-amber-300">売値が無い行があるため売上が不完全です。</span>
        </p>
      </div>
    </BaseCard>

</template>
