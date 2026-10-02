<!--
  ItemSlotCard.vue — 装備の欄 1 つ。入っている物 (名前・MOD) と、差し替え (ゲームで Ctrl+C した文面を貼る) / 外す / 元に戻す
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import itemsJaClient from "../../i18n/items-ja-client.json";
import uniqueNamesJa from "../../i18n/unique-names-ja.json";
import { linesToJa } from "../../services/pob-check/item-text";
import type { SlotView } from "../../services/pob-check/api";

const props = defineProps<{ entry: SlotView; disabled: boolean }>();
const emit = defineEmits<{
  (e: "paste", text: string, done: (r: { unread: string[]; notCalculated: string[] } | null, err?: string) => void): void;
  (e: "clear"): void;
  (e: "restore"): void;
}>();

const SLOT_JA: Record<string, string> = {
  "Weapon 1": "武器",
  "Weapon 2": "オフハンド",
  Helmet: "兜",
  "Body Armour": "胴",
  Gloves: "手袋",
  Boots: "靴",
  Amulet: "アミュレット",
  "Ring 1": "指輪 (左)",
  "Ring 2": "指輪 (右)",
  "Ring 3": "指輪 3",
  Belt: "ベルト",
  "Flask 1": "ライフフラスコ",
  "Flask 2": "マナフラスコ",
};
const slotJa = computed(() => {
  const s = props.entry.slot;
  if (props.entry.jewel) return "ジュエル";
  const charm = /^Charm (\d+)$/.exec(s);
  return charm ? `チャーム ${charm[1]}` : (SLOT_JA[s] ?? s);
});

const RARITY_CLS: Record<string, string> = {
  UNIQUE: "text-orange-300",
  RARE: "text-yellow-200",
  MAGIC: "text-sky-300",
  NORMAL: "text-[var(--exile-color-text-primary)]",
};
const JA_BASE = itemsJaClient as Record<string, string>;
const JA_UNIQUE = uniqueNamesJa as Record<string, string>;
const title = computed(() => {
  const it = props.entry.item;
  if (!it) return "";
  if (it.rarity === "UNIQUE") return JA_UNIQUE[it.title] ?? it.title;
  if (it.rarity === "RARE") return it.title === "Pasted Item" ? "貼った物" : it.title;
  return JA_BASE[it.base] ?? it.base;
});
const baseJa = computed(() => (props.entry.item ? (JA_BASE[props.entry.item.base] ?? props.entry.item.base) : ""));

/** MOD の行 (日本語にして出す) */
const mods = ref<Array<{ text: string; cls: string }>>([]);
watch(
  () => props.entry.item,
  async (it) => {
    if (!it) { mods.value = []; return; }
    const [imp, rune, exp] = await Promise.all([linesToJa(it.implicits), linesToJa(it.runes), linesToJa(it.explicits)]);
    mods.value = [
      ...rune.map((text) => ({ text, cls: "text-teal-200/80" })),
      ...imp.map((text) => ({ text, cls: "text-[var(--exile-color-text-tertiary)]" })),
      ...exp.map((text) => ({ text, cls: "text-sky-100/90" })),
    ];
  },
  { immediate: true },
);

const open = ref(false);
const text = ref("");
const working = ref(false);
const note = ref<{ unread: string[]; notCalculated: string[] } | null>(null);
const err = ref("");
// 元に戻したら、差し替えた時の注意は消す
watch(
  () => props.entry.changed,
  (c) => {
    if (!c) note.value = null;
  },
);
function submit(): void {
  if (!text.value.trim()) return;
  working.value = true;
  err.value = "";
  emit("paste", text.value, (r, e) => {
    working.value = false;
    if (e) { err.value = e; return; }
    note.value = r;
    open.value = false;
    text.value = "";
  });
}
</script>

<template>
  <div class="flex flex-col rounded-xl border p-3" :class="entry.changed ? 'border-amber-400/40 bg-amber-500/[0.05]' : 'border-white/10 bg-white/[0.03]'">
    <div class="flex items-center justify-between gap-2">
      <span class="text-[11px] font-semibold text-[var(--exile-color-text-tertiary)]">
        {{ slotJa }}
        <span v-if="entry.changed" class="ml-1 rounded bg-amber-500/25 px-1.5 py-px text-amber-200">変更中</span>
      </span>
      <span class="flex gap-1">
        <button v-if="entry.changed" type="button" class="btn" :disabled="disabled" @click="emit('restore')">元に戻す</button>
        <button v-if="entry.item" type="button" class="btn" :disabled="disabled" @click="emit('clear')">外す</button>
        <button type="button" class="btn btn-soft" :disabled="disabled" @click="open = !open">差し替え</button>
      </span>
    </div>
    <template v-if="entry.item">
      <p class="mt-1 truncate text-[13px] font-bold" :class="RARITY_CLS[entry.item.rarity] ?? ''">{{ title }}</p>
      <p v-if="title !== baseJa" class="truncate text-[11px] text-[var(--exile-color-text-tertiary)]">{{ baseJa }}</p>
      <ul class="mt-1.5 space-y-px text-[11px] leading-snug">
        <li v-for="(m, i) in mods" :key="i" :class="m.cls">{{ m.text }}</li>
        <li v-if="entry.item.corrupted" class="text-rose-300">コラプト</li>
      </ul>
    </template>
    <p v-else class="mt-1 text-[12px] text-[var(--exile-color-text-tertiary)]">空き</p>

    <div v-if="open" class="mt-2">
      <textarea
        v-model="text"
        rows="6"
        placeholder="ゲームでアイテムにカーソルを合わせて Ctrl+C → ここに貼る (日本語でも英語でも)"
        class="w-full rounded-lg border border-white/10 bg-black/30 p-2 text-[11px] outline-none focus:border-amber-400/60"
      />
      <div class="mt-1 flex justify-end gap-1">
        <button type="button" class="btn" @click="open = false">やめる</button>
        <button type="button" class="btn btn-main" :disabled="working || disabled || !text.trim()" @click="submit">{{ working ? "計算中…" : "入れて計算" }}</button>
      </div>
    </div>
    <p v-if="err" class="mt-2 rounded bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">{{ err }}</p>
    <div v-if="note && (note.unread.length || note.notCalculated.length)" class="mt-2 rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
      <p v-if="note.unread.length">英語にできず入れていない行: {{ note.unread.join(" / ") }}</p>
      <p v-if="note.notCalculated.length">PoB が計算しない行: {{ note.notCalculated.join(" / ") }}</p>
    </div>
  </div>
</template>

<style scoped>
.btn {
  border-radius: 0.375rem;
  background: rgb(255 255 255 / 0.06);
  padding: 2px 8px;
  font-size: 11px;
  color: var(--exile-color-text-secondary);
}
.btn:hover:not(:disabled) {
  background: rgb(255 255 255 / 0.14);
}
.btn-soft {
  background: rgb(245 158 11 / 0.2);
  color: rgb(254 243 199);
}
.btn-main {
  background: rgb(245 158 11);
  color: #000;
  font-weight: 700;
}
.btn:disabled {
  opacity: 0.35;
}
</style>
