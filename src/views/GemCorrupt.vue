<!--
  GemCorrupt.vue — ジェムコラプトの賭け (2026-09-12、「ヴァールの天秤」の 1 つ)
  ジェムを選ぶ → 売値 3 つ (レベル 21 / 品質 23% / 完成品) を trade2 で取る or 手入力 →
  自作 / 21 を買って賭け / 23% を買って賭け / 完成品を買う の 4 経路を「1 回あたりの期待収支」で比べる (完成品 1 個の実質コストも併記)。
    views/gem-corrupt/model.ts         期待値モデル (純粋関数)
    views/gem-corrupt/useGemCorrupt.ts 状態 / 相場 / trade2
    views/gem-corrupt/ledger.ts        収支 (実績入力、ジェムごとの帳簿)
    i18n/gems-client.json              ジェム一覧 (GGG クライアント由来)
-->
<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import BaseCard from "../components/decor/BaseCard.vue";
import { GEMS, useGemCorrupt } from "./gem-corrupt/useGemCorrupt";
import { pendingGemCorrupt } from "../state/app-nav";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import { useGemLedger } from "./gem-corrupt/ledger";
import SalePanel from "./gem-corrupt/SalePanel.vue";
import MaterialsPanel from "./gem-corrupt/MaterialsPanel.vue";
import AssumptionsPanel from "./gem-corrupt/AssumptionsPanel.vue";
import RoutesPanel from "./gem-corrupt/RoutesPanel.vue";
import LedgerPanel from "./gem-corrupt/LedgerPanel.vue";

const g = useGemCorrupt();
// 売値と捌き速度 (時計・巡回の読み直しを含む) は SalePanel.vue が自分で面倒を見る
onMounted(() => {
  void g.loadMarket();
});

const listOpen = ref(false);
/**
 * 上位プレイヤーMOD一覧のスキル欄の「コラプト計算」から来た時 (2026-09-14、オーナー指示):
 * そのジェムを選ぶ → 選んだ時の自動取得 (trade2 で売値 3 件) が走って計算が始まる。
 */
watch(
  pendingGemCorrupt,
  (nameEn) => {
    if (!nameEn) return;
    pendingGemCorrupt.value = null;
    const gem = GEMS.find((x) => x.en === nameEn);
    if (!gem) return;
    listOpen.value = false;
    if (g.selected.value?.en !== gem.en) g.select(gem);
    void nextTick(() => document.querySelector("main")?.scrollTo({ top: 0 }));
  },
  { immediate: true },
);

function onQueryInput(): void {
  listOpen.value = true;
  hi.value = 0;
  if (g.selected.value && g.query.value !== g.selected.value.ja) g.selected.value = null;
}

/** 候補リストのキーボード操作 (オーナー要望 2026-09-13): ↑↓ で選び、Enter で確定、Esc で閉じる */
const hi = ref(0);
const listEl = ref<HTMLUListElement | null>(null);
function scrollHiIntoView(): void {
  void nextTick(() => {
    const li = listEl.value?.children[hi.value] as HTMLElement | undefined;
    li?.scrollIntoView({ block: "nearest" });
  });
}
function onQueryKeydown(e: KeyboardEvent): void {
  const n = g.matches.value.length;
  const visible = listOpen.value && !g.selected.value && n > 0;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!visible) {
      listOpen.value = true;
      return;
    }
    const d = e.key === "ArrowDown" ? 1 : -1;
    hi.value = (hi.value + d + n) % n;
    scrollHiIntoView();
  } else if (e.key === "Enter") {
    if (!visible) return;
    e.preventDefault();
    const m = g.matches.value[Math.min(hi.value, n - 1)];
    if (m) g.select(m);
  } else if (e.key === "Escape") {
    listOpen.value = false;
  }
}

// 収支 (実績入力) は views/gem-corrupt/ledger.ts へ (画面は LedgerPanel.vue)
/** 「N 回やった場合」の N。素材・経路・収支で共通 (子に配って、素材の選択で戻ってくる) */
const attempts = ref(10);
const ledgerApi = useGemLedger(g);
const { fetchExchangeAndRepin } = ledgerApi;

</script>

<template>
  <section class="@container min-h-full block px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
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
            @keydown="onQueryKeydown"
          />
          <ul
            v-if="listOpen && !g.selected.value && g.matches.value.length > 0"
            ref="listEl"
            class="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] shadow-lg"
          >
            <li
              v-for="(m, i) in g.matches.value"
              :key="m.en"
              class="px-2 py-1 text-[13px] cursor-pointer flex items-baseline gap-2"
              :class="i === hi ? 'bg-[var(--exile-color-bg-surface)] text-[var(--exile-color-accent-focus)]' : 'hover:bg-[var(--exile-color-bg-surface)]'"
              @mouseenter="hi = i"
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

    <div class="grid grid-cols-1 @6xl:grid-cols-2 gap-4 mb-4">
      <SalePanel :g="g" />

      <MaterialsPanel
        :g="g"
        :attempts="attempts"
        :refetch-exchange="fetchExchangeAndRepin"
        @update:attempts="attempts = $event"
      />
    </div>

    <RoutesPanel :g="g" :attempts="attempts" />

    <LedgerPanel :g="g" :api="ledgerApi" />

    <!-- 前提 -->
    <AssumptionsPanel :g="g" />

    <footer class="text-[11px] text-[var(--exile-color-text-tertiary)] flex items-center gap-4 flex-wrap">
      <span>ジェム一覧 / 素材の名前と説明: ゲームクライアント (SkillGems, BaseItemTypes, GemTags, CurrencyItems)</span>
      <span>素材価格: カレンシーランキングの相場 (poe2scout 由来)</span>
      <span>売値: trade2 (取得ボタンは検索 3 回、鑑定は API 不使用)</span>
    </footer>
  </section>
</template>

