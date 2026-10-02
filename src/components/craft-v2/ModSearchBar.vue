<!--
  ModSearchBar.vue — MOD を選んで使う帯 (固定エリア)。CraftDiscoveryV2B.vue から切り出し (2026-09-07)。
  2026-09-29 オーナー「クラフト追加ボタンとクラフトへボタン、選んだ MOD をそのままクラフトできるようにルート組んで」
    「クラフトへボタンは最初クラフト MOD 選択ってボタンにして、チェックはそこで表示」「キャンセルとクラフトへだけで」:
    最初は「クラフト MOD 選択」だけ (一覧にチェックは出ない) → 押すとチェックが出て、
    選択数・一括ティア・クラフトのベース・trade2 検索・「キャンセル」(選択を消して元の状態)・「クラフトへ →」(チェックした MOD で計算機)。
-->
<script setup lang="ts">
import { craftGo } from "../../state/craft-basket";

defineProps<{
  selectedCount: number;
  searching: boolean;
  /** クラフトのベースに選べる物 (この部位で上位の人が使っていたレアのベース、計算機にある物だけ) */
  craftBases: Array<{ en: string; ja: string; count: number }>;
}>();
/** 一括ティア dropdown の値 (0 = 制限なし) */
const bulkTierValue = defineModel<number>("bulkTierValue", { required: true });
/** クラフトのベース (英語名) */
const craftBase = defineModel<string>("craftBase", { required: true });
/** MOD を選ぶ状態か (一覧にチェックを出す) */
const selecting = defineModel<boolean>("selecting", { required: true });
const emit = defineEmits<{ clear: []; applyBulkTier: []; search: []; craft: []; cancel: [] }>();
</script>

<template>
  <div class="shrink-0 mb-3 rounded border border-[var(--exile-color-accent-focus)]/50 bg-[var(--exile-color-bg-elevated)] shadow-md">
    <!-- 最初: ボタンだけ -->
    <div v-if="!selecting" class="flex items-center gap-3 px-3 py-2">
      <span class="text-[13px] text-[var(--exile-color-text-secondary)]">MOD を選んで、クラフト計算機で作り方を組む / trade2 で探す</span>
      <div class="flex-1"></div>
      <button
        type="button"
        class="px-4 py-1.5 rounded font-bold text-[12px] transition bg-sky-500/80 text-black hover:bg-sky-400"
        @click="selecting = true"
      >
        クラフト MOD 選択
      </button>
    </div>

    <template v-else>
      <div class="flex items-center gap-3 px-3 py-2">
        <span v-if="selectedCount > 0" class="text-[13px] tabular-nums text-[var(--exile-color-accent-focus)]">{{ selectedCount }} 件選択中</span>
        <span v-else class="text-[13px] text-[var(--exile-color-text-secondary)]">下の MOD にチェック →</span>
        <button
          v-if="selectedCount > 0"
          type="button"
          @click="emit('clear')"
          class="text-[12px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)] underline"
        >
          すべて解除
        </button>
        <div class="flex-1"></div>
        <div v-if="selectedCount > 0" class="flex items-center gap-1.5" title="選択中の全 MOD のティアを一括設定">
          <label class="text-[11px] text-[var(--exile-color-text-secondary)]">一括ティア</label>
          <select
            v-model.number="bulkTierValue"
            @change="emit('applyBulkTier')"
            class="px-2 py-1 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] text-[12px] tabular-nums focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
          >
            <option :value="0">制限なし</option>
            <option v-for="t in 10" :key="t" :value="t">T{{ t }}</option>
          </select>
        </div>
        <button
          type="button"
          @click="emit('search')"
          :disabled="selectedCount === 0 || searching"
          :class="[
            'px-4 py-1.5 rounded font-medium text-[12px] transition',
            selectedCount > 0 && !searching
              ? 'bg-[var(--exile-color-accent-focus)] text-black hover:bg-[var(--exile-color-accent-focus-hover)]'
              : 'bg-[var(--exile-color-bg-surface)] text-[var(--exile-color-text-tertiary)] cursor-not-allowed border border-[var(--exile-color-border-subtle)]',
          ]"
        >
          {{ searching ? "検索中…" : "🔍 選択 MOD で trade2 検索" }}
        </button>
      </div>

      <!-- クラフト: ベース / 貯めた MOD / 計算機へ -->
      <div class="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2 text-[12px]">
        <span class="font-bold text-sky-200">クラフト</span>
        <select
          v-if="craftBases.length"
          v-model="craftBase"
          class="px-2 py-0.5 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] text-[12px] focus:outline-none focus:border-sky-400"
          title="作るベース (上位の人が使っていた順)"
        >
          <option v-for="b in craftBases" :key="b.en" :value="b.en">{{ b.ja }} ({{ b.count }} 人)</option>
        </select>
        <span v-else class="text-[11px] text-[var(--exile-color-text-tertiary)]">この部位は計算機で作れるベースがありません</span>
        <span v-if="craftGo.note" class="text-[11px] text-amber-300">{{ craftGo.note }}</span>
        <div class="flex-1"></div>
        <button
          type="button"
          class="px-3 py-1.5 rounded border border-white/15 text-[12px] text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]"
          title="選択を消して元の状態 (チェック無し) に戻す"
          @click="emit('cancel')"
        >
          キャンセル
        </button>
        <button
          type="button"
          :disabled="selectedCount === 0 || !craftBase || craftGo.busy"
          class="px-4 py-1.5 rounded font-bold text-[12px] transition bg-sky-500/80 text-black hover:bg-sky-400 disabled:bg-[var(--exile-color-bg-surface)] disabled:text-[var(--exile-color-text-tertiary)] disabled:cursor-not-allowed"
          :title="craftBase ? 'クラフト計算機を開いて、このベースとチェックした MOD (ティアつき) で作り方を組む' : 'この部位には計算機で作れるベースがありません'"
          @click="emit('craft')"
        >
          {{ craftGo.busy ? "準備中…" : `クラフトへ →${selectedCount ? ` (${selectedCount})` : ""}` }}
        </button>
      </div>
    </template>
  </div>
</template>
