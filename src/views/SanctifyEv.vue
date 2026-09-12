<!--
  SanctifyEv.vue — 聖別の賭け (2026-09-12)
  神のオーブ + 聖別のお告げ: 各モッドの値がそれぞれ独立に 0.78〜1.22 倍 (既定、変更可) され、以後ほぼ加工不可。
  装備を貼り付け → モッドごとに ブリック値 / 目標値 / 大当たり値 → 4 区分 (ブリック / 現状維持 / 当たり / 大当たり) の
  確率と、区分ごとの売値から期待値。未聖別で売る場合と比べて判定する。
    views/sanctify/model.ts        分布と期待値 (純粋関数)
    views/sanctify/useSanctify.ts  状態 / 相場 / 貼り付け
    services/items/parse-item.ts   貼り付け解析
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { openExternal } from "../services/trade2/open-external";
import BaseCard from "../components/decor/BaseCard.vue";
import { useSanctify } from "./sanctify/useSanctify";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import MoneyInput from "../components/vaal-scales/MoneyInput.vue";
import { displayCurrency } from "../state/display-currency";
const money = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed });
const unit = displayCurrency.label;

async function open(url: string | null): Promise<void> {
  await openExternal(url);
}

const s = useSanctify();
onMounted(() => {
  void s.loadMarket();
});
const showAssumptions = ref(false);
const showDist = ref<Record<string, boolean>>({});

function fmt(n: number | null | undefined, digits?: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (digits != null) return n.toFixed(digits);
  const abs = Math.abs(n);
  return abs >= 100 ? n.toFixed(0) : abs >= 10 ? n.toFixed(1) : n.toFixed(2);
}
function pct(p: number): string {
  return `${(p * 100).toFixed(p * 100 >= 10 ? 0 : 1)}%`;
}
function evClass(v: number | null): string {
  if (v == null) return "text-[var(--exile-color-text-tertiary)]";
  return v > 0 ? "text-emerald-300" : v < 0 ? "text-red-300" : "";
}
async function pasteFromClipboard(): Promise<void> {
  try {
    const t = await navigator.clipboard.readText();
    if (t) {
      s.text.value = t;
      s.analyze();
    }
  } catch {
    /* クリップボード権限なし: 手貼りに任せる */
  }
}
const verdict = computed(() => {
  const r = s.result.value;
  if (r.ev == null) return { text: "売値を入れると判定が出ます", cls: "text-[var(--exile-color-text-tertiary)]" };
  if (r.vsSell == null) return { text: `聖別の期待収支 ${money(r.ev, true)}。「未聖別で売る値段」を入れると比較できます`, cls: "" };
  if (r.vsSell > 0) return { text: `聖別した方が得: 未聖別で売るより ${money(r.vsSell)} 上`, cls: "text-emerald-300" };
  return { text: `売った方が得: 聖別すると未聖別で売るより ${money(-r.vsSell)} 下`, cls: "text-red-300" };
});
</script>

<template>
  <section class="min-h-full flex flex-col px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-3">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">聖別の賭け</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        神のオーブ + 聖別のお告げ (次回レアアイテムに使用する神のオーブはそのアイテムを聖別する) の期待値。
        各モッドの値がそれぞれ独立にランダム倍率 (既定 0.78〜1.22 倍) で変わり、以後はほぼ加工できません。
      </p>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
        費用: poe2scout{{ s.league.value ? ` (${s.league.value.Value})` : "" }} · {{ s.marketLabel.value }} (カレンシーランキングと共有) の 神のオーブ {{ money(s.divinePrice.value) }} + 聖別のお告げ {{ money(s.omenPrice.value) }}
        = {{ money(s.cost.value) }} / 倍率の範囲は非公開 (コミュニティ観測値、変更可)
        <span v-if="s.marketError.value" class="text-amber-300">— poe2scout 取得失敗: {{ s.marketError.value }}</span>
      </p>
      <div class="mt-1"><CurrencyPicker /></div>
    </header>

    <!-- 貼り付け -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5 flex gap-3 items-start">
        <textarea
          v-model="s.text.value"
          rows="6"
          spellcheck="false"
          placeholder="ゲーム内で装備に Ctrl+C → ここに貼り付け (日本語 / 英語)"
          class="flex-1 font-mono text-[11px] p-2 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
        ></textarea>
        <div class="flex flex-col gap-2 w-56">
          <button
            type="button"
            class="px-3 py-1.5 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[13px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] transition-colors"
            @click="pasteFromClipboard"
          >
            クリップボードから貼り付け
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded border border-[var(--exile-color-border-subtle)] text-[13px] hover:bg-[var(--exile-color-bg-elevated)] transition-colors"
            @click="s.analyze"
          >
            解析
          </button>
          <label class="text-[11px] text-[var(--exile-color-text-secondary)] flex items-center gap-2">
            品質
            <input v-model.number="s.qualityPct.value" type="number" min="0" max="50" class="num w-16" />
            %
          </label>
          <p v-if="s.parseError.value" class="text-[11px] text-amber-300">{{ s.parseError.value }}</p>
          <p v-else-if="s.parsed.value" class="text-[11px] text-[var(--exile-color-text-secondary)]">
            {{ s.parsed.value.name || "" }} {{ s.parsed.value.baseJa || s.parsed.value.baseEn || "" }}
            <span v-if="s.parsed.value.corrupted" class="text-red-300">(コラプト)</span>
          </p>
        </div>
      </div>
    </BaseCard>

    <!-- モッド -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">モッド ({{ s.affixes.value.length }})</h2>
          <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="s.addAffix">
            + 手で追加
          </button>
        </div>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mb-2">
          値はアイテムに表示されている数字 (品質込み) を入れます。品質の影響を受けるモッドは「品質」にチェックすると実値に戻して計算します。
          「重要」を外したモッドは分布だけ出して判定に使いません。ブリック値未満 = 売り物にならない、目標値以上 = 当たり。
        </p>
        <div v-if="s.affixes.value.length === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)] italic">装備を貼り付けるか、手で追加してください。</div>
        <table v-else class="w-full text-[12px]">
          <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
            <tr>
              <th class="text-left font-normal pb-1">モッド</th>
              <th class="text-right font-normal pb-1 w-20">表示値</th>
              <th class="text-center font-normal pb-1 w-12">品質</th>
              <th class="text-center font-normal pb-1 w-12">重要</th>
              <th class="text-right font-normal pb-1 w-20">ブリック</th>
              <th class="text-right font-normal pb-1 w-20">目標</th>
              <th class="text-right font-normal pb-1 w-20">大当たり</th>
              <th class="text-right font-normal pb-1 w-44">結果 (平均 / 目標以上 / ブリック)</th>
              <th class="w-8"></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(a, i) in s.affixes.value" :key="a.id">
              <tr class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1 pr-2">
                  <input v-model="a.label" type="text" class="w-full text-[12px] px-1 py-0.5 rounded bg-transparent border border-transparent hover:border-[var(--exile-color-border-subtle)] focus:border-[var(--exile-color-accent-focus)] focus:outline-none" />
                </td>
                <td class="py-1 text-right">
                  <input v-model.number="a.shown" type="number" min="0" step="any" class="num w-20" @change="s.resetDefaults(a)" />
                </td>
                <td class="py-1 text-center"><input v-model="a.qualityApplies" type="checkbox" class="accent-[var(--exile-color-accent-focus)]" /></td>
                <td class="py-1 text-center"><input v-model="a.key" type="checkbox" class="accent-[var(--exile-color-accent-focus)]" /></td>
                <td class="py-1 text-right"><input v-model.number="a.brickBelow" type="number" step="any" class="num w-20" :disabled="!a.key" /></td>
                <td class="py-1 text-right"><input v-model.number="a.target" type="number" step="any" class="num w-20" :disabled="!a.key" /></td>
                <td class="py-1 text-right"><input v-model.number="a.jackpot" type="number" step="any" placeholder="—" class="num w-20" :disabled="!a.key" /></td>
                <td class="py-1 text-right tabular-nums text-[11px] text-[var(--exile-color-text-secondary)]">
                  <template v-if="s.result.value.distributions[i]">
                    {{ fmt(s.result.value.distributions[i].mean) }} /
                    <span :class="a.key ? 'text-emerald-300' : ''">{{ pct(s.result.value.distributions[i].pTarget) }}</span> /
                    <span :class="a.key ? 'text-red-300' : ''">{{ pct(s.result.value.distributions[i].pBrick) }}</span>
                    <button type="button" class="ml-1 underline" @click="showDist[a.id] = !showDist[a.id]">{{ showDist[a.id] ? "▲" : "▼" }}</button>
                  </template>
                </td>
                <td class="py-1 text-right">
                  <button type="button" class="text-[11px] text-[var(--exile-color-text-tertiary)] hover:text-red-300" title="削除" @click="s.removeAffix(a.id)">✕</button>
                </td>
              </tr>
              <tr v-if="showDist[a.id] && s.result.value.distributions[i]" class="text-[11px]">
                <td colspan="9" class="pb-2 pl-2 text-[var(--exile-color-text-secondary)]">
                  <span class="text-[var(--exile-color-text-tertiary)]">実値 {{ s.result.value.distributions[i].real }} →</span>
                  <span v-for="o in s.result.value.distributions[i].outcomes" :key="o.value" class="inline-block mr-2 tabular-nums">
                    <span :class="a.key && a.brickBelow != null && o.value < a.brickBelow ? 'text-red-300' : a.key && a.target != null && o.value >= a.target ? 'text-emerald-300' : ''">{{ o.value }}</span><span class="text-[var(--exile-color-text-tertiary)]">:{{ pct(o.p) }}</span>
                  </span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </BaseCard>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
      <!-- 売値 -->
      <BaseCard>
        <div class="p-4 pl-5">
          <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
            <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">売値 ({{ unit }})</h2>
            <button
              type="button"
              :disabled="s.affixes.value.length === 0 || s.pricing.value || s.tradeAuto.rateLimitSecs.value > 0"
              class="px-3 py-1 rounded border border-[var(--exile-color-border-brass)] font-display tracking-[0.06em] text-[11px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              @click="s.fetchPrices"
            >
              <span aria-hidden="true">⟳</span>
              {{ s.pricing.value ? "trade2 で検索中…" : s.tradeAuto.rateLimitSecs.value > 0 ? `レート制限中 (${s.tradeAuto.rateLimitSecs.value} 秒)` : "trade2 で取り直す" }}
            </button>
          </div>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mb-2">
            解析すると自動で trade2 から取ります: 未聖別 = 同じベース・重要モッドが今の値以上の最安、当たり = 目標値以上の最安、大当たり = 大当たり値以上。
            現状維持は未聖別 × 0.7 の目安 (加工不可になる分)。どれも手で直せます。
            <span v-if="s.autoNote.value" class="text-amber-300">{{ s.autoNote.value }}</span>
          </p>
          <table class="w-full text-[12px]">
            <tbody>
              <tr class="border-b border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>未聖別のまま売る <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" @click="open(s.tradeUrl('shown'))">トレード2へ ↗</button></div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">今の状態の相場。これが比較の基準</div>
                </td>
                <td class="py-1.5 text-right w-28"><MoneyInput v-model="s.prices.value.unsanctified" placeholder="—" /></td>
              </tr>
              <tr class="border-b border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>現状維持 <span class="text-[var(--exile-color-text-tertiary)] tabular-nums">({{ pct(s.result.value.pUnchanged) }})</span></div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">聖別したが目標に届かず、ブリックもしていない。加工不可になる分、普通は未聖別より安い</div>
                </td>
                <td class="py-1.5 text-right"><MoneyInput v-model="s.prices.value.unchanged" placeholder="—" /></td>
              </tr>
              <tr class="border-b border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>ブリック <span class="text-red-300 tabular-nums">({{ pct(s.result.value.pBrick) }})</span></div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">重要モッドのどれかがブリック値未満。他がどれだけ良くても買い手は付かない前提</div>
                </td>
                <td class="py-1.5 text-right"><MoneyInput v-model="s.prices.value.bricked" placeholder="0" /></td>
              </tr>
              <tr class="border-b border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>当たり <span class="text-emerald-300 tabular-nums">({{ pct(s.result.value.pHit) }})</span> <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" @click="open(s.tradeUrl('target'))">トレード2へ ↗</button></div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">重要モッド全部が目標値以上</div>
                </td>
                <td class="py-1.5 text-right"><MoneyInput v-model="s.prices.value.hit" placeholder="—" /></td>
              </tr>
              <tr v-if="s.hasJackpot.value">
                <td class="py-1.5 pr-2">
                  <div>大当たり <span class="text-emerald-300 tabular-nums">({{ pct(s.result.value.pJackpot) }})</span> <button type="button" class="ml-1 text-[10px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-accent-focus)]" @click="open(s.tradeUrl('jackpot'))">トレード2へ ↗</button></div>
                  <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">重要モッド全部が大当たり値以上</div>
                </td>
                <td class="py-1.5 text-right"><MoneyInput v-model="s.prices.value.jackpot" placeholder="—" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </BaseCard>

      <!-- 判定 -->
      <BaseCard>
        <div class="p-4 pl-5">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-2">判定</h2>
          <p class="text-[13px] mb-3" :class="verdict.cls">{{ verdict.text }}</p>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
            <span class="text-[var(--exile-color-text-secondary)]">費用 (神のオーブ + お告げ)</span>
            <span class="text-right tabular-nums">{{ money(s.cost.value) }}</span>
            <span class="text-[var(--exile-color-text-secondary)]">期待売上</span>
            <span class="text-right tabular-nums">{{ money(s.result.value.expectedRevenue) }}</span>
            <span class="text-[var(--exile-color-text-secondary)]">期待収支 (売上 − 費用)</span>
            <span class="text-right tabular-nums" :class="evClass(s.result.value.ev)">{{ s.result.value.ev == null ? "—" : money(s.result.value.ev, true) }}</span>
            <span class="text-[var(--exile-color-text-secondary)]">ブリック / 現状維持 / 当たり / 大当たり</span>
            <span class="text-right tabular-nums">
              <span class="text-red-300">{{ pct(s.result.value.pBrick) }}</span> /
              {{ pct(s.result.value.pUnchanged) }} /
              <span class="text-emerald-300">{{ pct(s.result.value.pHit) }}</span> /
              <span class="text-emerald-300">{{ pct(s.result.value.pJackpot) }}</span>
            </span>
          </div>
          <p v-if="s.result.value.missing.length" class="text-[11px] text-amber-300 mt-2">不足: {{ s.result.value.missing.join("、") }}</p>
          <div class="mt-3 text-[11px] text-[var(--exile-color-text-secondary)] leading-relaxed">
            <div class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)] mb-1">聖別する前に済ませること (聖別後はほぼ手を加えられない)</div>
            <ul class="list-disc pl-4 space-y-0.5">
              <li>固有スキル付きならパーフェクトフラックスでスキルをレベル 20 に</li>
              <li>品質 (砥石 / 端材 / 彫刻針、装飾品とジュエルはカタリスト)</li>
              <li>アミュレットなら塗油</li>
              <li>値が下振れしているなら先に神のオーブで上げる (聖別は今の値に倍率を掛ける)</li>
            </ul>
          </div>
        </div>
      </BaseCard>
    </div>

    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <button type="button" class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-center gap-2" @click="showAssumptions = !showAssumptions">
          <span>{{ showAssumptions ? "▲" : "▼" }}</span>
          <span>前提 (倍率は非公開のためコミュニティ観測値。ここで変えられます)</span>
        </button>
        <div v-if="showAssumptions" class="mt-3 text-[12px] space-y-2">
          <div class="flex items-center gap-3">
            <label>倍率の下限</label><input v-model.number="s.params.value.factorMin" type="number" step="0.01" class="num w-20" />
            <label>上限</label><input v-model.number="s.params.value.factorMax" type="number" step="0.01" class="num w-20" />
            <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="s.resetParams">既定値に戻す</button>
          </div>
          <p class="text-[11px] text-[var(--exile-color-text-tertiary)] leading-relaxed">
            倍率は範囲内の一様分布、モッドごとに独立、結果は表示桁で四捨五入。品質付きのモッドは「表示値 = 切り捨て(実値 × (1 + 品質))」の関係から実値に戻し、
            倍率を掛けたあと品質を再適用します (そのため到達できない値が出ます。例: 品質 40% で実値 3 のモッドは 2 / 4 / 5 になり 3 にはならない)。
            クライアントにあるのはお告げの説明文「次回レアアイテムに使用する神のオーブはそのアイテムを聖別する」と「このアイテムは聖別されている」の文言だけで、倍率は入っていません。
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
.num:disabled {
  opacity: 0.4;
}
</style>
