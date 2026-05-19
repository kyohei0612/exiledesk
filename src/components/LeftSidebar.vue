<script setup lang="ts">
defineProps<{ active: string }>();
defineEmits<{ "update:active": [value: string] }>();

interface NavItem {
  id: string;
  icon: string;
  label: string;
  group: "economy" | "tools";
}

const items: NavItem[] = [
  { id: "econ-currency", icon: "💰", label: "通貨ランキング", group: "economy" },
  { id: "econ-trending", icon: "🔍", label: "クラフト発見", group: "economy" },

  { id: "tool-craft", icon: "🔨", label: "クラフト相談", group: "tools" },
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
