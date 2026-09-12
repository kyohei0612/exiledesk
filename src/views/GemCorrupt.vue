<!--
  GemCorrupt.vue — ジェムコラプトの賭け (2026-09-12、「ヴァールの天秤」の 1 つ)
  ジェムを選ぶ → 売値 3 つ (レベル 21 / 品質 23% / 完成品) を trade2 で取る or 手入力 →
  自作 / 21 を買って賭け / 23% を買って賭け / 完成品を買う の 4 経路を「1 回あたりの期待収支」で比べる (完成品 1 個の実質コストも併記)。
    views/gem-corrupt/model.ts         期待値モデル (純粋関数)
    views/gem-corrupt/useGemCorrupt.ts 状態 / 相場 / trade2
    i18n/gems-client.json              ジェム一覧 (GGG クライアント由来)
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { openExternal } from "../services/trade2/open-external";
import BaseCard from "../components/decor/BaseCard.vue";
import { SALE_ROWS, useGemCorrupt } from "./gem-corrupt/useGemCorrupt";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import MoneyInput from "../components/vaal-scales/MoneyInput.vue";
import { displayCurrency } from "../state/display-currency";
const money = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed });
const unit = displayCurrency.label;
import type { RouteResult } from "./gem-corrupt/model";

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
const rateLimitSecs = computed(() => g.tradeAuto.rateLimitSecs.value);
async function open(url: string | null): Promise<void> {
  await openExternal(url);
}
function isBest(r: RouteResult): boolean {
  return !!g.best.value && g.best.value.id === r.id;
}
function onQueryInput(): void {
  listOpen.value = true;
  if (g.selected.value && g.query.value !== g.selected.value.ja) g.selected.value = null;
}

/** 素材の説明 (GGG クライアント CurrencyItems.Description の日本語、2026-09-12 書き出し) */
const MATERIAL_DESC: Record<string, string> = {
  gcp: "スキルジェムの品質を向上させる。",
  perfectJeweller: "スキルジェムに5個のサポートジェムソケットをセットする。",
  vaal: "アイテムをコラプトし、予測不能な変化を与える。",
  crystal: "コラプト状態のスキルジェムを予測不可能に変化させるか、または破壊する。",
  uncut20: "ジェムを生成するか既存のジェムのレベルをレベル20に上げる",
};
const materialRows = computed(() => {
  const m = g.materials.value;
  return [
    { key: "baseGem", label: "低レベルのジェム本体", price: m.baseGem, editable: true, qty: 1 },
    { key: "gcp", label: "宝石細工師のプリズム", price: m.gcp, editable: false, qty: 4 },
    { key: "perfectJeweller", label: "宝飾職人のオーブ (完全)", price: m.perfectJeweller, editable: false, qty: 1 },
    { key: "vaal", label: "ヴァールオーブ", price: m.vaal, editable: false, qty: 1 },
    { key: "crystal", label: "コラプトの結晶", price: m.crystal, editable: false, qty: 1 },
    { key: "uncut20", label: g.uncutLabel.value, price: m.uncut20, editable: false, qty: 1 },
  ];
});
</script>

<template>
  <section class="min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
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
          />
          <ul
            v-if="listOpen && !g.selected.value && g.matches.value.length > 0"
            class="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] shadow-lg"
          >
            <li
              v-for="m in g.matches.value"
              :key="m.en"
              class="px-2 py-1 text-[13px] cursor-pointer hover:bg-[var(--exile-color-bg-surface)] flex items-baseline gap-2"
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

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
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
                :disabled="!g.selected.value || g.pricing.value || rateLimitSecs > 0"
                class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                @click="g.fetchSalePrices"
              >
                <span aria-hidden="true">⟳</span>
                {{ g.pricing.value ? "trade2 で検索中… (3 件、約 30 秒)" : rateLimitSecs > 0 ? `レート制限中 (${rateLimitSecs} 秒)` : "再取得" }}
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
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-2">素材 (1 個、{{ unit }})</h2>
          <table class="w-full text-[12px]">
            <tbody>
              <tr v-for="m in materialRows" :key="m.key" class="border-t border-[var(--exile-color-border-subtle)] first:border-t-0">
                <td class="py-1.5 pr-2">
                  <div>{{ m.label }}<span v-if="m.qty > 1" class="text-[var(--exile-color-text-tertiary)]"> ×{{ m.qty }}</span></div>
                  <div v-if="MATERIAL_DESC[m.key]" class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ MATERIAL_DESC[m.key] }}</div>
                </td>
                <td class="py-1.5 text-right tabular-nums w-28">
                  <MoneyInput v-if="m.editable" v-model="g.baseGemPrice.value" />
                  <span v-else class="whitespace-nowrap" :class="m.price == null ? 'text-amber-300' : ''">{{ m.price == null ? "相場なし" : money(m.price) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            原石 (レベル 20) は「売る物」にだけ掛かります。壊れた物や売らない物には掛かりません。低レベルのジェム本体は相場が無いので手入力です。
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
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
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
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-3">
          「1 回の期待収支」は 1 回試して出来た物を全部売った時の平均損益で、完成品を買う経路が 0 の基準。これで「最も得」を決めます。
          実質コスト = (費用の期待値 − 完成品以外で回収できる期待額) ÷ 完成品になる確率。自作で片方だけ売る戦略の時は完成率 0 なので出ません。
        </p>
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
        <div v-if="showAssumptions" class="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4 text-[12px]">
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
          <div class="lg:col-span-2 text-[11px] text-[var(--exile-color-text-tertiary)] leading-relaxed">
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
