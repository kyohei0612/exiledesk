<script setup lang="ts">
defineProps<{ active: string }>();
defineEmits<{ "update:active": [value: string] }>();

interface NavItem {
  id: string;
  icon: string;
  label: string;
  group: "top" | "self" | "economy" | "tools" | "library" | "bottom";
}

const items: NavItem[] = [
  { id: "chat", icon: "🤖", label: "秘書チャット", group: "top" },

  { id: "char-overview", icon: "👤", label: "概要", group: "self" },
  { id: "char-equipment", icon: "⚔️", label: "装備", group: "self" },
  { id: "char-passive", icon: "🌳", label: "パッシブ", group: "self" },
  { id: "char-skills", icon: "⚡", label: "スキル", group: "self" },

  { id: "econ-currency", icon: "💰", label: "通貨ランキング", group: "economy" },
  { id: "econ-trending", icon: "📊", label: "需要急騰", group: "economy" },
  { id: "econ-search", icon: "🔍", label: "商品検索", group: "economy" },

  { id: "tool-craft", icon: "🔨", label: "クラフト相談", group: "tools" },
  { id: "tool-dps", icon: "📈", label: "装備 DPS 比較", group: "tools" },
  { id: "tool-ideal", icon: "🎯", label: "理想装備 vs 現在", group: "tools" },

  { id: "lib-items", icon: "📖", label: "アイテム図鑑", group: "library" },
  { id: "lib-skills", icon: "🪄", label: "スキルDB", group: "library" },
  { id: "lib-bosses", icon: "🗺️", label: "ボス情報", group: "library" },
  { id: "lib-filter", icon: "🧪", label: "フィルタ", group: "library" },

  { id: "settings", icon: "⚙️", label: "設定", group: "bottom" },
];

const groupLabels: Record<string, string | null> = {
  top: null,
  self: "自分",
  economy: "経済",
  tools: "ツール",
  library: "ライブラリ",
  bottom: null,
};

const groups = (
  ["top", "self", "economy", "tools", "library", "bottom"] as const
).map((key) => ({
  key,
  label: groupLabels[key],
  items: items.filter((i) => i.group === key),
}));
</script>

<template>
  <aside class="bg-[var(--color-surface)] flex flex-col py-3 select-none">
    <div class="px-4 pb-3">
      <h1 class="text-lg font-semibold tracking-wide text-[var(--color-accent)]">
        ExileDesk
      </h1>
      <p class="text-xs text-[var(--color-text-muted)]">POE2 Secretary</p>
    </div>

    <nav class="flex-1 overflow-y-auto">
      <div v-for="group in groups" :key="group.key" class="mt-1">
        <div
          v-if="group.label"
          class="px-4 mt-3 mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]"
        >
          {{ group.label }}
        </div>
        <button
          v-for="item in group.items"
          :key="item.id"
          @click="$emit('update:active', item.id)"
          :class="[
            'w-full text-left px-4 py-2 flex items-center gap-2 transition text-sm border-l-2',
            active === item.id
              ? 'bg-[var(--color-surface-2)] border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'border-transparent hover:bg-[var(--color-surface-2)]',
          ]"
        >
          <span class="w-5 inline-block text-center">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </nav>
  </aside>
</template>
