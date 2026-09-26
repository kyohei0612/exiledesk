<!--
  Overquality.vue — アドニアの賭け (2026-09-12、オーナー指示でアドニア専用)
  吸収のワンドを品質 20% を超えて (最大 30%) 育て、可能性のお告げ + 可能性のオーブでアドニアのエゴにする。
  ベースと彫刻針は失敗のたびに消え、お告げとオーブは成功したベースにしか使わない。完成品 1 個あたりの実質コストと利益を出す。
    views/overquality/model.ts          品質の階段を状態遷移で解く (純粋関数)
    views/overquality/useOverquality.ts プリセット / 相場 / 入力
-->
<script setup lang="ts">
import { evClass } from "../utils/ev-class";
import { computed, onMounted, ref } from "vue";
import { openExternal } from "../services/trade2/open-external";
import BaseCard from "../components/decor/BaseCard.vue";
import { useOverquality } from "./overquality/useOverquality";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import ScreenHeader from "../components/ScreenHeader.vue";
import RefreshButton from "../components/RefreshButton.vue";
import { displayCurrency } from "../state/display-currency";
import { refetchState } from "../services/trade2/auto-price";
// 収支 (実績入力) と前提は切り出した (2026-09-26 の分割)
import LedgerCard from "./overquality/LedgerCard.vue";
import AssumptionsCard from "./overquality/AssumptionsCard.vue";
import { pct } from "./overquality/format";
const money = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed });
const unit = displayCurrency.label;

async function open(url: string | null): Promise<void> {
  await openExternal(url);
}

const o = useOverquality();
onMounted(() => {
  void o.loadMarket();
});
const showLadder = ref(false);

/** 「N 回やった場合」の N (5 刻み)。オーナー指示 2026-09-13 */
const ATTEMPT_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const attempts = ref(10);
const atN = computed(() => {
  const r = o.result.value;
  const n = attempts.value;
  const s = r.survival;
  const finish = (o.auto.value.omen ?? 0) + (o.auto.value.chance ?? 0);
  return {
    n,
    /** 少なくとも 1 個できる確率 */
    pAny: s > 0 ? 1 - Math.pow(1 - s, n) : 0,
    /** 完成の期待数 */
    expected: n * s,
    /** 材料費 (ワンド + 彫刻針 + インフューザー期待) × N */
    materials: r.ok ? n * r.expectedCostPerAttempt : null,
    /** 成功 1 個ごとに掛かるお告げ + オーブ */
    finish,
    /** 期待総費用 = 材料費 + 期待完成数 × 仕上げ */
    total: r.ok ? n * r.expectedCostPerAttempt + n * s * finish : null,
    /** 期待売上 = 期待完成数 × 売値 */
    revenue: r.ok && o.salePrice.value != null ? n * s * o.salePrice.value : null,
  };
});
/** 素材表の行 (1 回あたりの数量と費用、N 回分) */
const materialRows = computed(() => {
  const r = o.result.value;
  const n = attempts.value;
  const s = r.survival;
  const rows = [
    { key: "wand", label: "吸収のワンド", note: "ノーマル · 未コラプト · ソケット 2", unit: o.autoBasePrice.value, perAttempt: 1, onSuccess: false },
    { key: "etcher", label: o.preset.value.qualityCurrencyJa, note: "0 → 20% (1 本 +1%)", unit: o.auto.value.qualityCurrency, perAttempt: o.qualityCurrencyCount.value, onSuccess: false },
    { key: "infuser", label: o.preset.value.infuserJa, note: "20% → 目標まで。壊れるまでに使う本数の期待値", unit: o.auto.value.infuser, perAttempt: r.expectedInfusers, onSuccess: false },
    { key: "omen", label: "可能性のお告げ", note: "成功した 1 本にだけ使う", unit: o.auto.value.omen, perAttempt: 1, onSuccess: true },
    { key: "chance", label: "可能性のオーブ", note: "成功した 1 本にだけ使う", unit: o.auto.value.chance, perAttempt: 1, onSuccess: true },
  ];
  return rows.map((row) => {
    const qtyN = row.onSuccess ? row.perAttempt * n * s : row.perAttempt * n;
    return {
      ...row,
      costPerAttempt: row.unit == null ? null : row.onSuccess ? null : row.unit * row.perAttempt,
      qtyN,
      costN: row.unit == null ? null : row.unit * qtyN,
    };
  });
});
const fmtQty = (q: number): string => (Number.isInteger(q) ? String(q) : q.toFixed(2));
/** 再取得ボタン (検索中 / レート制限 / 間隔待ち のカウントダウン) */
const refetch = computed(() => refetchState(o.pricing.value, "trade2 で取り直す"));
</script>

<template>
  <section class="@container min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <ScreenHeader title="アドニアの賭け" :error="o.marketError.value ? `poe2scout 取得失敗: ${o.marketError.value}` : null">
      吸収のワンドをヴァールアルカニストのインフューザーで品質 20% より上 (最大 30%) に育て、可能性のお告げ + 可能性のオーブでアドニアのエゴにするクラフトの収支。
      20% を超えた分だけコラプト化の危険があり、コラプトしたワンドは失敗です。完成品 1 個あたりの実質コストで判定します。
      <template #source>
        素材価格: カレンシーランキングの相場{{ o.league.value ? ` (${o.league.value.Value})` : "" }} · {{ o.marketLabel.value }} / 通貨の説明: ゲームクライアント / コラプト確率は非公開 (プレイヤー計測値、変更可)
      </template>
      <template #actions>
        <RefreshButton
          :label="refetch.label"
          :disabled="refetch.disabled || (!o.baseEn.value && !o.uniqueEn.value)"
          title="ワンドと完成品の最安を trade2 から取り直します"
          @click="o.fetchPrices"
        />
      </template>
      <template #controls><CurrencyPicker /></template>
    </ScreenHeader>

    <div class="grid grid-cols-1 @6xl:grid-cols-2 gap-4 mb-4">
      <!-- 入力 -->
      <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">相場 (trade2 から自動)</h2>
            <!-- 手動更新は見出しに集約した (2026-09-21) -->
          </div>
          <div class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 items-center text-[12px]">
            <label>
              <div>
                {{ o.preset.value.baseJa }} 1 個 ({{ unit }})
                <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" :disabled="!o.baseTradeUrl.value" @click="open(o.baseTradeUrl.value)">トレード2へ ↗</button>
              </div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">
                失敗のたびに消える。trade2 の「ノーマル · 未コラプト · ソケット 2」の最安
              </div>
            </label>
            <span class="tabular-nums text-[13px] text-right" :class="o.autoBasePrice.value == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ o.autoBasePrice.value == null ? (o.pricing.value ? "取得中…" : "未取得") : money(o.autoBasePrice.value) }}</span>
            <label>
              <div>
                完成品の売値 ({{ o.preset.value.uniqueJa }} · 品質 {{ o.targetQuality.value }}% 以上 · ソケット 2 · 未コラプト)
                <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" :disabled="!o.saleTradeUrl.value" @click="open(o.saleTradeUrl.value)">トレード2へ ↗</button>
              </div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">
                trade2 の「品質 {{ o.targetQuality.value }}% 以上 · ソケット 2 · 未コラプト」の最安<span v-if="o.autoSalePrice.value == null && o.auto.value.uniqueRef != null">。取れるまではカレンシーランキングの品質不問の値</span>
              </div>
            </label>
            <span class="tabular-nums text-[13px] text-right" :class="o.salePrice.value == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ o.salePrice.value == null ? (o.pricing.value ? "取得中…" : "未取得") : money(o.salePrice.value) }}</span>
          </div>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-3">
            前提: 目標品質 {{ o.targetQuality.value }}% (完成品の検索条件と同じ、最大品質は 10% まで超過できる) · {{ o.preset.value.qualityCurrencyJa }}は 1 本 +1% なので 0 → 20% に {{ o.qualityCurrencyCount.value }} 本 ·
            インフューザーとお告げとオーブの単価はカレンシーランキングの相場。
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
              <select v-model.number="attempts" class="num w-20">
                <option v-for="n in ATTEMPT_OPTIONS" :key="n" :value="n">{{ n }} 回</option>
              </select>
            </label>
          </div>
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">素材</th>
                <th class="text-right font-normal pb-1 pl-3">単価</th>
                <th class="text-right font-normal pb-1 pl-3">1 回の数</th>
                <th class="text-right font-normal pb-1 pl-3">1 回の費用</th>
                <th class="text-right font-normal pb-1 pl-3">{{ attempts }} 回の数</th>
                <th class="text-right font-normal pb-1 pl-3">{{ attempts }} 回の費用</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in materialRows" :key="m.key" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>{{ m.label }}</div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ m.note }}</div>
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(m.unit) }}</td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ m.onSuccess ? "成功時 1" : fmtQty(m.perAttempt) }}</td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ m.onSuccess ? "—" : money(m.costPerAttempt) }}</td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ fmtQty(m.qtyN) }}<span v-if="m.onSuccess" class="text-[10px] text-[var(--exile-color-text-tertiary)]"> (期待)</span></td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(m.costN) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)] font-display tracking-[0.04em]">
                <td class="py-1.5 pr-2">合計</td>
                <td></td>
                <td></td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ o.result.value.ok ? money(o.result.value.expectedCostPerAttempt) : "—" }}</td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap text-[10px] text-[var(--exile-color-text-tertiary)]">完成 {{ atN.expected.toFixed(2) }} 個 (期待)</td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(atN.total) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            インフューザー · お告げ · オーブの数は期待値。{{ attempts }} 回の合計は「材料費 × 回数 + 仕上げ (お告げ + オーブ) × 期待完成数」。
          </p>
        </div>
      </BaseCard>
    </div>

    <!-- 判定 -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-2">完成品 1 個あたり</h2>
        <template v-if="o.result.value.ok">
          <div class="grid grid-cols-1 @3xl:grid-cols-3 gap-3 text-[12px]">
            <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
              <div class="text-[var(--exile-color-text-secondary)]">実質コスト</div>
              <div class="tabular-nums text-[16px]">{{ money(o.result.value.costPerFinished) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">(ベース + 品質通貨 + インフューザー期待値) ÷ 生存率 + お告げ + オーブ</div>
            </div>
            <div class="rounded border p-3" :class="o.result.value.profit > 0 ? 'border-emerald-400/40' : 'border-red-400/40'">
              <div class="text-[var(--exile-color-text-secondary)]">利益</div>
              <div class="tabular-nums text-[16px]" :class="evClass(o.result.value.profit)">
                {{ money(o.result.value.profit, true) }}
              </div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">利益率 {{ (o.result.value.margin * 100).toFixed(1) }}% (利益 ÷ 売値)</div>
            </div>
            <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
              <div class="text-[var(--exile-color-text-secondary)]">損益分岐のベース価格</div>
              <div class="tabular-nums text-[16px]">{{ money(o.result.value.breakEvenBasePrice) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">これより高いベースを買うと赤字</div>
            </div>
          </div>
          <p class="text-[13px] mt-3" :class="evClass(o.result.value.profit)">
            {{ o.result.value.profit > 0 ? `作る価値あり: 完成品 1 個につき ${money(o.result.value.profit)} の利益` : `買った方が得: 作ると 1 個につき ${money(-o.result.value.profit)} の赤字` }}
          </p>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] mt-3 max-w-xl">
            <span class="text-[var(--exile-color-text-secondary)]">1 ベースが {{ o.targetQuality.value }}% まで生き残る確率</span>
            <span class="text-right tabular-nums">{{ pct(o.result.value.survival) }} (約 1 / {{ (1 / o.result.value.survival).toFixed(1) }})</span>
            <span class="text-[var(--exile-color-text-secondary)]">1 ベースあたりのインフューザー期待数</span>
            <span class="text-right tabular-nums">{{ o.result.value.expectedInfusers.toFixed(2) }} 個</span>
            <span class="text-[var(--exile-color-text-secondary)]">1 ベースあたりの期待費用</span>
            <span class="text-right tabular-nums">{{ money(o.result.value.expectedCostPerAttempt) }}</span>
            <span class="text-[var(--exile-color-text-secondary)]">95% で 1 個は成功する資金 (試行数)</span>
            <span class="text-right tabular-nums">{{ money(o.result.value.bankroll95.cost) }} ({{ o.result.value.bankroll95.attempts }} 回)</span>
            <span class="text-[var(--exile-color-text-secondary)]">99% で 1 個は成功する資金 (試行数)</span>
            <span class="text-right tabular-nums">{{ money(o.result.value.bankroll99.cost) }} ({{ o.result.value.bankroll99.attempts }} 回)</span>
          </div>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            資金は「少なくとも 1 個成功するまでに要る手持ち」で、期待総費用ではありません。期待総費用は実質コスト × 作る個数です。
          </p>
          <div class="mt-3 rounded border border-[var(--exile-color-border-subtle)] p-3 text-[12px]">
            <div class="flex items-baseline justify-between mb-1">
              <span class="font-display tracking-[0.04em]">{{ attempts }} 回やった場合</span>
              <label class="text-[11px] text-[var(--exile-color-text-secondary)] inline-flex items-center gap-2">
                回数
                <select v-model.number="attempts" class="num w-20">
                  <option v-for="n in ATTEMPT_OPTIONS" :key="n" :value="n">{{ n }} 回</option>
                </select>
              </label>
            </div>
            <div class="grid grid-cols-2 gap-x-6 gap-y-1 max-w-xl">
              <span class="text-[var(--exile-color-text-secondary)]">1 個以上できる確率</span>
              <span class="text-right tabular-nums">{{ pct(atN.pAny) }}</span>
              <span class="text-[var(--exile-color-text-secondary)]">完成の期待数</span>
              <span class="text-right tabular-nums">{{ atN.expected.toFixed(2) }} 個</span>
              <span class="text-[var(--exile-color-text-secondary)]">材料費 (ワンド + 彫刻針 + インフューザー) × {{ attempts }}</span>
              <span class="text-right tabular-nums">{{ money(atN.materials) }}</span>
              <span class="text-[var(--exile-color-text-secondary)]">仕上げ (お告げ + オーブ) × 期待完成数</span>
              <span class="text-right tabular-nums">{{ money(atN.finish * atN.expected) }}</span>
              <span class="text-[var(--exile-color-text-secondary)]">期待総費用</span>
              <span class="text-right tabular-nums">{{ money(atN.total) }}</span>
              <span class="text-[var(--exile-color-text-secondary)]">期待売上 (完成数 × 売値)</span>
              <span class="text-right tabular-nums">{{ money(atN.revenue) }}</span>
              <span class="text-[var(--exile-color-text-secondary)]">期待損益</span>
              <span class="text-right tabular-nums" :class="evClass(atN.revenue != null && atN.total != null ? atN.revenue - atN.total : null)">{{ atN.revenue != null && atN.total != null ? money(atN.revenue - atN.total, true) : "—" }}</span>
            </div>
          </div>
          <button type="button" class="mt-2 text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="showLadder = !showLadder">
            {{ showLadder ? "▲ 品質ごとの内訳を閉じる" : "▼ 品質ごとの内訳" }}
          </button>
          <table v-if="showLadder" class="mt-1 text-[11px] max-w-md w-full">
            <thead class="text-[10px] text-[var(--exile-color-text-tertiary)]">
              <tr><th class="text-left font-normal">品質</th><th class="text-right font-normal">ここに到達</th><th class="text-right font-normal">ここで壊れる</th></tr>
            </thead>
            <tbody>
              <tr v-for="l in o.result.value.ladder" :key="l.quality" class="border-t border-[var(--exile-color-border-subtle)] tabular-nums">
                <td class="py-0.5">{{ l.quality }}% → 使う</td><td class="text-right">{{ pct(l.reach) }}</td><td class="text-right text-red-300">{{ pct(l.brickHere) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-subtle)] tabular-nums"><td class="py-0.5">{{ o.targetQuality.value }}% 到達</td><td class="text-right text-emerald-300">{{ pct(o.result.value.survival) }}</td><td></td></tr>
            </tbody>
          </table>
        </template>
        <p v-else class="text-[12px] text-[var(--exile-color-text-tertiary)]">不足: {{ o.result.value.missing.join("、") || "計算できません" }}</p>
      </div>
    </BaseCard>

    <!-- 収支 (実績入力) 2026-09-13 ([[LedgerCard.vue]]) -->
    <LedgerCard :o="o" />

    <AssumptionsCard :o="o" />
  </section>
</template>

