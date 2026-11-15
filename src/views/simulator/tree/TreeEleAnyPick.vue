<!--
  TreeEleAnyPick.vue — 完成形の MOD 一覧の「いずれかの元素耐性」の行の右: 段の選び 1 つと「付ける ▾」(S-10h ①、11-16 オーナー「付けるボタンとティアボタンのみでおk」)。
  付ける ▾ の小窓は「1 つ / 2 つ (違う元素) / 3 つ (違う元素)」と「外す」。置いた本は全部同じ段。小窓の置き方・閉じ方は TreeAttachPick と同じ
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { tr } from "../../../i18n/lang";
import { toCss } from "../../../utils/zoom";
import { useDismiss } from "../../../utils/use-dismiss";
import Icon from "../../../components/ui/Icon.vue";
import type { useEleFold } from "./use-ele-fold";

const props = defineProps<{ ef: ReturnType<typeof useEleFold> }>();
const n = computed(() => props.ef.placed.value.length);
/** 段の選び: 置いていればその段、無ければ次に付ける段 (既定 = 一番上の段) */
const pending = ref<number>(props.ef.steps.value[0]?.tier ?? 1);
const tier = computed(() => props.ef.placed.value[0]?.tier ?? pending.value);
watch(() => props.ef.steps.value[0]?.tier, (x) => { if (x && !props.ef.steps.value.some((y) => y.tier === pending.value)) pending.value = x; });
function onTier(v: number): void { if (n.value) props.ef.setTierAll(v); else pending.value = v; }
const label = computed(() => (n.value ? tr(`✓ ${n.value} つ`, `✓ ${n.value}`) : tr("付ける", "Add")));
const blockOf = (k: number): string | null => (k > props.ef.room.value ? tr(`サフィックスの空きが足りない (置けるのは ${props.ef.room.value} つまで)`, `Not enough free suffix slots (up to ${props.ef.room.value})`) : null);
const why = ref<string | null>(null);
function choose(k: number): void {
  const b = blockOf(k);
  if (b) { why.value = b; return; }
  props.ef.setCount(k, tier.value);
  close();
}
function off(): void { props.ef.setCount(0, tier.value); close(); }

// ── 小窓 (body に出す固定の小窓。TreeAttachPick と同じ) ─────
const open = ref(false);
const btn = ref<HTMLButtonElement | null>(null), menu = ref<HTMLElement | null>(null);
const pos = ref({ left: 0, top: 0, above: false });
const W = 180;
function place(): void {
  const r = btn.value?.getBoundingClientRect();
  if (!r) return;
  const vw = toCss(window.innerWidth), vh = toCss(window.innerHeight);
  const L = toCss(r.left), R = toCss(r.right), T = toCss(r.top), B = toCss(r.bottom);
  const above = B + 170 > vh;
  pos.value = { left: Math.max(8, Math.min(R - W, vw - W - 8, L)), top: above ? T - 4 : B + 4, above };
}
function close(): void {
  open.value = false;
  why.value = null;
  window.removeEventListener("scroll", close, true);
}
useDismiss(() => open.value, [btn, menu], close, { keep: "[data-ele-any-ways]" });
function toggle(): void {
  if (open.value) { close(); return; }
  place();
  open.value = true;
  void nextTick(() => { window.addEventListener("scroll", close, true); });
}
onBeforeUnmount(close);
const style = computed(() => ({ left: `${pos.value.left}px`, top: `${pos.value.top}px`, width: `${W}px`, transform: pos.value.above ? "translateY(-100%)" : undefined }));
const COUNTS = [1, 2, 3] as const;
/** 段の選びの字は「T2」だけ (狭く、11-16 オーナー「ティアのボタン狭くていいよ」。以上の意味は乗せた一言とカードの「S2 以上」) */
const short = (s: string): string => s.replace(/\s*(以上|\+)$/, "");
const countName = (k: number): string => (k === 1 ? tr("1 つ", "1") : tr(`${k} つ (違う元素)`, `${k} (different elements)`));
</script>

<template>
  <span class="inline-flex items-center gap-1" @click.stop>
    <select data-tree-ele-any-tier :title="tr('この段以上で当たり', 'This tier or better')" class="w-[3.25rem] rounded border border-amber-300/40 bg-black/40 px-0.5 py-0 text-[11px] text-amber-100" :value="tier" @change="onTier(Number(($event.target as HTMLSelectElement).value))">
      <option v-for="x in ef.steps.value" :key="x.tier" :value="x.tier">{{ short(x.label) }}</option>
    </select>
    <button ref="btn" type="button" data-tree-ele-any-attach class="tbtn whitespace-nowrap" :class="n ? 'on' : ''" :aria-expanded="open" :title="tr('いくつ狙うかを選ぶ (2 つ・3 つは違う元素)', 'Choose how many to aim for (2 or 3 are different elements)')" @click.stop="toggle">{{ label }}<Icon name="chevron-down" class="ml-0.5 size-3" /></button>
    <Teleport to="body">
      <div v-if="open" ref="menu" data-ele-any-ways role="menu" class="fixed z-[360] overflow-hidden rounded-md border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)]" :style="style">
        <p class="px-3 pb-1 pt-0.5 text-[10px] text-[var(--exile-color-text-tertiary)]">{{ tr("いくつ狙う", "How many") }}</p>
        <button v-for="k in COUNTS" :key="k" type="button" role="menuitem" :data-ele-any-count="k" class="flex w-full items-center px-3 py-1.5 text-left text-[13px] max-[48rem]:py-2.5"
          :class="blockOf(k) ? 'cursor-not-allowed text-white/30' : n === k ? 'text-amber-200' : 'text-[var(--exile-color-text-primary)] hover:bg-amber-500/15 hover:text-[#f3e2b8]'"
          :aria-disabled="!!blockOf(k)" :title="blockOf(k) ?? undefined" @click.stop="choose(k)">{{ n === k ? "✓ " : "" }}{{ countName(k) }}</button>
        <button v-if="n" type="button" role="menuitem" data-ele-any-off class="flex w-full items-center border-t border-white/10 px-3 py-1.5 text-left text-[13px] text-rose-200 hover:bg-rose-500/15 max-[48rem]:py-2.5" @click.stop="off">{{ tr("外す", "Remove") }}</button>
        <p v-if="why" class="mx-2 mb-1 mt-1 break-words rounded bg-rose-500/10 px-2 py-1 text-[11px] text-rose-100">{{ why }}</p>
      </div>
    </Teleport>
  </span>
</template>
