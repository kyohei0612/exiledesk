<!--
  TreeHandChip.vue — 矢印の上の打つ手の札 (押すと替える・消す)。SimTreePage から分けた (2026-10-22)。
  カレンシー・お告げ・カタリストのアイコンの列 + カレンシーの名前だけ、全文は乗せた時 (前は 1 行の全文で、長いと … で切れた)
  (オーナー 10-22「高貴なオーブ (完全) + 触媒の高貴のお告げ + 右… が切れて何の手か分からない」)
-->
<script setup lang="ts">
import { computed } from "vue";
import type { Hand } from "../../../services/simulator/tree/tree-model";
import { handIcon as iconOf, handLabel, handName } from "./tree-names";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import { holdsAt } from "../../../services/simulator/tree/tree-foresee";
import { isRevealHand, veilKeep, veilPick } from "../../../services/simulator/tree/tree-veil";

/** hand が無い = 分かれ目の札 (split = 行の数。打たずに分ける、10-22) */
/** room = 札の幅の上限 (ツリーの座標、use-tree-edges の chipRoom) */
/** choice = スマホの道で選んだ枝の MOD (札の中に出す、S-94h) */
const props = defineProps<{ hand: Hand | null; split?: number; id: string; x: number; y: number; inv: number; off: boolean; room: number; choice?: string }>();
defineEmits<{ open: [] }>();
/** アイコンの列 (カレンシー → お告げ) */
const icons = computed(() => (props.hand ? [props.hand.currency, ...props.hand.omens] : []).filter((k) => !!iconOf(k)));
/** 札の幅の上限: 隣の札と重ならない幅 (倍率で拡げる分を戻す)。はみ出す名前は折り返して全文 (10-26 オーナー「切れる所も直させて」、前は … で切って全文は乗せた時) */
/**
 * ルーンの手 (札に小さく「ルーン」)。木の側で自動に嵌めるルーンは無い (11-05 オーナー「ツリーに勝手に足しやがって2度とすんなまじで」)
 */
const runeOn = computed((): string | null => {
  const h = props.hand;
  if (!h) return null;
  return h.currency.startsWith("rune:") ? handName(h.currency) : null;
});
/** 予見の枠の手 (ヒネコラの後) は「打つ」でなく「持つ」(S-39、11-05 オーナー「ヒネコラ後は打つじゃなくて持つになる」) */
const t = useTree();
const hold = computed(() => !!props.hand && holdsAt(t.doc.value, props.id));
const maxW = computed(() => `${Math.round(props.room / props.inv)}px`);
</script>

<template>
  <!-- w-max: 札は文の幅で広がる (absolute の幅は left から入れ物の右の端までに縮み、右の方の札が「カオス…」と切れた、10-26。上限は room) -->
  <button v-if="!hand" type="button" data-tree-split-chip :data-hand-of="id" class="nodrag nopan pointer-events-auto absolute z-[5] flex w-max -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-teal-400/60 bg-[#0f1a18] px-3 py-0.5 text-[12px] font-semibold text-teal-100 shadow-[0_2px_10px_rgba(0,0,0,0.6)] hover:border-teal-300"
    :class="off ? '!pointer-events-none' : ''" :style="{ left: `${x}px`, top: `${y}px`, scale: String(inv) }" :title="tr('打たずに分ける: 上の行から見て、合った行の箱へ進む (押すと行を替える)', 'Split without crafting: go to the first matching row (click to edit rows)')" @click="$emit('open')">
    ◇ {{ tr(`分かれ目 (${split ?? 0} 行)`, `Split (${split ?? 0} rows)`) }}<span v-if="choice" data-tree-hand-choice class="text-amber-200">→ {{ choice }} ▾</span>
  </button>
  <button v-else type="button" data-tree-hand :data-hand-of="id" class="nodrag nopan pointer-events-auto absolute z-[5] flex w-max -translate-x-1/2 items-center gap-1.5 py-0.5 pl-1.5 pr-3 -translate-y-1/2 rounded-2xl border border-amber-400/60 bg-[#1a140d] text-[12px] font-semibold text-amber-100 shadow-[0_2px_10px_rgba(0,0,0,0.6)] hover:border-amber-300 hover:bg-[#2a2014]"
    :class="off ? '!pointer-events-none' : ''" :style="{ left: `${x}px`, top: `${y}px`, scale: String(inv), maxWidth: maxW }" :title="handLabel(hand)" @click="$emit('open')">
    <span v-if="hold" data-tree-hand-hold class="shrink-0 rounded-sm bg-violet-400/25 px-1 text-[10px] text-violet-100" :title="tr('予見の枠: まだ使わずに持って結果を見る', 'Foresight: held, not used yet')">{{ tr("持つ", "Hold") }}</span>
    <span class="flex shrink-0 items-center gap-0.5"><img v-for="k in icons" :key="k" :src="iconOf(k)" alt="" class="size-6 object-contain" /></span>
    <!-- お告げも文字で (10-26 モンキー 7 の 24: 絵だけでアビスの反響が読めなかった)。全文は乗せた時の title -->
    <span data-tree-hand-name class="min-w-0 whitespace-normal break-words leading-tight">{{ [hand.currency, ...hand.omens].map((k) => handName(k)).join(" + ") }}</span>
    <!-- カオススパムオーブ (当たるまで) は横にカオスの段の名前 -->
    <!-- 狙い無しの手 (結果は「打った後」の箱 1 つ。札が高貴だけで狙い無しと分からなかった、10-22 白紙から組んだ試し) -->
    <!-- 骨は 3 択 (S-37、11-07): 未発現のままは「未発現」、発現させて狙い無しは「発現・狙い無し」 -->
    <span v-if="hand.free || veilKeep(hand)" data-tree-hand-free-tag class="shrink-0 rounded-sm bg-white/15 px-1 text-[10px]">{{ veilKeep(hand) ? tr("未発現", "unrevealed") : veilPick(hand) && !isRevealHand(hand.currency) ? tr("発現・狙い無し", "reveal, no target") : tr("狙い無し", "no target") }}</span>
    <span v-if="runeOn" data-tree-hand-rune class="shrink-0 rounded-sm bg-sky-400/20 px-1 text-[10px] text-sky-100" :title="tr(`この手でルーンが嵌まる: ${runeOn} (一度嵌まったら戻っても嵌まったまま)`, `A rune is socketed at this step: ${runeOn} (stays socketed on return paths)`)">{{ tr("ルーン", "Rune") }}</span>
    <span v-if="choice" data-tree-hand-choice class="min-w-0 whitespace-normal break-words rounded-sm bg-amber-400/20 px-1 leading-tight text-amber-200">{{ choice }} ▾</span>
  </button>
</template>
