<!--
  MaterialsPanel.vue — 素材 (自作の 1 回あたりの数と費用、N 回分)
  2026-09-19 に GemCorrupt.vue から切り出した。中身は変えていない。
-->
<script setup lang="ts">
import AttemptsSelect from "../../components/AttemptsSelect.vue";
import { fetchBusyKind, fetchBusyLabel, fetchBusy as sweepBusy } from "../../state/fetch-busy";
import { computed } from "vue";
import BaseCard from "../../components/decor/BaseCard.vue";
import { currencyJa, roundMoney } from "../../state/display-currency";
import { openExternal } from "../../services/trade2/open-external";
import { MATERIAL_DESC, cost, fmtBuy, fmtStamp, money, moneyFixed, unit } from "./ui";
import { fmtQty } from "./ledger";
import type { useGemCorrupt } from "./useGemCorrupt";

const props = defineProps<{ g: ReturnType<typeof useGemCorrupt> }>();
const g = props.g;
/** 「N 回やった場合」の N。経路の札と同じ値を見る (親が持っていて、どちらから変えても揃う) */
const attempts = defineModel<number>("attempts", { required: true });
async function open(url: string | null): Promise<void> {
  await openExternal(url);
}

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
    { key: "baseGem", label: g.baseGemLabel.value, price: m.baseGem, editable: false, perAttempt: 1, expected: false },
    { key: "gcp", label: "宝石細工師のプリズム", price: m.gcp, editable: false, perAttempt: 4, expected: false },
    { key: "perfectJeweller", label: "宝飾職人のオーブ (完全)", price: m.perfectJeweller, editable: false, perAttempt: 1, expected: false },
    { key: "vaal", label: "ヴァールオーブ", price: m.vaal, editable: false, perAttempt: 1, expected: false },
    { key: "crystal", label: "コラプトの結晶", price: m.crystal, editable: false, perAttempt: c?.ok ? (c.expectedCrystals ?? 0) : null, expected: true },
    { key: "uncut20", label: g.uncutLabel.value, price: m.uncut20, editable: false, perAttempt: c?.ok ? (c.expectedUncut ?? 0) : null, expected: true },
  ];
  const apiIdOf = new Map(g.materialApiIds.value.map((m) => [m.key, m.apiId]));
  return rows.map((r) => {
    const qtyN = r.perAttempt == null ? null : r.perAttempt * n;
    const apiId = apiIdOf.get(r.key) ?? null;
    const buy = g.bestBuy(apiId);
    // オーナー指示 (2026-09-16): 行の単価と費用は「買う通貨」の単位で出す。合計だけ表示通貨に換算する。
    // ただし相場の方が安ければ計算は相場を使う (materials.ts の withExchange) ので、行もそれに合わせる
    // (取引所の値を無条件に出していて、行の合計と「合計 (期待)」が食い違っていた。2026-09-18 レビュー指摘)
    const marketCheaper = !!buy && r.price != null && r.price < buy.exalted;
    const unitAmount = buy && !marketCheaper ? buy.perUnit : null;
    const unitCurrency = buy && !marketCheaper ? buy.currency : null;
    return {
      ...r,
      apiId,
      // 取引所で一番安く買える通貨 (取っていなければ null)
      buy,
      unitAmount,
      unitCurrency,
      marketCheaper,
      // 現物を買う素材は「最安 1 件 × N」ではなく最安から N 件の合計 (オーナー指示 2026-09-19)
      buyTotal: r.key === "baseGem" && qtyN != null ? g.baseBuyTotalFor(Math.ceil(qtyN)) : null,
      // 費用は**切り上げた単価**で数え直す (オーナー指示 2026-09-20:「丸めた単価で計算し直す」
      // 「基本経費は多く、収入は厳しくのスタンス」)。表示と縦の掛け算が必ず合う
      unitUp: r.price == null ? null : (roundMoney(r.price, "up")?.exalted ?? r.price),
      costPerAttempt:
        r.price == null || r.perAttempt == null ? null : (roundMoney(r.price, "up")?.exalted ?? r.price) * r.perAttempt,
      qtyN,
      costN: r.price == null || qtyN == null ? null : (roundMoney(r.price, "up")?.exalted ?? r.price) * qtyN,
      // 買う通貨建ての費用 (取引所を取っていれば)
      buyCostPerAttempt: unitAmount == null || r.perAttempt == null ? null : unitAmount * r.perAttempt,
      buyCostN: unitAmount == null || qtyN == null ? null : unitAmount * qtyN,
    };
  });
});
/** 単価を固定した時刻 (MM/DD HH:mm) */
/**
 * 現物を買うジェムの「低レベルのジェム本体」のホバー文 (何件の中の最安か・いつ取ったか)。
 * テンプレートの属性の中でテンプレート文字列を入れ子にすると引用符が属性を閉じてしまうので、ここで組む
 */
const baseBuyTitle = computed(() => {
  const i = g.baseBuyInfo.value;
  if (!i) return "";
  const n = i.total != null ? ` ${i.total} 件` : "";
  return `トレードの現物 (コラプト無し・二重コラプト無し、即時購入の出品${n}) の最安 ${money(i.exalted)}。${fmtStamp(i.at)} 取得。「再取得」で取り直します`;
});
</script>

<template>
      <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">素材 (自作、{{ unit }})</h2>
            <!-- 取引所の比較はジェムを選んだ時に自動で走るので、ボタンは置かない
                 (オーナー指示 2026-09-20:「取引所価格がデフォだから、別にもうボタンいらんくね」)。
                 取っている間だけ進み具合を出す -->
            <span v-if="g.exchangeLoading.value" class="text-[11px] text-[var(--exile-color-text-secondary)]">
              取引所で比較中… ({{ g.exchangeDone.value }}/{{ g.materialApiIds.value.length }})
            </span>
            <label class="text-[11px] text-[var(--exile-color-text-secondary)] inline-flex items-center gap-2">
              回数
              <AttemptsSelect v-model="attempts" />
            </label>
          </div>
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">素材</th>
                <th class="text-right font-normal pb-1 pl-2 whitespace-nowrap">単価 (取引所)</th>
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
                  <!-- 低レベルのジェム本体: 原石から作るか、トレードで現物を買うか (カルグール系は現物。2026-09-19) -->
                  <div v-if="m.key === 'baseGem'" class="text-[10px] text-[var(--exile-color-text-tertiary)] flex items-center gap-2 flex-wrap">
                    <span>{{ g.baseSource.value === "buy" ? "原石から作れないので、トレードで現物 (コラプト無し・二重コラプト無し) の最安を使う" : MATERIAL_DESC.baseGem }}</span>
                    <button
                      type="button"
                      class="underline hover:text-[var(--exile-color-accent-focus)]"
                      :title="g.baseSource.value === 'buy' ? '原石 (レベル 15〜20 の最安) から作る計算に切り替えます' : 'トレードで現物 (コラプト無し) を買う計算に切り替えます (原石から作れないジェム用)'"
                      @click="g.setBaseSource(g.baseSource.value === 'buy' ? 'uncut' : 'buy')"
                    >
                      {{ g.baseSource.value === "buy" ? "原石から作る に切替" : "現物を買う に切替" }}
                    </button>
                    <!-- 現物を買う時は、売値の行と同じようにトレードサイトへ (同じ条件: コラプト無し・二重なし・即時購入) -->
                    <button
                      v-if="g.baseSource.value === 'buy'"
                      type="button"
                      class="underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]"
                      title="同じ条件 (コラプト無し・二重コラプト無し・即時購入) でトレードサイト (JP) を開く。API は使わない"
                      @click="open(g.baseTradeUrl())"
                    >
                      トレード2へ ↗
                    </button>
                  </div>
                  <div v-else-if="MATERIAL_DESC[m.key]" class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ MATERIAL_DESC[m.key] }}</div>
                </td>
                <!-- 値段が入っている行は緑 (オーナー指示 2026-09-20:「前の緑にしようか、水色じゃなくて」)。
                     相場なしだけ琥珀にして、取れていないことが分かるようにする -->
                <td
                  class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap"
                  :class="m.price != null || m.unitAmount != null ? 'text-emerald-300' : 'text-amber-300'"
                  :title="
                    m.unitAmount != null && m.buy
                      ? `取引所の最安 ${m.buy.rawPerUnit} ${currencyJa(m.unitCurrency)} / 個 → 実際に払う ${m.unitAmount} ${currencyJa(m.unitCurrency)} (${money(m.buy.exalted)})`
                      : m.marketCheaper && m.buy
                        ? `取引所で比べた結果、相場 (${money(m.price)}) の方が取引所 (${m.buy.rawPerUnit} ${currencyJa(m.buy.currency)} / 個 → 繰り上げて ${money(m.buy.exalted)}) より安いので、相場で買う前提で計算します`
                        : m.price != null
                          ? m.key === 'baseGem' && baseBuyTitle
                            ? baseBuyTitle
                            : `カレンシーランキングの相場 (${money(m.price)})。取引所の板が薄い素材は取引所の値が出ないので、相場のままです`
                          : '相場なし'
                  "
                >
                  <template v-if="m.unitAmount != null">{{ fmtBuy(m.unitAmount) }} {{ currencyJa(m.unitCurrency) }}</template>
                  <template v-else-if="m.price != null">{{ cost(m.price) }}</template>
                  <!-- 現物を買うジェムで値段がまだ無い時は、その場で取りに行けるボタンを出す (オーナー指示 2026-09-20) -->
                  <template v-else-if="m.key === 'baseGem' && g.baseSource.value === 'buy'">
                    <button
                      type="button"
                      :disabled="g.pricing.value || sweepBusy"
                      class="px-2 py-0.5 rounded border border-amber-500/70 bg-amber-500/15 text-amber-200 text-[11px] hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
                      :title="sweepBusy ? `${fetchBusyKind}が終わるまで押せません (同じトレードの枠を使うため)` : g.retryWhenFree.value ? 'トレードの枠が空いたら自動で取りますが、今すぐ取りに行くこともできます' : 'トレードで現物 (コラプト無し・二重コラプト無し) の最安を取りに行きます'"
                      @click="g.fetchSalePrices(true)"
                    >
                      {{ g.pricing.value ? "取得中…" : sweepBusy ? fetchBusyLabel : g.retryWhenFree.value ? "値段を取る (順番待ち中)" : "値段を取る" }}
                    </button>
                  </template>
                  <template v-else>相場なし</template>
                </td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ fmtQty(m.perAttempt) }}<span v-if="m.expected && m.perAttempt != null" class="text-[10px] text-[var(--exile-color-text-tertiary)]"> (期待)</span></td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">
                  <template v-if="m.buyCostPerAttempt != null">{{ fmtBuy(m.buyCostPerAttempt) }} {{ currencyJa(m.unitCurrency) }}</template>
                  <template v-else>{{ cost(m.costPerAttempt) }}</template>
                </td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ fmtQty(m.qtyN) }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">
                  <!-- 現物を買う素材は最安から N 件を積んだ合計 (1 件 × N ではない。2026-09-19) -->
                  <template v-if="m.buyTotal">
                    <span :title="`最安から ${attempts} 件の合計。取れている ${m.buyTotal.covered} 件ぶんは実際の値段、足りない分は一番高い値で埋めています`">{{ cost(m.buyTotal.total) }}</span>
                  </template>
                  <template v-else-if="m.buyCostN != null">{{ fmtBuy(m.buyCostN) }} {{ currencyJa(m.unitCurrency) }}</template>
                  <template v-else>{{ cost(m.costN) }}</template>
                </td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)] font-display tracking-[0.04em]">
                <td class="py-1.5 pr-2">合計 (期待)</td>
                <td></td>
                <td></td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ craft?.ok ? moneyFixed(craft.expectedCost) : "—" }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap text-[10px] text-[var(--exile-color-text-tertiary)]">{{ craft?.ok ? `完成 ${(attempts * craft.pFinished).toFixed(2)} 個` : "" }}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{{ craft?.ok ? moneyFixed(attempts * craft.expectedCost) : "—" }}</td>
              </tr>
            </tbody>
          </table>
        <!-- 長い説明は畳んでおく (オーナー指示 2026-09-20:「長ったらしい説明は閉じてて、
             仕組みを見るって感じでタイトル付けてデフォで閉じててほしい」) -->
        <details class="mt-2">
          <summary class="text-[11px] text-[var(--exile-color-text-tertiary)] cursor-pointer select-none hover:text-[var(--exile-color-accent-focus)]">
            単価の決め方と通貨の出し方
          </summary>
          <p class="text-[11px] leading-relaxed text-[var(--exile-color-text-tertiary)] mt-2">
            <span class="text-emerald-300">緑</span>は値段が入っている行です (<span class="text-amber-300">琥珀</span>は相場が取れていない行)。取引所で買う方が安ければ単価と費用をその通貨の単位で、相場の方が安ければ相場の値を出します。公式の取引所で カオス / 神 のうち安く買える方を出します (高貴は手数料が高いので外しています。ジェムを選んだ時に自動で取り、30 分は取り直しません)。取っていない素材はカレンシーランキングの相場 ({{ unit }} 建て) のままです。合計だけ選んだ表示通貨 ({{ unit }}) に換算します。<span class="text-[var(--exile-color-text-secondary)]">1 {{ unit }} 未満になる額は 1 つ下のカレンシーで出します</span> (神 → カオス → 高貴。0.02 神 のような読みにくい表記を避けるため)。
            単価は<span class="text-[var(--exile-color-text-secondary)]">実際に払う額に繰り上げ</span>ています (3.2 神 → 4 神)。通貨は 1 個単位でしか渡せないためで、費用も期待値もこの繰り上げ後の値で計算します (1 未満の単価は束で買う物なのでそのまま)。繰り上げた結果より相場の方が安い素材は相場のまま使います (その行は相場の値を出します)。
            仕上げ (レベル 20 に上げる) は「売る物」にだけ掛かります。壊れた物や売らない物には掛かりません。仕上げは調達先と揃えます: <span class="text-[var(--exile-color-text-secondary)]">原石から作るジェムは原石 (レベル 20)</span>、<span class="text-[var(--exile-color-text-secondary)]">現物を買うジェムは ソーマタージ・フラックス (レベル 20)</span> (原石ではレベルを上げられないため)。
            低レベルのジェム本体は、原石 (レベル 15〜20) のうち一番安い物の相場です。<span class="text-[var(--exile-color-text-secondary)]">原石から作れないジェム (カルグール系) は、トレードで現物 (コラプト無し・二重コラプト無し) の最安</span>を使います (行の切替で手で変えられます)。スキルの原石かスピリットの原石かは、<span class="text-[var(--exile-color-text-secondary)]">素のスキル (コラプト無し) の出品にスピリットのリザーブが出ているか</span>で決めます (一度見たら覚えます。まだ見ていないジェムはクライアントのタグから推定)。
            結晶は「片方当たった時に賭ける」と決めた場合だけ使うので、1 回の数は期待値 (賭けない判断なら 0)。売値が揃うまでは「—」。
          </p>
          </details>
        </div>
      </BaseCard>
</template>
