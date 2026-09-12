<!--
  Overquality.vue — アドニアの賭け (2026-09-12、オーナー指示でアドニア専用)
  吸収のワンドを品質 20% を超えて (最大 30%) 育て、可能性のお告げ + 可能性のオーブでアドニアのエゴにする。
  ベースと彫刻針は失敗のたびに消え、お告げとオーブは成功したベースにしか使わない。完成品 1 個あたりの実質コストと利益を出す。
    views/overquality/model.ts          品質の階段を状態遷移で解く (純粋関数)
    views/overquality/useOverquality.ts プリセット / 相場 / 入力
-->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { openExternal } from "../services/trade2/open-external";
import BaseCard from "../components/decor/BaseCard.vue";
import { useOverquality } from "./overquality/useOverquality";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import { displayCurrency } from "../state/display-currency";
const money = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed });
const unit = displayCurrency.label;

async function open(url: string | null): Promise<void> {
  await openExternal(url);
}

const o = useOverquality();
onMounted(() => {
  void o.loadMarket();
});
const showAssumptions = ref(false);
const showLadder = ref(false);

function pct(p: number): string {
  return `${(p * 100).toFixed(p * 100 >= 10 ? 1 : 2)}%`;
}
function evClass(v: number | null): string {
  if (v == null) return "text-[var(--exile-color-text-tertiary)]";
  return v > 0 ? "text-emerald-300" : v < 0 ? "text-red-300" : "";
}
</script>

<template>
  <section class="min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-3">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">アドニアの賭け</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        吸収のワンドをヴァールアルカニストのインフューザーで品質 20% より上 (最大 30%) に育て、可能性のお告げ + 可能性のオーブでアドニアのエゴにするクラフトの収支。
        20% を超えた分だけコラプト化の危険があり、コラプトしたワンドは失敗です。完成品 1 個あたりの実質コストで判定します。
      </p>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
        素材価格: カレンシーランキングの相場{{ o.league.value ? ` (${o.league.value.Value})` : "" }} · {{ o.marketLabel.value }} / 通貨の説明: ゲームクライアント / コラプト確率は非公開 (プレイヤー計測値、変更可)
        <span v-if="o.marketError.value" class="text-amber-300">— poe2scout 取得失敗: {{ o.marketError.value }}</span>
      </p>
      <div class="mt-1"><CurrencyPicker /></div>
    </header>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
      <!-- 入力 -->
      <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">入力</h2>
            <button
              type="button"
              :disabled="o.pricing.value || o.tradeAuto.rateLimitSecs.value > 0 || (!o.baseEn.value && !o.uniqueEn.value)"
              class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[11px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              @click="o.fetchPrices"
            >
              <span aria-hidden="true">⟳</span>
              {{ o.pricing.value ? "trade2 で検索中…" : o.tradeAuto.rateLimitSecs.value > 0 ? `レート制限中 (${o.tradeAuto.rateLimitSecs.value} 秒)` : "trade2 で取り直す" }}
            </button>
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
            <span class="tabular-nums text-[13px] text-right" :class="o.autoBasePrice.value == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ o.autoBasePrice.value == null ? (o.pricing.value ? "取得中…" : "—") : money(o.autoBasePrice.value) }}</span>
            <label>
              <div>インフューザーとお告げの値段</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">poeindex の固定値 (インフューザー 0.10 神 / お告げ 12 神) か、取引所の実売か</div>
            </label>
            <select v-model="o.priceSource.value" class="num text-left w-48">
              <option value="index">poeindex の固定値</option>
              <option value="market">取引所の実売</option>
            </select>
            <label>
              <div>目標品質</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">最大品質を最大 10% まで超過できる (クライアント)</div>
            </label>
            <input v-model.number="o.targetQuality.value" type="number" min="21" max="30" step="1" class="num w-28" />
            <label>
              <div>{{ o.preset.value.qualityCurrencyJa }} の必要数 (0 → 20%)</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">ベース 1 個あたり。poeindex は約 14 本。単価は右の素材表</div>
            </label>
            <input v-model.number="o.qualityCurrencyCount.value" type="number" min="0" step="1" class="num w-28" />
            <label>
              <div>
                完成品の売値 ({{ o.preset.value.uniqueJa }} · 品質 {{ o.targetQuality.value }}% 以上 · ソケット 2 · 未コラプト)
                <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" :disabled="!o.saleTradeUrl.value" @click="open(o.saleTradeUrl.value)">トレード2へ ↗</button>
              </div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">
                trade2 の「品質 {{ o.targetQuality.value }}% 以上 · ソケット 2 · 未コラプト」の最安<span v-if="o.autoSalePrice.value == null && o.auto.value.uniqueRef != null">。取れるまではカレンシーランキングの品質不問の値</span>
              </div>
            </label>
            <span class="tabular-nums text-[13px] text-right" :class="o.salePrice.value == null ? 'text-[var(--exile-color-text-tertiary)]' : ''">{{ o.salePrice.value == null ? (o.pricing.value ? "取得中…" : "—") : money(o.salePrice.value) }}</span>
          </div>
        </div>
      </BaseCard>

      <!-- 素材 -->
      <BaseCard>
        <div class="p-4 pl-5">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-2">素材 (1 個、{{ unit }})</h2>
          <table class="w-full text-[12px]">
            <tbody>
              <tr class="border-b border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>{{ o.preset.value.qualityCurrencyJa }}</div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">品質を向上させる (20% まで)</div>
                </td>
                <td class="py-1.5 text-right tabular-nums whitespace-nowrap">{{ money(o.auto.value.qualityCurrency) }}</td>
              </tr>
              <tr class="border-b border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>{{ o.preset.value.infuserJa }}</div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">
                    品質を向上させる。最大品質を最大 10% まで超過できるが、一定確率でコラプト化する
                    <span v-if="o.priceSource.value === 'index'">· poeindex 固定値 (実売 {{ money(o.market.value.infuser) }})</span>
                    <span v-else>· 取引所の実売 (poeindex 固定値 {{ money(o.index.value.infuser) }})</span>
                  </div>
                </td>
                <td class="py-1.5 text-right tabular-nums whitespace-nowrap">{{ money(o.auto.value.infuser) }}</td>
              </tr>
              <tr class="border-b border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>可能性のお告げ</div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">
                    次回使用する可能性のオーブはアイテムを破壊しない。成功したベースにだけ使う
                    <span v-if="o.priceSource.value === 'index'">· poeindex 固定値 (実売 {{ money(o.market.value.omen) }})</span>
                    <span v-else>· 取引所の実売 (poeindex 固定値 {{ money(o.index.value.omen) }})</span>
                  </div>
                </td>
                <td class="py-1.5 text-right tabular-nums whitespace-nowrap">{{ money(o.auto.value.omen) }}</td>
              </tr>
              <tr>
                <td class="py-1.5 pr-2">
                  <div>可能性のオーブ</div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">ノーマルアイテムをユニークにアップグレードするか破壊する (お告げで破壊が無くなる)</div>
                </td>
                <td class="py-1.5 text-right tabular-nums whitespace-nowrap">{{ money(o.auto.value.chance) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </BaseCard>
    </div>

    <!-- 判定 -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-2">完成品 1 個あたり</h2>
        <template v-if="o.result.value.ok">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
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

    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <button type="button" class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-center gap-2" @click="showAssumptions = !showAssumptions">
          <span>{{ showAssumptions ? "▲" : "▼" }}</span>
          <span>前提 (確率は非公開。プレイヤー計測の既定値、ここで変えられます)</span>
        </button>
        <div v-if="showAssumptions" class="mt-3 text-[12px] space-y-2">
          <div class="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 items-center w-max">
            <label>インフューザー 1 回で +2 になる確率</label><input v-model.number="o.params.value.plusTwoChance" type="number" min="0" max="1" step="0.05" class="num w-24" />
            <label>品質 1 ポイント超過ごとのコラプト確率の増分</label><input v-model.number="o.params.value.brickRatePerPoint" type="number" min="0" max="1" step="0.001" class="num w-24" />
          </div>
          <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="o.resetParams">既定値に戻す</button>
          <p class="text-[11px] text-[var(--exile-color-text-tertiary)] leading-relaxed">
            品質 q (20 以上) でインフューザーを使うと、コラプト確率 = 増分 × (q − 20)。20% ちょうどからの 1 回目は 0 で、21% で約 5%、29% で約 47% (既定)。
            コラプトしなければ +1 (既定 80%) か +2 (20%)、目標を超えた分は目標で止まります。既定の増分 0.052 はコミュニティのインフューザー使用ログ (約 2,300 回) から出た値で、20 → 30 の生存率は約 9.8% になります。
            クライアントにあるのは「最大品質を最大 10% まで超過できるが、一定確率でコラプト化する」の説明文までです。
          </p>
        </div>
      </div>
    </BaseCard>
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
