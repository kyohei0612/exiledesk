<!--
  Disclosure.vue — 開く / たたむ のボタン (2026-10-10 動きの揃え 3)。エミュレーターが原点:
  BaseCardGrid の「もっと見る (あと N)」(中で送らない、g-plain の中央の文字ボタン) と StageModList の見出しの畳み (chevron の Icon)。

  言葉は 3 つだけ (閉じている時 / 開いている時):
    kind="list"    一覧の続き   「もっと見る (あと N)」/「たたむ」   (rest を渡すと件数)
    kind="detail"  説明・内訳   「詳しく」/「たたむ」
    kind="section" 欄ごと畳む   「開く」/「たたむ」
  印は Icon の chevron-down / chevron-up だけ (▲▼▴▾▸▶ の文字は使わない)。
  前に言葉を足す時は中身 (slot) に書く (例: 「今のアイテムには使えない物 (3)」)。
  bar = 一覧の下に全幅・中央 (BaseCardGrid と同じ)。tag="span" = 見出し全体が押せる所の中 (押す処理は親)。
  persistKey = 開いたかを覚える (localStorage、使えない時は覚えないだけ)
-->
<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import Icon from "./Icon.vue";
import { tr } from "../../i18n/lang";

const props = withDefaults(defineProps<{
  kind?: "list" | "detail" | "section";
  rest?: number | null;
  bar?: boolean;
  tag?: "button" | "span";
  persistKey?: string;
}>(), { kind: "list", rest: null, bar: false, tag: "button", persistKey: undefined });
const open = defineModel<boolean>("open", { default: false });

const label = computed(() => {
  if (open.value) return tr("たたむ", "Collapse");
  if (props.kind === "detail") return tr("詳しく", "Details");
  if (props.kind === "section") return tr("開く", "Expand");
  return props.rest != null && props.rest > 0 ? tr(`もっと見る (あと ${props.rest})`, `Show more (${props.rest} more)`) : tr("もっと見る", "Show more");
});

const storeKey = (): string | null => (props.persistKey ? `exiledesk.fold.${props.persistKey}` : null);
onMounted(() => {
  const k = storeKey();
  if (!k) return;
  try {
    const v = localStorage.getItem(k);
    if (v === "1" || v === "0") open.value = v === "1";
  } catch { /* 覚えないだけ */ }
});
watch(open, (v) => {
  const k = storeKey();
  if (!k) return;
  try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* 覚えないだけ */ }
});

function toggle(): void { if (props.tag === "button") open.value = !open.value; }
</script>

<template>
  <component
    :is="tag"
    :type="tag === 'button' ? 'button' : undefined"
    :aria-expanded="tag === 'button' ? open : undefined"
    class="g-plain items-center gap-1 text-[12px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]"
    :class="bar ? 'mt-2 flex w-full justify-center rounded-md py-1.5 text-[13px] hover:bg-white/5' : 'inline-flex'"
    @click="toggle"
  >
    <slot />
    <span>{{ label }}</span>
    <Icon :name="open ? 'chevron-up' : 'chevron-down'" class="size-3.5" />
  </component>
</template>
