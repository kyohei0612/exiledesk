<!--
  RareCraft.vue — 規格外の賭け (2026-09-14、「ヴァールの天秤」の 1 つ。旧「ES 兜のクラフト」を一般化)
  規格外 (ルーンソケット 2) のマジックベース (MOD 1 つ) → グレーターエッセンス → 肋骨で冒涜 → 高貴なオーブ + 偉大なる高貴なお告げで 2 つ足す → ルーン ×2、の収支。
  1 ソケットの通常ベースは今の相場で全部赤字なので扱わない (オーナー指示 2026-09-14)。
  当たり方は poe2db の推定重み × クライアントのティア値でシミュレーションし、trade2 の「売値の段」で期待収支を出す。
    views/rare-craft/sim.ts          シミュレーター (純粋関数)
 *    views/rare-craft/ladder.ts       売値の段 (ラダー) の判定
    views/rare-craft/recipes.ts      レシピ (ES 兜 / ライフ耐性手袋 / 移動速度靴) と素材
    views/rare-craft/useRareCraft.ts 状態 / 相場 / trade2
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { openExternal } from "../services/trade2/open-external";
import { refetchState } from "../services/trade2/auto-price";
import BaseCard from "../components/decor/BaseCard.vue";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import { displayCurrency } from "../state/display-currency";
import { useRareCraft } from "./rare-craft/useRareCraft";
import { METRIC_LABEL, METRIC_UNIT } from "./rare-craft/sim";
import { bucketLabel } from "./rare-craft/recipes";
import LedgerPanel from "./rare-craft/LedgerPanel.vue";
import AssumptionsPanel from "./rare-craft/AssumptionsPanel.vue";
const money = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed });
const unit = displayCurrency.label;

async function open(url: string | null): Promise<void> {
  await openExternal(url);
}

const c = useRareCraft();
onMounted(() => {
  void c.loadMarket();
});
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
const bucketKind = (key: string): `b:${string}` => `b:${key}`;
const refetch = computed(() =>
  refetchState(
    c.pricing.value,
    // 2026-09-16: 画面を開いただけでは取りに行かない。未取得なら「取得」、揃っていれば「取り直す」
    c.missingCount.value > 0 ? `取得 (${c.missingCount.value} 件、1 件 約 10 秒)` : "trade2 で取り直す",
    `trade2 で検索中… (残り ${c.remaining.value} 件、1 件 約 10 秒)`,
  ),
);

/** 相場カードの行 */
const priceRows = computed(() => {
  const t = c.currentTier.value;
  const rows: { kind: "base" | "floor" | `b:${string}`; label: string; note: string }[] = [
    {
      kind: "base",
      label: "ベース (規格外のマジック)",
      note: `${c.page.value.label} · ilvl ${c.ilvl.value}+ · ${c.recipe.value.baseMod.label} ${t ? `${t.min}〜${t.max} (T${t.tier})` : "—"} · ソケット ${c.sockets.value}`,
    },
    ...c.buckets.value.map((b) => ({ kind: bucketKind(b.key), label: `売値の段: ${bucketLabel(b.conds)}`, note: `レア · 未コラプト · ソケット ${c.sockets.value}` })),
    { kind: "floor", label: `外れ: ${bucketLabel(c.floorConds.value)}`, note: "どの段にも届かず、この条件には届いた物をこの値で売る (条件に届かない物は 0)" },
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
    { key: "base", label: "ベース (規格外のマジック)", note: "1 回に 1 個。外れても品物は残る (外れの売値で売る)", unit: c.basePrice.value, qty: 1 },
    ...c.materials.value.map((m) => ({ key: m.key, label: m.label, note: m.note, unit: m.unit, qty: m.qty })),
  ];
  return rows.map((r) => ({ ...r, costPerAttempt: r.unit == null ? null : r.unit * r.qty, qtyN: r.qty * n, costN: r.unit == null ? null : r.unit * r.qty * n }));
});
const variantRows = computed(() => (showAllVariants.value ? c.variants.value : c.variants.value.slice(0, 12)));
/** 比較表は横に収めるため短い名前にする (フル名は title) */
const shortExalt: Record<string, string> = { normal: "通常", greater: "上級", perfect: "完全" };
const shortEssence = (label: string): string => label.match(/\((.+)\)$/)?.[1] ?? label.replace("のグレーターエッセンス", "");
/** エッセンスを選べるレシピだけエッセンスの列を出す */
const essenceCol = computed(() => c.essences.value.filter((e) => e.ok).length > 1);
const shortRune = (label: string): string => (label === "ルーンなし" ? "—" : label.replace(/ \(.+\)$/, "").replace("のグレータールーン", " G").replace("のパーフェクトルーン", " P").replace("ファルウルの追跡のルーン", "追跡"));

</script>

<template>
  <section class="@container min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-3">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">規格外の賭け</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        規格外 (ルーンソケット 2) のマジックベース → グレーターエッセンス → 肋骨で冒涜 → 高貴なオーブ + 偉大なる高貴なお告げで 2 つ足す → ルーン ×2、の収支。
        どこまで伸びるかは poe2db の推定重み × クライアントのティア値で 2 万回試し、trade2 の「売値の段」(ソケット 2 のレア) で売った時の期待収支を出します。
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
          <select v-model="c.recipeId.value" class="num w-40">
            <option v-for="r in c.RECIPES" :key="r.id" :value="r.id">{{ r.label }}</option>
          </select>
        </label>
        <label v-if="c.recipe.value.pages.length > 1" class="inline-flex items-center gap-2">
          防御タイプ
          <select v-model="c.pageId.value" class="num w-64 max-w-full">
            <option v-for="p in c.recipe.value.pages" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </label>
        <span class="px-1.5 py-0.5 rounded border border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)]">規格外 · ソケット 2</span>
      </div>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-1">{{ c.recipe.value.note }}</p>
    </header>

    <div class="grid grid-cols-1 @6xl:grid-cols-2 gap-4 mb-4">
      <!-- 相場 (trade2 自動) -->
      <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">相場 (trade2)</h2>
            <button
              type="button"
              :disabled="refetch.disabled"
              class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[11px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors tabular-nums"
              @click="c.fetchPrices(c.missingCount.value === 0)"
            >
              <span aria-hidden="true">⟳</span>
              {{ refetch.label }}
            </button>
          </div>
          <p v-if="c.missingCount.value > 0 && !c.pricing.value" class="text-[10px] text-[var(--exile-color-text-tertiary)] mb-2">
            画面を開いただけでは取りに行きません (レート制限に当たるため)。条件を決めてから「取得」を押してください。
          </p>
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
              <select v-model.number="attempts" class="num w-20">
                <option v-for="n in ATTEMPT_OPTIONS" :key="n" :value="n">{{ n }} 回</option>
              </select>
            </label>
          </div>
          <div class="mb-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px]">
            <span v-if="c.autoBest.value" class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">{{ c.bestVariant.value ? "一番収支がいい組み合わせを表示中" : "相場が揃ったら一番収支がいい組み合わせに切り替えます" }}</span>
            <template v-else>
              <span class="text-[var(--exile-color-text-tertiary)]">手で選んだ組み合わせ</span>
              <button type="button" class="underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="c.autoBest.value = true">一番収支がいい組み合わせに戻す</button>
            </template>
            <span v-if="c.bestVariant.value" class="text-[var(--exile-color-text-secondary)]">最も得な組み合わせの期待収支 <span class="tabular-nums" :class="evClass(c.bestVariant.value.ev)">{{ money(c.bestVariant.value.ev, true) }}</span></span>
          </div>
          <div class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 items-center text-[11px] text-[var(--exile-color-text-secondary)] mb-3">
            <label>ベースの MOD</label>
            <select v-model.number="c.baseTier.value" class="num w-full min-w-0">
              <option v-for="t in c.tiers.value" :key="t.tier" :value="t.tier">{{ c.recipe.value.baseMod.label }} {{ t.min }}〜{{ t.max }} (T{{ t.tier }} · MOD レベル {{ t.level }})</option>
            </select>
            <label>エッセンス</label>
            <select v-model="c.essenceId.value" class="num w-full min-w-0">
              <option v-for="e in c.essences.value" :key="e.id" :value="e.id" :disabled="!e.ok">{{ e.label }}{{ e.range ? ` ${e.range.min}〜${e.range.max}` : "" }}{{ e.ok ? "" : ` (${e.reason})` }}</option>
            </select>
            <label>肋骨</label>
            <select v-model="c.rib.value" class="num w-full min-w-0">
              <option v-for="o in c.RIBS" :key="o.id" :value="o.id">{{ o.label }}{{ o.minLevel ? ` (候補を MOD レベル ${o.minLevel} 以上に絞る)` : "" }}</option>
            </select>
            <label>反響</label>
            <select v-model="c.echo.value" class="num w-full min-w-0">
              <option v-for="o in c.ECHOES" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
            <label>高貴なオーブ</label>
            <select v-model="c.exalt.value" class="num w-full min-w-0">
              <option v-for="o in c.EXALTS" :key="o.id" :value="o.id">{{ o.label }} + 偉大なる高貴なお告げ ({{ o.note }})</option>
            </select>
            <label>お告げ</label>
            <select v-model="c.side.value" class="num w-full min-w-0">
              <option v-for="o in c.SIDES" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
            <template v-if="c.effectiveCount.value < c.EXALT_ADDS">
              <span></span>
              <span class="text-amber-300">空きが {{ c.effectiveCount.value }} つしか無いので {{ c.effectiveCount.value }} つだけ足します</span>
            </template>
            <label>ルーン</label>
            <select v-model="c.runeId.value" class="num w-full min-w-0">
              <option v-for="o in c.recipe.value.runes" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </div>
          <table class="w-full text-[12px] break-words">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">素材</th>
                <th class="text-right font-normal pb-1 pl-2">単価</th>
                <th class="text-right font-normal pb-1 pl-2">1 回の数</th>
                <th class="text-right font-normal pb-1 pl-2">1 回の費用</th>
                <th class="text-right font-normal pb-1 pl-2">{{ attempts }} 回の数</th>
                <th class="text-right font-normal pb-1 pl-2">{{ attempts }} 回の費用</th>
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
          <div class="grid grid-cols-2 @3xl:grid-cols-4 gap-3 text-[12px]">
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

          <table class="mt-3 text-[12px] w-full max-w-4xl break-words">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">売値の段</th>
                <th class="text-right font-normal pb-1 pl-2">条件を満たす確率</th>
                <th class="text-right font-normal pb-1 pl-2">この段で売る確率</th>
                <th class="text-right font-normal pb-1 pl-2">売値</th>
                <th class="text-right font-normal pb-1 pl-2">期待売上への寄与</th>
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
              <tr class="border-t border-[var(--exile-color-border-subtle)] tabular-nums">
                <td class="py-1 pr-2">外れの条件にも届かない (売れない扱い)</td>
                <td></td>
                <td class="py-1 pl-2 text-right">{{ pct(c.result.value.below.pSold) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(0) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(0) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-[var(--exile-color-text-secondary)]">
            <span v-for="m in c.recipe.value.metrics" :key="m">{{ METRIC_LABEL[m] }} の平均 <span class="tabular-nums text-[var(--exile-color-text-primary)]">{{ Math.round(c.result.value.means[m]) }}{{ METRIC_UNIT[m] }}</span></span>
            <span>冒涜のあとの空き: 接頭辞 {{ c.slots.value.prefixOpen }} / 接尾辞 {{ c.slots.value.suffixOpen }}</span>
            <span>高貴なオーブで足す MOD: {{ c.effectiveCount.value }} つ</span>
            <span v-if="c.echo.value === 'echoes'">反響で引き直す割合 <span class="tabular-nums text-[var(--exile-color-text-primary)]">{{ pct(c.sim.value.pReroll) }}</span></span>
          </div>

          <div class="mt-3 rounded border border-[var(--exile-color-border-subtle)] p-3 text-[12px] max-w-3xl">
            <div class="flex items-baseline justify-between mb-1 gap-2 flex-wrap">
              <span class="font-display tracking-[0.04em]">{{ attempts }} 回やった場合</span>
              <label class="text-[11px] text-[var(--exile-color-text-secondary)] inline-flex items-center gap-2">
                回数
                <select v-model.number="attempts" class="num w-20">
                  <option v-for="n in ATTEMPT_OPTIONS" :key="n" :value="n">{{ n }} 回</option>
                </select>
              </label>
            </div>
            <div v-if="atN" class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1">
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
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">選択肢の比較 (エッセンス × 肋骨 × 反響 × 高貴なオーブ × お告げ × ルーン)</h2>
          <span class="text-[11px] text-[var(--exile-color-text-secondary)]">期待収支の高い順。ベースは上の選択のまま。高貴なオーブは毎回 偉大なる高貴なお告げ と一緒に 1 個使って 2 つ足す</span>
        </div>
        <p v-if="c.variants.value.length === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)]">相場が揃うと出ます (不足: {{ c.missing.value.join("、") || "取得中" }})</p>
        <template v-else>
          <table class="w-full text-[12px] break-words">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th v-if="essenceCol" class="text-left font-normal pb-1 pr-2">エッセンス</th>
                <th class="text-left font-normal pb-1">冒涜</th>
                <th class="text-left font-normal pb-1 pl-2">高貴なオーブ</th>
                <th class="text-left font-normal pb-1 pl-2">ルーン</th>
                <th class="text-right font-normal pb-1 pl-2">1 回の費用</th>
                <th class="text-right font-normal pb-1 pl-2">期待売上</th>
                <th class="text-right font-normal pb-1 pl-2">期待収支</th>
                <th class="text-right font-normal pb-1 pl-2">黒字の確率</th>
                <th class="text-right font-normal pb-1 pl-2">一番高い段</th>
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
                <td v-if="essenceCol" class="py-1 pr-2" :title="v.labels.essence">{{ shortEssence(v.labels.essence) }}</td>
                <td class="py-1 pr-2" :title="`${v.labels.rib} / 反響: ${v.labels.echo}`">{{ v.rib === "ancient" ? "古代" : "保存" }}{{ v.echo === "echoes" ? " + 反響" : "" }}</td>
                <td class="py-1 pl-2" :title="`${v.labels.exalt} + 偉大なる高貴なお告げ / ${v.labels.side}`">{{ shortExalt[v.exalt] }}{{ v.side === "suffix" ? " 右側" : "" }}{{ v.count < c.EXALT_ADDS ? ` (${v.count} つ)` : "" }}</td>
                <td class="py-1 pl-2" :title="v.labels.rune">{{ shortRune(v.labels.rune) }}</td>
                <td class="py-1 pl-2 text-right">{{ money(v.cost) }}</td>
                <td class="py-1 pl-2 text-right">{{ money(v.expectedSale) }}</td>
                <td class="py-1 pl-2 text-right" :class="evClass(v.ev)">{{ money(v.ev, true) }}</td>
                <td class="py-1 pl-2 text-right">{{ pct(v.pProfit) }}</td>
                <td class="py-1 pl-2 text-right">{{ pct(v.pTop) }}</td>
                <td class="py-1 pl-2 text-right">
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
            冒涜 = 肋骨 (保存 / 古代) と アビスの反響のお告げ の有無。古代の肋骨は冒涜の候補を MOD レベル 40 以上に絞る (通常の MOD の低いティアが出なくなる)。反響は最初の 3 択の一番いい物が「引き直した時の平均」より悪ければ引き直す。
            高貴なオーブの「右側」= 右側の高貴なお告げ (接尾辞だけに付ける)。一番高い段 = 取れた売値が一番高い段で売る確率。比較表は 2,500 回ずつの試算なので、上の「1 回あたり」(2 万回) と少しずれます。
          </p>
          <p v-if="c.unpricedOptions.value.length" class="text-[11px] text-amber-300 mt-1">相場が無いので比較に出ていない素材: {{ c.unpricedOptions.value.join("、") }}</p>
        </template>
      </div>
    </BaseCard>

    <!-- 収支 (実績入力、回数で素材欄の組み合わせを埋める 2026-09-14) -->
    <LedgerPanel :c="c" />
    <AssumptionsPanel :c="c" />

    <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">
      素材価格: カレンシーランキングの相場 (poe2scout 由来) · ベースと売値: trade2 (JP API、ソケット 2、検索は 10 秒間隔、条件ごとに 5 回) · 重み: poe2db (推定) · ティア値: ゲームクライアント
    </p>
  </section>
</template>

