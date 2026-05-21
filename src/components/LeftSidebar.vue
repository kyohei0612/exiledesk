<script setup lang="ts">
defineProps<{ active: string }>();
defineEmits<{ "update:active": [value: string] }>();

interface NavItem {
  id: string;
  icon: string;
  label: string;
  group: "economy" | "tools";
}

// アイコンは visual-concept §5.5 / §8.2 で確定した錬金術記号セット (☉🜔📜⚙)。
// ☉ = 通貨ランキング / 🜔 = クラフト発見 / 📜 = クラフト相談 / ⚙ = 設定
// 設定タブは Phase A.6 時点では未実装機能のため items から除外する。
const items: NavItem[] = [
  { id: "econ-currency", icon: "☉", label: "通貨ランキング", group: "economy" },
  { id: "econ-trending", icon: "🜔", label: "クラフト発見", group: "economy" },

  { id: "tool-craft", icon: "📜", label: "クラフト相談", group: "tools" },
];

const groupLabels: Record<string, string | null> = {
  economy: "経済",
  tools: "ツール",
};

const groups = (["economy", "tools"] as const).map((key) => ({
  key,
  label: groupLabels[key],
  items: items.filter((i) => i.group === key),
}));
</script>

<template>
  <aside class="bg-[var(--exile-color-bg-surface)] flex flex-col py-3 select-none">
    <div class="px-4 pb-3">
      <h1 class="text-lg font-semibold tracking-wide text-[var(--exile-color-accent-focus)]">
        ExileDesk
      </h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)]">POE2 Secretary</p>
    </div>

    <nav class="flex-1 overflow-y-auto">
      <div v-for="group in groups" :key="group.key" class="mt-1">
        <div
          v-if="group.label"
          class="px-4 mt-3 mb-1 text-[10px] uppercase tracking-wider text-[var(--exile-color-text-secondary)]"
        >
          {{ group.label }}
        </div>
        <button
          v-for="item in group.items"
          :key="item.id"
          @click="$emit('update:active', item.id)"
          :class="[
            'w-full text-left px-4 py-2 flex items-center gap-2 transition border-l-2 font-display text-[13px] tracking-[0.06em]',
            active === item.id
              ? 'bg-[var(--exile-color-bg-elevated)] border-[var(--exile-color-accent-focus)] text-[var(--exile-color-accent-focus)]'
              : 'border-transparent hover:bg-[var(--exile-color-bg-elevated)]',
          ]"
        >
          <!--
            アイコン (☉🜔📜) は Cinzel の unicode-range 外なので、
            font-display 指定の影響を受けず Yu Gothic UI / 絵文字フォントに落ちる。
            ラベル日本語も同様に自動フォールバック (visual-concept §9.6)。
          -->
          <span class="w-5 inline-block text-center" aria-hidden="true">{{
            item.icon
          }}</span>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </nav>
  </aside>
</template>
