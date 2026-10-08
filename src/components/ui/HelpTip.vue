<!--
  HelpTip.vue — 小さな「?」で短い説明を出す (2026-10-09)

  オーナー「初見さんでも分かるような UI や ? マーク等のアドバイス」「文字は最低限 (説明は既定で閉じ、要る時に開く)」。
  押すと開く (PC は乗せても開く)。外を押す・Esc・もう一度押すで閉じる。説明は窓の中に収める (fit-card と同じ決まり)。
  使い方: <HelpTip text="狙う手は当たったものとして次へ進みます" /> / 見出しの横に <HelpTip title="打って作る">…</HelpTip>
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { toCss } from "../../utils/zoom";
import Icon from "./Icon.vue";

const props = withDefaults(defineProps<{
  /** 説明 (短く。長い物は slot で) */
  text?: string;
  /** 説明の見出し */
  title?: string;
  /** 丸の大きさ */
  size?: "sm" | "md";
  /** 説明の幅 (px) */
  width?: number;
}>(), { text: "", title: "", size: "sm", width: 260 });

const open = ref(false);
const pinned = ref(false);
const btn = ref<HTMLButtonElement | null>(null);
const pos = ref<{ left: number; top: number; above: boolean }>({ left: 0, top: 0, above: false });
const touchOnly = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;

function place(): void {
  const el = btn.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const vw = toCss(window.innerWidth), vh = toCss(window.innerHeight);
  const L = toCss(r.left), T = toCss(r.top), B = toCss(r.bottom), W = toCss(r.width);
  const left = Math.max(12, Math.min(L + W / 2 - props.width / 2, vw - props.width - 12));
  const above = B + 140 > vh;
  pos.value = { left, top: above ? T - 8 : B + 8, above };
}
function show(pin = false): void {
  place();
  open.value = true;
  if (pin) pinned.value = true;
  void nextTick(() => document.addEventListener("pointerdown", outside, true));
}
function hide(): void {
  open.value = false;
  pinned.value = false;
  document.removeEventListener("pointerdown", outside, true);
}
function outside(e: PointerEvent): void {
  if (btn.value?.contains(e.target as Node)) return;
  if ((e.target as HTMLElement)?.closest?.("[data-helptip-pop]")) return;
  hide();
}
function toggle(): void { if (open.value && pinned.value) hide(); else show(true); }
function onKey(e: KeyboardEvent): void { if (e.key === "Escape" && open.value) hide(); }
document.addEventListener("keydown", onKey);
onBeforeUnmount(() => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", outside, true); });
const style = computed(() => ({ left: `${pos.value.left}px`, top: `${pos.value.top}px`, width: `${props.width}px`, transform: pos.value.above ? "translateY(-100%)" : undefined }));
</script>

<template>
  <span class="inline-flex align-middle">
    <button
      ref="btn"
      type="button"
      class="helptip-btn grid shrink-0 place-items-center rounded-full leading-none transition"
      :class="[size === 'md' ? 'size-5' : 'size-4', open ? 'text-[var(--exile-color-accent-focus)]' : 'text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-text-secondary)]']"
      :aria-label="title || 'ヘルプ'"
      :aria-expanded="open"
      @click.stop="toggle"
      @mouseenter="!touchOnly && !open && show()"
      @mouseleave="!touchOnly && open && !pinned && hide()"
    ><Icon name="help" class="size-full" /></button>
    <Teleport to="body">
      <div v-if="open" data-helptip-pop role="tooltip" class="helptip-pop fixed z-[80] rounded-md border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] p-3 text-left text-[13px] leading-relaxed text-[var(--exile-color-text-primary)] shadow-[0_8px_24px_rgba(0,0,0,0.55)]" :style="style">
        <p v-if="title" class="mb-1 text-[12px] font-bold text-[var(--exile-color-accent-focus)]">{{ title }}</p>
        <slot>{{ text }}</slot>
      </div>
    </Teleport>
  </span>
</template>
