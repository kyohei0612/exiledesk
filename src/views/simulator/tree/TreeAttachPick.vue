<!--
  TreeAttachPick.vue — 完成形の設定の段の行の「付ける」(S-10b、スイッチ attachWay、10-31 オーナー決め 15「付けるボタンに統一させようか…できない奴は灰色で」)。
  押すとエミュの「付ける」(M-19、views/craft-stage/ModAddPicker.vue) と同じプルダウンで付け方 3 つ (ふつう・フラクチャー・冒涜) を出す
  (10-31 オーナー「エミュみたいにつけるって押したら候補出るみたいな挙動を想像してた」。前は行の中に横に並べていた)。
  出ない付け方も灰色で残し、乗せると理由 (押してもメニューの下に一言)。付けた段は「外す」も。ModAddPicker はエミュの状態に結び付いているので形だけ写す
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { tr } from "../../../i18n/lang";
import type { Aim } from "../../../services/simulator/tree/tree-model";
import { toCss } from "../../../utils/zoom";
import { swallowNextClick } from "../../../utils/swallow-click";
import Icon from "../../../components/ui/Icon.vue";
import { ATTACH_WAYS, attachIn, detachIn, wayBlock, wayName, wayOfAim, type AttachWay } from "./tree-attach";
import { useTree } from "./use-tree";

const props = defineProps<{ modId: string; tier: number; rank: string; /** 一覧の行の群れ (normal・desecrated・essence など) */ group?: string; /** 狙いの組に足せない訳 (どの付け方でも同じ。tree-goal-cap) */ block: string | null; /** この MOD の今の狙い (段は別でもよい) */ aim?: Aim }>();
const t = useTree();
/** この段が今の狙いの段なら付け方 */
const here = computed((): AttachWay | null => (props.aim?.tier === props.tier ? wayOfAim(props.aim) : null));
/** 付け方の訳 (足せない訳が先) */
const blockOf = (w: AttachWay): string | null => (here.value ? null : props.block) ?? wayBlock(props.group, w);
const why = ref<string | null>(null);
function choose(w: AttachWay): void {
  const b = blockOf(w);
  if (b) { why.value = b; return; }
  t.edit((d) => attachIn(d, props.modId, props.tier, w));
  close();
}
function detach(): void { t.edit((d) => detachIn(d, props.modId)); close(); }
const label = computed(() => {
  const w = here.value;
  if (!w) return tr("付ける", "Add");
  const name = `${w === "fracture" ? "✦" : "✓"} ${wayName(w)}`;
  return props.tier === 1 ? name : tr(`${name} (${props.rank} 以上)`, `${name} (${props.rank}+)`);
});

// ── プルダウン (body に出す固定の小窓。ModAddPicker と同じ置き方・閉じ方) ─────
const open = ref(false);
const btn = ref<HTMLButtonElement | null>(null);
const pos = ref({ left: 0, top: 0, above: false });
const W = 200;
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
  document.removeEventListener("pointerdown", outside, true);
  window.removeEventListener("scroll", close, true);
  document.removeEventListener("keydown", onKey);
}
function outside(e: PointerEvent): void {
  const el = e.target as HTMLElement | null;
  if (btn.value?.contains(el) || el?.closest?.("[data-mod-attach-ways]")) return;
  close();
  swallowNextClick();
}
function onKey(e: KeyboardEvent): void { if (e.key === "Escape") { e.preventDefault(); close(); } }
function toggle(): void {
  if (open.value) { close(); return; }
  place();
  open.value = true;
  void nextTick(() => {
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", close, true);
    document.addEventListener("keydown", onKey);
  });
}
onBeforeUnmount(close);
const style = computed(() => ({ left: `${pos.value.left}px`, top: `${pos.value.top}px`, width: `${W}px`, transform: pos.value.above ? "translateY(-100%)" : undefined }));
</script>

<template>
  <span class="inline-flex items-center" data-mod-attach-wrap>
    <button ref="btn" type="button" data-mod-attach class="tbtn" :class="here ? (here === 'fracture' ? 'on !text-mod-fractured' : 'on') : ''" :aria-expanded="open"
      :title="here ? tr('押すと付け方を替える・外す', 'Click to change how it is added, or remove it') : (block ?? tr(`${rank} 以上を完成の狙いにする (付け方を選ぶ)`, `Make ${rank}+ a final target (choose how)`))"
      @click.stop="toggle">{{ label }}<Icon name="chevron-down" class="ml-0.5 size-3" /></button>
    <Teleport to="body">
      <div v-if="open" data-mod-attach-ways role="menu" class="fixed z-[360] overflow-hidden rounded-md border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)]" :style="style">
        <p class="px-3 pb-1 pt-0.5 text-[10px] text-[var(--exile-color-text-tertiary)]">{{ tr(`${rank} 以上の付け方`, `How to add ${rank}+`) }}</p>
        <!-- 付けられない物も残して灰色。disabled にすると乗せても理由が出ないので aria-disabled (エミュと同じ) -->
        <button v-for="w in ATTACH_WAYS" :key="w" type="button" role="menuitem" class="flex w-full items-center px-3 py-1.5 text-left text-[13px] max-md:py-2.5"
          :class="blockOf(w) ? 'cursor-not-allowed text-white/30' : here === w ? (w === 'fracture' ? 'text-mod-fractured' : 'text-amber-200') : 'text-[var(--exile-color-text-primary)] hover:bg-amber-500/15 hover:text-[#f3e2b8]'"
          :data-attach-way="w" :aria-disabled="!!blockOf(w)" :title="blockOf(w) ?? undefined" @click.stop="choose(w)">{{ here === w ? "✓ " : w === "fracture" ? "✦ " : "" }}{{ wayName(w) }}</button>
        <button v-if="aim" type="button" role="menuitem" data-attach-off class="flex w-full items-center border-t border-white/10 px-3 py-1.5 text-left text-[13px] text-rose-200 hover:bg-rose-500/15 max-md:py-2.5" @click.stop="detach">{{ tr("外す", "Remove") }}</button>
        <p v-if="why" data-attach-why class="mx-2 mb-1 mt-1 break-words rounded bg-rose-500/10 px-2 py-1 text-[11px] text-rose-100">{{ why }}</p>
      </div>
    </Teleport>
  </span>
</template>
