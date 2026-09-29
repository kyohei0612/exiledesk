<!--
  ModSearchBar.vue — MOD 選択数 / すべて解除 / 一括ティア / trade2 検索ボタン (固定エリア)
  CraftDiscoveryV2B.vue から切り出し (2026-09-07)。
  2026-09-29 オーナー「クラフト追加ボタンとクラフトへボタン、選んだ MOD をそのままクラフトできるようにルート組んで」:
    2 段目に クラフトのベース / 「クラフトに追加」/ 貯めた MOD / 「クラフトへ →」(計算機で作り方まで組む)。
-->
<script setup lang="ts">
import { craftBasket, clearBasket, goCraft, removeFromBasket } from "../../state/craft-basket";

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
const emit = defineEmits<{ clear: []; applyBulkTier: []; search: []; addCraft: [] }>();
const tierLabel = (tiers: { tier: number }[] | undefined, i: number): string => (i >= 0 && tiers?.[i] ? `T${tiers[i].tier}` : "段なし");
</script>

<template>
  <div class="shrink-0 mb-3 rounded border border-[var(--exile-color-accent-focus)]/50 bg-[var(--exile-color-bg-elevated)] shadow-md">
    <div class="flex items-center gap-3 px-3 py-2">
      <span v-if="selectedCount > 0" class="text-[13px] tabular-nums text-[var(--exile-color-accent-focus)]">{{ selectedCount }} 件選択中</span>
      <span v-else class="text-[13px] text-[var(--exile-color-text-secondary)]">MOD をチェックして trade2 で検索 / クラフトに追加 →</span>
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
        @click="emit('addCraft')"
        :disabled="selectedCount === 0 || !craftBase"
        :title="craftBase ? '選んだ MOD (段つき) をクラフトのリストに足す' : 'この部位には計算機で作れるベースがありません'"
        class="px-3 py-1.5 rounded border text-[12px] font-medium transition border-sky-400/50 text-sky-200 hover:bg-sky-500/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        ＋ クラフトに追加
      </button>
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
      <template v-if="craftBasket.mods.length">
        <span class="text-[11px] text-white/40">{{ craftBasket.baseJa }}:</span>
        <span
          v-for="m in craftBasket.mods"
          :key="m.mod.rawTemplate"
          class="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-100 ring-1 ring-sky-400/30"
        >
          <span class="font-bold opacity-70">{{ m.mod.affix }}</span>{{ m.mod.text }}
          <span class="tabular-nums text-sky-300">{{ tierLabel(m.mod.tiers, m.tierIdx) }}</span>
          <button type="button" class="text-white/40 hover:text-rose-300" title="外す" @click="removeFromBasket(m.mod.rawTemplate)">×</button>
        </span>
        <button type="button" class="text-[11px] text-white/40 underline hover:text-white/70" @click="clearBasket()">空にする</button>
      </template>
      <span v-else class="text-[11px] text-white/35">まだ空です。MOD をチェックして「クラフトに追加」</span>
      <span v-if="craftBasket.note" class="text-[11px] text-amber-300">{{ craftBasket.note }}</span>
      <div class="flex-1"></div>
      <button
        type="button"
        :disabled="!craftBasket.mods.length || craftBasket.busy"
        class="px-4 py-1.5 rounded font-bold text-[12px] transition bg-sky-500/80 text-black hover:bg-sky-400 disabled:bg-[var(--exile-color-bg-surface)] disabled:text-[var(--exile-color-text-tertiary)] disabled:cursor-not-allowed"
        title="クラフト計算機を開いて、このベースと MOD で作り方を組む"
        @click="goCraft()"
      >
        {{ craftBasket.busy ? "準備中…" : `クラフトへ →${craftBasket.mods.length ? ` (${craftBasket.mods.length})` : ""}` }}
      </button>
    </div>
  </div>
</template>
