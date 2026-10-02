<!--
  TabBar.vue — 画面の上の帯 (画面名 + タブ) (2026-10-03)

  オーナー「全て作成後に UI のブスさをまとめてきれいにシンプルに見やすい状態に整えてくれ」。
  それまで ヴァールの天秤 / カレンシーランキング / クラフト計算機 は同じ帯を 3 か所に書き写し、火力チェックだけ別の見た目だった。
  帯は 1 つの部品にして、画面名 (アイコン + 名前) は帯の左に 1 回だけ出す (本文の h1 と二重に出さない。帯の名前が h1)。

  使い方:
    - 画面の帯: <TabBar icon="⚖" title="ヴァールの天秤" :tabs="…" v-model="tab" />   … 左右 24px、上 12px の余白つき
    - タブだけ (本文の中の切り替え。火力チェックの 装備 / ジェム …): title を渡さない。余白は無し、タブの見た目は同じ
    - タブが無い画面 (取引履歴 / スキン / 設定 …) は title だけ渡す = 画面名の帯
  タブは { id, label, icon?, hint? }。hint はツールチップ (title 属性)。disabled を渡すと全部押せなくする (読み込む前の火力チェック)
-->
<script setup lang="ts">
export interface TabItem {
  id: string;
  label: string;
  icon?: string;
  hint?: string;
}

withDefaults(
  defineProps<{
    /** 画面名 (帯の左)。無ければタブだけの行 */
    title?: string;
    /** 画面名の前のアイコン (サイドバーと同じ物) */
    icon?: string;
    tabs?: readonly TabItem[];
    /** 選んでいるタブの id */
    modelValue?: string;
    /** タブを押せなくする (まだ中身が無い時) */
    disabled?: boolean;
    ariaLabel?: string;
  }>(),
  { title: undefined, icon: undefined, tabs: () => [], modelValue: undefined, disabled: false, ariaLabel: undefined },
);
const emit = defineEmits<{ "update:modelValue": [id: string] }>();
</script>

<template>
  <div
    class="flex shrink-0 items-end gap-1 border-b border-[var(--exile-color-border-subtle)]"
    :class="title ? 'px-6 pt-3' : ''"
    role="tablist"
    :aria-label="ariaLabel ?? title"
  >
    <!-- 画面名 (h1 はここだけ) -->
    <h1 v-if="title" class="mr-3 flex items-center gap-1.5 pb-2 font-display text-[13px] tracking-[0.08em] text-[var(--exile-color-text-primary)]">
      <span v-if="icon" class="inline-block w-5 text-center text-[var(--exile-color-accent-focus)]" aria-hidden="true">{{ icon }}</span>
      <span class="whitespace-nowrap">{{ title }}</span>
    </h1>
    <button
      v-for="t in tabs"
      :key="t.id"
      type="button"
      role="tab"
      :aria-selected="modelValue === t.id"
      :title="t.hint"
      :disabled="disabled"
      class="-mb-px flex h-8 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[12px] tracking-[0.04em] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      :class="
        modelValue === t.id
          ? 'border-[var(--exile-color-accent-focus)] font-semibold text-[var(--exile-color-accent-focus)]'
          : 'border-transparent text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]'
      "
      @click="emit('update:modelValue', t.id)"
    >
      <span v-if="t.icon" class="inline-block text-center" aria-hidden="true">{{ t.icon }}</span>
      <span>{{ t.label }}</span>
    </button>
    <!-- 帯の右 (手動更新のボタンなど、画面全体の操作) -->
    <div v-if="$slots.right" class="ml-auto flex items-center gap-2 pb-1.5">
      <slot name="right" />
    </div>
  </div>
</template>
