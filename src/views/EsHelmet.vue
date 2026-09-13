<!--
  EsHelmet.vue — ES 兜のクラフト (2026-09-14、「ヴァールの天秤」の 1 つ)
  マジックの ES ティアラ (フラット ES 付き) を買い、強化のグレーターエッセンス → 保存された肋骨 + 左手のネクロマンシーのお告げ → 高貴なオーブ (上級) ×2 で
  「ES 450 以上 + 元素耐性 合計 60 以上」の兜を作って売る。上位ラインは 2 ソケットの規格外ベースで耐性 80 以上。
  当たる確率は重みが非公開で出せないので、損益分岐の当たり率と、仮置きの確率での試算、収支 (実測) を並べる。
    views/es-helmet/model.ts       期待値モデル (純粋関数)
    views/es-helmet/useEsHelmet.ts プリセット / 相場 / trade2
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { openExternal } from "../services/trade2/open-external";
import { refetchState } from "../services/trade2/auto-price";
import BaseCard from "../components/decor/BaseCard.vue";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import MoneyInput from "../components/vaal-scales/MoneyInput.vue";
import { displayCurrency } from "../state/display-currency";
import { useEsHelmet } from "./es-helmet/useEsHelmet";
const money = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed });
const unit = displayCurrency.label;

async function open(url: string | null): Promise<void> {
  await openExternal(url);
}

const h = useEsHelmet();
onMounted(() => {
  void h.loadMarket();
});
const showAssumptions = ref(false);

function pct(p: number): string {
  if (!Number.isFinite(p)) return "—";
  const v = p * 100;
  return `${v.toFixed(v >= 10 ? 1 : 2)}%`;
}
function evClass(v: number | null): string {
  if (v == null) return "text-[var(--exile-color-text-tertiary)]";
  return v > 0 ? "text-emerald-300" : v < 0 ? "text-red-300" : "";
}
const refetch = computed(() => refetchState(h.pricing.value, "trade2 で取り直す", `trade2 で検索中… (残り ${h.remaining.value} 件、1 件 約 10 秒)`));
const priceCell = (kind: "base" | "hit" | "mid" | "miss", v: number | null): string => (v != null ? money(v) : h.get(kind) ? "出品なし" : h.pricing.value ? "取得中…" : "—");

/** 相場カードの行 */
const priceRows = computed(() => {
  const p = h.preset.value;
  const t = h.th.value;
  return [
    {
      kind: "base" as const,
      label: p.baseRarity === "magic" ? "ベース: マジックの ES 兜" : "ベース: 規格外 (2 ソケット) のノーマル ES 兜",
      note: p.baseRarity === "magic" ? `ilvl ${t.ilvlMin}+ · ES ${p.baseEsMin}+ · フラット ES ${t.flatEsMin}+ · ソケット ${p.sockets}+` : `ilvl ${t.ilvlMin}+ · ES ${p.baseEsMin}+ · ソケット ${p.sockets}+`,
      value: h.basePrice.value,
    },
    { kind: "hit" as const, label: "当たり", note: `レア · ES ${t.esHit}+ · 元素耐性 合計 ${p.resHit}+ · ソケット ${p.sockets}+`, value: h.hitPrice.value },
    { kind: "mid" as const, label: "中", note: `レア · ES ${t.esMid}+ · 元素耐性 合計 ${t.resMid}+ · ソケット ${p.sockets}+`, value: h.midPrice.value },
    { kind: "miss" as const, label: "外れ", note: `レア · ES ${t.esMiss}+ · ソケット ${p.sockets}+ (耐性なし)`, value: h.missPrice.value },
  ];
});

/** 「N 回やった場合」 */
const ATTEMPT_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const attempts = ref(10);
const atN = computed(() => {
  const r = h.result.value;
  const n = attempts.value;
  return {
    pAny: r.pHit > 0 ? 1 - Math.pow(1 - r.pHit, n) : 0,
    hits: n * r.pHit,
    mids: n * r.pMid,
    cost: r.ok ? n * r.cost : null,
    revenue: r.ok ? n * r.expectedSale : null,
    profit: r.ok ? n * r.ev : null,
  };
});
const materialRows = computed(() => {
  const n = attempts.value;
  const rows = [
    { key: "base", label: h.preset.value.baseRarity === "magic" ? "マジックの ES 兜 (フラット ES 付き)" : "規格外の ES 兜 (2 ソケット)", note: "1 回に 1 個。外れても品物は残る", unit: h.basePrice.value, qty: 1 },
    ...h.materials.value.map((m) => ({ key: m.key, label: m.label, note: m.note, unit: m.unit, qty: m.qty })),
  ];
  return rows.map((r) => ({ ...r, costPerAttempt: r.unit == null ? null : r.unit * r.qty, qtyN: r.qty * n, costN: r.unit == null ? null : r.unit * r.qty * n }));
});

/** 収支 (実績入力、プリセットごとに保存) */
const LEDGER_KEY = "exiledesk.es-helmet.ledger";
interface Ledger {
  bases: number;
  essences: number;
  omens: number;
  ribs: number;
  exalts: number;
  runes: number;
  soldHit: number;
  soldMid: number;
  soldMiss: number;
  eachHit: number | null;
  eachMid: number | null;
  eachMiss: number | null;
}
const EMPTY_LEDGER: Ledger = { bases: 0, essences: 0, omens: 0, ribs: 0, exalts: 0, runes: 0, soldHit: 0, soldMid: 0, soldMiss: 0, eachHit: null, eachMid: null, eachMiss: null };
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
const ledger = computed<Ledger>(() => ({ ...EMPTY_LEDGER, ...(book.value[h.presetId.value] ?? {}) }));
type CountKey = "bases" | "essences" | "omens" | "ribs" | "exalts" | "runes" | "soldHit" | "soldMid" | "soldMiss";
type EachKey = "eachHit" | "eachMid" | "eachMiss";
function setLedger<K extends keyof Ledger>(key: K, v: Ledger[K]): void {
  book.value = { ...book.value, [h.presetId.value]: { ...ledger.value, [key]: v } };
}
function ledgerNum(key: CountKey, ev: Event): void {
  const v = Number((ev.target as HTMLInputElement).value);
  setLedger(key, Number.isFinite(v) && v > 0 ? v : 0);
}
function resetLedger(): void {
  const next = { ...book.value };
  delete next[h.presetId.value];
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
const unitOf = (key: string): number | null => h.materials.value.find((m) => m.key === key)?.unit ?? null;
const ledgerRows = computed(() => {
  const l = ledger.value;
  const exaltUnit = h.exalt.value === "perfect" ? unitOf("pexalt") : unitOf("gexalt");
  const labelOf = (key: string, fallback: string): string => h.materials.value.find((m) => m.key === key)?.label ?? fallback;
  const rows: { key: CountKey; label: string; unit: number | null; qty: number }[] = [
    { key: "bases", label: "ベース", unit: h.basePrice.value, qty: l.bases },
    { key: "essences", label: "強化のグレーターエッセンス", unit: unitOf("essence"), qty: l.essences },
    { key: "omens", label: "左手のネクロマンシーのお告げ", unit: unitOf("omen"), qty: l.omens },
    { key: "ribs", label: labelOf("rib", "肋骨"), unit: unitOf("rib"), qty: l.ribs },
    { key: "exalts", label: h.exalt.value === "perfect" ? "高貴なオーブ (完全)" : "高貴なオーブ (上級)", unit: exaltUnit, qty: l.exalts },
    { key: "runes", label: labelOf("rune", "ルーン"), unit: unitOf("rune"), qty: l.runes },
  ];
  return rows.map((r) => ({ ...r, cost: r.unit == null ? null : r.unit * r.qty }));
});
const ledgerSales = computed(() => {
  const l = ledger.value;
  const rows: { qtyKey: CountKey; eachKey: EachKey; label: string; market: number | null; qty: number; each: number | null }[] = [
    { qtyKey: "soldHit", eachKey: "eachHit", label: "当たり", market: h.hitPrice.value, qty: l.soldHit, each: l.eachHit },
    { qtyKey: "soldMid", eachKey: "eachMid", label: "中", market: h.midPrice.value, qty: l.soldMid, each: l.eachMid },
    { qtyKey: "soldMiss", eachKey: "eachMiss", label: "外れ", market: h.missPrice.value, qty: l.soldMiss, each: l.eachMiss },
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
  const n = ledger.value.bases;
  const hits = ledger.value.soldHit;
  return {
    cost,
    revenue,
    profit: revenue - cost,
    missingCost: rows.some((r) => r.qty > 0 && r.cost == null),
    missingSale: sales.some((r) => r.qty > 0 && r.revenue == null),
    rate: n > 0 ? hits / n : null,
    perAttempt: n > 0 ? (revenue - cost) / n : null,
  };
});
</script>

<template>
  <section class="min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-3">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">ES 兜のクラフト</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        フラット ES 付きのマジック兜を買い、強化のグレーターエッセンス (%ES) → 肋骨 + 右手のネクロマンシーのお告げ (冒涜の接尾辞: 耐性 + 混沌耐性) → 高貴なオーブで空きを埋める (ハイブリッド ES と耐性は運) で
        「ES 450 以上 + 元素耐性 合計 60 以上」の兜を作って売る。上位ラインは 2 ソケットの規格外ベースで耐性 80 以上を狙う。当たり率は poe2db の重み × クライアントのティア値で計算。
      </p>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
        素材価格: カレンシーランキングの相場{{ h.league.value ? ` (${h.league.value.Value})` : "" }} · {{ h.marketLabel.value }} / ベースと売値: trade2 最安 (自動) / 当たる確率は非公開 (損益分岐と仮置きで見る)
        <span v-if="h.marketError.value" class="text-amber-300">— poe2scout 取得失敗: {{ h.marketError.value }}</span>
        <span v-if="h.priceError.value" class="text-amber-300">— trade2: {{ h.priceError.value }}</span>
      </p>
      <div class="mt-1 flex items-center gap-4 flex-wrap">
        <CurrencyPicker />
        <label class="text-[11px] text-[var(--exile-color-text-secondary)] inline-flex items-center gap-2">
          ライン
          <select v-model="h.presetId.value" class="num text-left w-44">
            <option v-for="p in h.PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </label>
        <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ h.preset.value.note }}</span>
      </div>
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
              @click="h.fetchPrices(true)"
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
                  <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" :disabled="!h.tradeUrl(r.kind)" @click="open(h.tradeUrl(r.kind))">トレード2へ ↗</button>
                </div>
                <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ r.note }}</div>
              </label>
              <span class="tabular-nums text-[13px] text-right" :class="r.value == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ priceCell(r.kind, r.value) }}</span>
            </template>
          </div>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-3">
            売値はどれも「未コラプト · インスタントバイアウト」の最安。当たり / 中 / 外れは ES と耐性の合計で判定し、どの MOD で到達したかは問わない。しきい値は前提欄で変えられる。
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
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ h.result.value.ok ? money(h.result.value.cost) : "—" }}</td>
                <td></td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ h.result.value.ok ? money(h.result.value.cost * attempts) : "—" }}</td>
              </tr>
            </tbody>
          </table>
          <div class="flex items-center gap-4 mt-2 text-[11px] text-[var(--exile-color-text-secondary)] flex-wrap">
            <label class="inline-flex items-center gap-2">肋骨
              <select v-model="h.rib.value" class="num text-left w-40"><option v-for="o in h.RIB_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option></select>
            </label>
            <label class="inline-flex items-center gap-2">エグザルト
              <select v-model="h.exalt.value" class="num text-left w-72"><option v-for="o in h.EXALT_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option></select>
            </label>
            <label class="inline-flex items-center gap-2">ルーン
              <select v-model="h.rune.value" class="num text-left w-44"><option v-for="o in h.RUNE_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option></select>
            </label>
            <label class="inline-flex items-center gap-2">エグザルトで足す数
              <select v-model.number="h.exaltCount.value" class="num text-left w-20"><option v-for="n in h.EXALT_COUNT_OPTIONS" :key="n" :value="n">{{ n }} 個</option></select>
            </label>
          </div>
        </div>
      </BaseCard>
    </div>

    <!-- 判定 -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-2">1 回あたり</h2>
        <template v-if="h.result.value.ok">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
            <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
              <div class="text-[var(--exile-color-text-secondary)]">損益分岐の当たり率</div>
              <div class="tabular-nums text-[16px]">{{ pct(h.result.value.breakeven) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">(費用 {{ money(h.result.value.cost) }} − 外れ {{ money(h.missPrice.value) }}) ÷ (当たり {{ money(h.hitPrice.value) }} − 外れ)。中を 0 と見た保守値</div>
            </div>
            <div class="rounded border p-3" :class="h.result.value.ev > 0 ? 'border-emerald-500/40' : 'border-[var(--exile-color-border-subtle)]'">
              <div class="text-[var(--exile-color-text-secondary)]">期待収支 ({{ h.probsSource.value === "db" ? "DB の重みで計算" : "手動" }}: 当たり {{ pct(h.result.value.pHit) }} · 中 {{ pct(h.result.value.pMid) }})</div>
              <div class="tabular-nums text-[16px]" :class="evClass(h.result.value.ev)">{{ money(h.result.value.ev, true) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">期待売上 {{ money(h.result.value.expectedSale) }} − 費用 {{ money(h.result.value.cost) }}</div>
            </div>
            <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
              <div class="text-[var(--exile-color-text-secondary)]">当たり 1 個あたりの実質コスト</div>
              <div class="tabular-nums text-[16px]">{{ h.result.value.costPerHit != null && h.result.value.costPerHit <= 0 ? "0 (中 · 外れの売上で回収)" : money(h.result.value.costPerHit) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">(費用 − 中 · 外れの回収) ÷ 当たり率。当たりの売値 {{ money(h.hitPrice.value) }} と比べる</div>
            </div>
          </div>
          <p class="text-[13px] mt-3" :class="evClass(h.result.value.ev)">
            {{ h.result.value.ev > 0 ? `作る価値あり: 1 回につき平均 ${money(h.result.value.ev)} の利益` : `作らない方が得: 1 回につき平均 ${money(-h.result.value.ev)} の赤字` }}
            (損益分岐の当たり率 {{ pct(h.result.value.breakeven) }} に対して計算上の当たり率 {{ pct(h.result.value.pHit) }})
          </p>
          <div v-if="h.odds.value.ok" class="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-[11px] max-w-3xl">
            <span class="text-[var(--exile-color-text-secondary)]">耐性 合計 {{ h.preset.value.resHit }}+ になる確率</span><span class="text-right tabular-nums">{{ pct(h.odds.value.pResHit) }}</span>
            <span class="text-[var(--exile-color-text-secondary)]">ES {{ h.th.value.esHit }}+ になる確率</span><span class="text-right tabular-nums">{{ pct(h.odds.value.pEsHit) }}</span>
            <span class="text-[var(--exile-color-text-secondary)]">ハイブリッド ES が付く確率</span><span class="text-right tabular-nums">{{ pct(h.odds.value.pHybrid) }}</span>
            <span class="text-[var(--exile-color-text-secondary)]">冒涜で耐性を取れる確率</span><span class="text-right tabular-nums">{{ pct(h.odds.value.pRibRes) }}</span>
            <span class="text-[var(--exile-color-text-secondary)]">ES の平均 / 耐性合計の平均</span><span class="text-right tabular-nums">{{ h.odds.value.meanEs.toFixed(0) }} / {{ h.odds.value.meanRes.toFixed(0) }}</span>
            <span class="text-[var(--exile-color-text-secondary)]">フラット ES のティア値</span><span class="text-right tabular-nums">{{ h.odds.value.flatEsRange ? `${h.odds.value.flatEsRange[0]}〜${h.odds.value.flatEsRange[1]}` : "—" }}</span>
          </div>
          <p v-else class="text-[11px] text-amber-300 mt-2">当たり率の計算に失敗: {{ h.odds.value.reason }}</p>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
            <div class="text-[12px]">
              <div class="text-[11px] text-[var(--exile-color-text-secondary)] mb-1">当たり率がもし違ったら (中 {{ pct(h.result.value.pMid) }} は固定)</div>
              <table class="w-full">
                <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
                  <tr>
                    <th class="text-left font-normal pb-1">当たり率</th>
                    <th class="text-right font-normal pb-1 pl-2">1 回の期待収支</th>
                    <th class="text-right font-normal pb-1 pl-2">10 回の期待損益</th>
                    <th class="text-right font-normal pb-1 pl-2">10 回で 1 個以上</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in h.scenarios.value" :key="s.hit" class="border-t border-[var(--exile-color-border-subtle)] tabular-nums" :class="Math.abs(s.hit - h.result.value.pHit) < 0.001 ? 'text-[var(--exile-color-accent-focus)]' : ''">
                    <td class="py-1">{{ pct(s.hit) }}</td>
                    <td class="py-1 pl-2 text-right whitespace-nowrap" :class="evClass(s.ev)">{{ s.ev == null ? "—" : money(s.ev, true) }}</td>
                    <td class="py-1 pl-2 text-right whitespace-nowrap" :class="evClass(s.evN10)">{{ s.evN10 == null ? "—" : money(s.evN10, true) }}</td>
                    <td class="py-1 pl-2 text-right">{{ pct(s.pAny10) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="rounded border border-[var(--exile-color-border-subtle)] p-3 text-[12px]">
              <div class="flex items-baseline justify-between mb-1 gap-2 flex-wrap">
                <span class="font-display tracking-[0.04em]">{{ attempts }} 回やった場合</span>
                <label class="text-[11px] text-[var(--exile-color-text-secondary)] inline-flex items-center gap-2">
                  回数
                  <select v-model.number="attempts" class="num text-left w-20">
                    <option v-for="n in ATTEMPT_OPTIONS" :key="n" :value="n">{{ n }} 回</option>
                  </select>
                </label>
              </div>
              <div class="grid grid-cols-2 gap-x-6 gap-y-1">
                <span class="text-[var(--exile-color-text-secondary)]">1 個以上当たる確率</span>
                <span class="text-right tabular-nums">{{ pct(atN.pAny) }}</span>
                <span class="text-[var(--exile-color-text-secondary)]">当たり / 中 の期待数</span>
                <span class="text-right tabular-nums">{{ atN.hits.toFixed(1) }} / {{ atN.mids.toFixed(1) }} 個</span>
                <span class="text-[var(--exile-color-text-secondary)]">総費用 (ベース + 素材) × {{ attempts }}</span>
                <span class="text-right tabular-nums">{{ money(atN.cost) }}</span>
                <span class="text-[var(--exile-color-text-secondary)]">期待売上</span>
                <span class="text-right tabular-nums">{{ money(atN.revenue) }}</span>
                <span class="text-[var(--exile-color-text-secondary)]">期待損益</span>
                <span class="text-right tabular-nums" :class="evClass(atN.profit)">{{ atN.profit == null ? "—" : money(atN.profit, true) }}</span>
                <span class="text-[var(--exile-color-text-secondary)]">95% / 99% で 1 個は当たる資金</span>
                <span class="text-right tabular-nums">{{ h.result.value.bankroll95 ? `${money(h.result.value.bankroll95.cost)} (${h.result.value.bankroll95.attempts} 回)` : "—" }} / {{ h.result.value.bankroll99 ? `${money(h.result.value.bankroll99.cost)} (${h.result.value.bankroll99.attempts} 回)` : "—" }}</span>
              </div>
            </div>
          </div>
        </template>
        <p v-else class="text-[12px] text-[var(--exile-color-text-tertiary)]">不足: {{ h.result.value.missing.join("、") || "計算できません" }}</p>
      </div>
    </BaseCard>

    <!-- 選択肢の比較 (2026-09-14) -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">選択肢の比較 (肋骨 × エグザルト × ルーン × 足す数)</h2>
          <span class="text-[11px] text-[var(--exile-color-text-secondary)]">費用と損益分岐は相場から、当たり率は {{ h.probsSource.value === "db" ? "poe2db の重みで計算" : "手動の共通値" }}。緑が期待収支の最大</span>
        </div>
        <table class="w-full text-[12px]">
          <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
            <tr>
              <th class="text-left font-normal pb-1">肋骨</th>
              <th class="text-left font-normal pb-1 pl-2">エグザルト</th>
              <th class="text-left font-normal pb-1 pl-2">ルーン</th>
              <th class="text-right font-normal pb-1 pl-2">数</th>
              <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">1 回の費用</th>
              <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">損益分岐</th>
              <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">当たり / 中</th>
              <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">1 回の期待収支</th>
              <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">10 回</th>
              <th class="pb-1"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="v in h.variants.value"
              :key="v.key"
              class="border-t border-[var(--exile-color-border-subtle)] tabular-nums"
              :class="[v.current ? 'text-[var(--exile-color-accent-focus)]' : '', v.key === h.bestVariantKey.value ? 'bg-emerald-500/10' : '']"
            >
              <td class="py-1 pr-2 whitespace-nowrap">{{ v.labels.rib }}</td>
              <td class="py-1 pl-2 whitespace-nowrap">{{ v.labels.exalt }}</td>
              <td class="py-1 pl-2 whitespace-nowrap">{{ v.labels.rune }}</td>
              <td class="py-1 pl-2 text-right whitespace-nowrap">{{ v.labels.count }}</td>
              <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(v.cost) }}</td>
              <td class="py-1 pl-2 text-right whitespace-nowrap">{{ v.breakeven == null ? "—" : pct(v.breakeven) }}</td>
              <td class="py-1 pl-2 text-right whitespace-nowrap">{{ pct(v.hit) }} / {{ pct(v.mid) }}</td>
              <td class="py-1 pl-2 text-right whitespace-nowrap" :class="evClass(v.ev)">{{ v.ev == null ? "—" : money(v.ev, true) }}</td>
              <td class="py-1 pl-2 text-right whitespace-nowrap" :class="evClass(v.ev10)">{{ v.ev10 == null ? "—" : money(v.ev10, true) }}</td>
              <td class="py-1 pl-2 text-right whitespace-nowrap">
                <span v-if="v.key === h.bestVariantKey.value" class="text-[10px] px-1 rounded bg-emerald-500/20 text-emerald-300">最も得</span>
                <button v-if="!v.current" type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" @click="h.selectVariant(v.key)">これにする</button>
                <span v-else class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)]">選択中</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
          当たり率は poe2db の推定重み (PoE1 由来。冒涜は全部 1 = 一様) とクライアントのティア値で 6,000 回試行した比率。古代の肋骨は兜では候補が変わらないので費用が増えるだけ。
          「数」はエグザルトで足す MOD の数 (2 = 空きを 1 つ残す、3 = 6 MOD まで埋める)。
        </p>
      </div>
    </BaseCard>

    <!-- 収支 (実績入力) -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">収支<span class="text-[12px] text-[var(--exile-color-text-secondary)] tracking-normal"> · {{ h.preset.value.label }}</span></h2>
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
              <td class="py-1.5 pl-3 text-right"><input :value="r.qty || ''" type="number" min="0" step="1" placeholder="0" class="num w-24" @input="ledgerNum(r.key, $event)" /></td>
              <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.cost) }}</td>
            </tr>
            <tr class="border-t border-[var(--exile-color-border-brass)]">
              <td class="py-1.5 pr-2 font-display tracking-[0.04em]">費用合計</td>
              <td></td>
              <td class="py-1.5 pl-3 text-right tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">{{ ledgerTotals.rate != null ? `実測の当たり率 ${pct(ledgerTotals.rate)} (当たり ÷ ベース)` : "" }}</td>
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
              <td class="py-1.5 pl-3 text-right tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">{{ ledgerTotals.perAttempt != null ? `1 回あたり ${money(ledgerTotals.perAttempt, true)}` : "" }}</td>
              <td class="py-1.5 pl-3 text-right tabular-nums text-[14px] whitespace-nowrap" :class="evClass(ledgerTotals.profit)">{{ money(ledgerTotals.profit, true) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
          実測の当たり率が上の「損益分岐の当たり率」を超えていれば続ける価値あり。売値の欄は空欄なら上の相場、実際に売れた額があればそれを入れてください。入力はラインごとにこの PC に残ります。
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
          <span>前提 (当たりの条件と仮置きの確率。ここで変えられます)</span>
        </button>
        <div v-if="showAssumptions" class="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4 text-[12px]">
          <div class="space-y-2">
            <div class="text-[11px] text-[var(--exile-color-text-secondary)]">当たり率の出所</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
              <label>計算方法</label>
              <select v-model="h.probsSource.value" class="num text-left w-full"><option value="db">poe2db の重みで計算</option><option value="manual">手動 (下の値)</option></select>
              <label>手動: 当たり (ES {{ h.th.value.esHit }}+ · 耐性 {{ h.preset.value.resHit }}+)</label><input v-model.number="h.manualProbs.value.hit" type="number" min="0" max="1" step="0.05" class="num" />
              <label>手動: 中 (ES {{ h.th.value.esMid }}+ · 耐性 {{ h.th.value.resMid }}+)。残りが外れ</label><input v-model.number="h.manualProbs.value.mid" type="number" min="0" max="1" step="0.05" class="num" />
            </div>
            <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="h.resetProbs">既定値に戻す</button>
            <div class="text-[11px] text-[var(--exile-color-text-secondary)] pt-2">計算の入力 (DB 計算のとき)</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
              <label>兜の属性 (重み表)</label>
              <select v-model="h.oddsIn.value.page" class="num text-left w-full"><option v-for="pg in h.HELMET_PAGES" :key="pg.id" :value="pg.id">{{ pg.label }}</option></select>
              <label>ベースの素の ES (先祖のティアラ 109 / カマサのティアラ 101 / 術師のティアラ 92)</label><input v-model.number="h.oddsIn.value.baseEs" type="number" min="0" step="1" class="num" />
              <label>買うベースのフラット ES のティア (1 = 61〜73)</label><input v-model.number="h.oddsIn.value.flatEsTier" type="number" min="1" max="8" step="1" class="num" />
              <label>品質 %</label><input v-model.number="h.oddsIn.value.quality" type="number" min="0" max="30" step="1" class="num" />
            </div>
            <div class="text-[11px] text-[var(--exile-color-text-secondary)] pt-2">trade2 の検索条件 (変えると取り直す)</div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 items-center">
              <label>ベースの ilvl 下限</label><input v-model.number="h.th.value.ilvlMin" type="number" min="1" max="100" step="1" class="num" />
              <label>マジックベースのフラット ES 下限</label><input v-model.number="h.th.value.flatEsMin" type="number" min="0" step="5" class="num" />
              <label>当たりの ES 下限</label><input v-model.number="h.th.value.esHit" type="number" min="0" step="10" class="num" />
              <label>中の ES 下限</label><input v-model.number="h.th.value.esMid" type="number" min="0" step="10" class="num" />
              <label>中の耐性合計 下限</label><input v-model.number="h.th.value.resMid" type="number" min="0" step="5" class="num" />
              <label>外れの ES 下限 (外れの売値を測る)</label><input v-model.number="h.th.value.esMiss" type="number" min="0" step="10" class="num" />
            </div>
            <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="h.resetThresholds">既定値に戻す</button>
          </div>
          <div class="text-[11px] text-[var(--exile-color-text-secondary)] leading-relaxed space-y-1">
            <p>手順 (0.5 の「クラフト MOD 1 + 冒涜 1」): マジックの ES 兜 (フラット ES = 接頭辞 1) → 強化のグレーターエッセンス (%ES = 接頭辞 2、レア化) → 肋骨 + 右手のネクロマンシーのお告げ → 魂の井戸で冒涜の接尾辞 3 択 (兜の冒涜は接尾辞だけ。「X と混沌耐性 +13〜17」を取る) → 高貴なオーブで空き (接頭辞 1 + 接尾辞 2) を埋める (ハイブリッド ES と耐性が付くかは重み次第) → 鉄のルーン。</p>
            <p>計算: poe2db の推定重み (PoE1 由来、冒涜は全部 1 = 一様) × クライアントのティア値。ES = (素の ES + フラット ES) × (1 + %ES + ハイブリッド + 品質 + ルーン)。ES 450 は「素 109 + フラット T1 + エッセンス上振れ + ハイブリッド」でやっと届く水準で、平均は 390 前後。</p>
            <p>当たりの判定は結果だけ (ES 合計と元素耐性の合計の擬似 stat) で見る。ES 450 の目安は (ベース ES 約 120 + フラット ES 約 100) × (1 + %ES + ハイブリッド + 品質 + ルーン)。</p>
            <p>損益分岐の当たり率は中の売上を 0 と見た保守値。当たり率は既定で DB の重みから計算し、手動に切り替えれば任意の値も入れられる。収支の実測の当たり率と見比べること。</p>
            <p>上位ラインの外れは「2 ソケットのレア ES 兜 (耐性なし)」の最安で、規格外ベースの転売価格に近い。上位ラインの当たりは出品が薄く (200 件前後)、最安より下で出す前提。</p>
            <p>JP 実測 2026-09-14: ES 450+ · 耐性 60+ = 2 神、ES 450+ · 耐性 80+ · ソケット 2 = 20〜55 神、ES 400+ · 耐性 60+ = 5〜10 カオス、マジック ES 兜 (フラット ES 40+、ilvl 80+) = 1 高貴、規格外 2 ソケットのノーマル ES 兜 = 15〜33 カオス。</p>
          </div>
        </div>
      </div>
    </BaseCard>

    <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">
      素材価格: カレンシーランキングの相場 (poe2scout 由来) · ベースと売値: trade2 (JP API、検索は 10 秒間隔、ラインごとに 4 回) · 手順の出典: Fubgun Ice Shot 0.5.5 (Mobalytics)、Forge of Exiles 0.5.3
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
