<!--
  TreeAttachPick.vue — 完成形の設定の段の行の「付ける」(S-10b、スイッチ attachWay、10-31 オーナー決め 15「付けるボタンに統一させようか…できない奴は灰色で」)。
  押すとその場に付け方の 4 択 (ふつう・フラクチャー・冒涜・エッセンス) を並べる。出ない付け方は灰色で、押すと訳を一言。付けた段は「外す」も。
  表の中に浮かぶ窓は一覧の送りの枠で切れるので、行の中で開く
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../../i18n/lang";
import type { Aim } from "../../../services/simulator/tree/tree-model";
import { useDismiss } from "../../../utils/use-dismiss";
import { ATTACH_WAYS, attachIn, attachOpen, detachIn, wayBlock, wayName, wayOfAim, type AttachWay } from "./tree-attach";
import { useTree } from "./use-tree";

const props = defineProps<{ modId: string; tier: number; rank: string; /** 一覧の行の群れ (normal・desecrated・essence など) */ group?: string; /** 狙いの組に足せない訳 (どの付け方でも同じ。tree-goal-cap) */ block: string | null; /** この MOD の今の狙い (段は別でもよい) */ aim?: Aim }>();
const t = useTree();
const key = computed(() => `${props.modId}|${props.tier}`);
const open = computed(() => attachOpen.value === key.value);
/** この段が今の狙いの段なら付け方 */
const here = computed((): AttachWay | null => (props.aim?.tier === props.tier ? wayOfAim(props.aim) : null));
const why = ref<string | null>(null);
const el = ref<HTMLElement | null>(null);
useDismiss(() => open.value, [el], () => { attachOpen.value = null; }, { swallow: false });

/** 付け方の訳 (足せない訳が先) */
const blockOf = (w: AttachWay): string | null => (here.value ? null : props.block) ?? wayBlock(props.group, w);
function toggleOpen(): void { why.value = null; attachOpen.value = open.value ? null : key.value; }
function choose(w: AttachWay): void {
  const b = blockOf(w);
  if (b) { why.value = b; return; }
  t.edit((d) => attachIn(d, props.modId, props.tier, w));
  attachOpen.value = null;
}
function detach(): void { t.edit((d) => detachIn(d, props.modId)); attachOpen.value = null; }
const label = computed(() => {
  const w = here.value;
  if (!w) return tr("付ける", "Add");
  const name = `${w === "fracture" ? "✦" : "✓"} ${wayName(w)}`;
  return props.tier === 1 ? name : tr(`${name} (${props.rank} 以上)`, `${name} (${props.rank}+)`);
});
</script>

<template>
  <span ref="el" data-mod-attach-wrap class="inline-flex max-w-full flex-col items-end gap-1 align-middle">
    <button type="button" data-mod-attach class="tbtn" :class="here ? (here === 'fracture' ? 'on !text-mod-fractured' : 'on') : ''" :aria-expanded="open"
      :title="here ? tr('押すと付け方を替える・外す', 'Click to change how it is added, or remove it') : (block ?? tr(`${rank} 以上を完成の狙いにする (付け方を選ぶ)`, `Make ${rank}+ a final target (pick how it is added)`))"
      @click.stop="toggleOpen">{{ label }}</button>
    <span v-if="open" data-mod-attach-ways class="flex flex-wrap justify-end gap-1 whitespace-normal">
      <button v-for="w in ATTACH_WAYS" :key="w" type="button" class="tbtn" :data-attach-way="w" :aria-disabled="!!blockOf(w)"
        :class="[blockOf(w) ? 'opacity-35' : '', here === w ? (w === 'fracture' ? 'on !text-mod-fractured' : 'on') : '']"
        :title="blockOf(w) ?? undefined" @click.stop="choose(w)">{{ w === "fracture" ? "✦ " : "" }}{{ wayName(w) }}</button>
      <button v-if="aim" type="button" data-attach-off class="tbtn" @click.stop="detach">{{ tr("外す", "Remove") }}</button>
    </span>
    <span v-if="open && why" data-attach-why class="max-w-[16rem] whitespace-normal break-words rounded bg-rose-500/10 px-2 py-0.5 text-right text-[11px] text-rose-100">{{ why }}</span>
  </span>
</template>
