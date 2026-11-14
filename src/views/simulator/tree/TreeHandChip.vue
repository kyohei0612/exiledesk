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
import { useSurfaceDoc } from "./tree-surface";
import { holdsAt } from "../../../services/simulator/tree/tree-foresee";
import { isRevealHand, veilKeep, veilPick } from "../../../services/simulator/tree/tree-veil";
import { parseRuneKey } from "../../../services/craft-stage/engine";
import { isWhittleHand, type LvClass } from "../../../services/simulator/tree/tree-whittle";
import { lvLook } from "./tree-whittle-marks";
import { CHIP_K } from "../../../services/simulator/tree/tree-row-tops";

/** hand が無い = 分かれ目の札 (split = 行の数。打たずに分ける、10-22) */
/** room = 札の幅の上限 (ツリーの座標、use-tree-edges の chipRoom) */
/** choice = スマホの道で選んだ枝の MOD (札の中に出す、S-94h) */
/** lane = 削減の手前の枠の枝の札 (S-65c ⑫、スイッチ treeLaneOwnHand): 縁を枠の色に、頭に ▼ 低い / ＝ 同じ / ▲ 高い の印 (どの枠の手かを札で読める) */
/** links = 畳んで緑の線だけでつなぐ行き先の数 (S-142j ③、スイッチ linkChipHover): 1 以上なら札の上に「行き先は同じ枠へ」(線はふだん描かない) */
const props = defineProps<{ hand: Hand | null; split?: number; id: string; x: number; y: number; inv: number; off: boolean; room: number; choice?: string; lane?: LvClass | null; links?: number }>();
const LANE: Record<LvClass, [string, string]> = { lo: ["▼ 低い", "▼ Lower"], eq: ["＝ 同じ", "= Same"], hi: ["▲ 高い", "▲ Higher"] };
const laneRgb = computed(() => (props.lane ? lvLook(props.lane).rgb : null));
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
  return parseRuneKey(h.currency) ? handName(h.currency) : null;
});
/** 予見の枠の手 (ヒネコラの後) は「打つ」でなく「持つ」(S-39、11-05 オーナー「ヒネコラ後は打つじゃなくて持つになる」) */
const sd = useSurfaceDoc(); // この描き面の木 (S-09c。面の外では今のタブの木)
const hold = computed(() => !!props.hand && holdsAt(sd.doc.value, props.id));
const maxW = computed(() => `${Math.round(props.room / (props.inv * CHIP_K))}px`);
/** 札の倍率 (画面の倍率の戻し × 札の大きさ、スイッチ hitsSide で 1.5 倍) */
const sc = computed(() => String(props.inv * CHIP_K));
/**
 * 削減の手 (削減のお告げ付き) で ☑ が無い = 当たりの箱が無い時も「狙い無し」(S-23。11-11 オーナー「狙い無しなら削減のカレンシーの枝の途中の枠に狙い無しってかかれるはず」)。
 * 削減の手は狙い無しの印 free を持たない作り (付く MOD を選べない手の表 FREE_EFFECTS の外) なので、前から札に出ていなかった
 */
const whittleNoAim = computed(() => {
  const h = props.hand, b = sd.doc.value.boxes[props.id];
  return !!h && !h.free && isWhittleHand(h) && !!b?.outs.length && !b.outs.some((o) => sd.doc.value.boxes[o]?.out === "hit");
});
</script>

<template>
  <!-- w-max: 札は文の幅で広がる (absolute の幅は left から入れ物の右の端までに縮み、右の方の札が「カオス…」と切れた、10-26。上限は room) -->
  <button v-if="!hand" type="button" data-tree-split-chip :data-hand-of="id" class="nodrag nopan pointer-events-auto absolute z-[5] flex w-max -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-teal-400/60 bg-[#0f1a18] px-3 py-0.5 text-[12px] font-semibold text-teal-100 shadow-[0_2px_10px_rgba(0,0,0,0.6)] hover:border-teal-300"
    :class="off ? '!pointer-events-none' : ''" :style="{ left: `${x}px`, top: `${y}px`, scale: sc }" :title="tr('打たずに分ける: 上の行から見て、合った行の箱へ進む (押すと行を替える)', 'Split without crafting: go to the first matching row (click to edit rows)')" @click="$emit('open')">
    <span v-if="links" data-tree-hand-link-tag class="pointer-events-none absolute bottom-full left-1/2 mb-1 w-max -translate-x-1/2 whitespace-nowrap rounded-sm border border-[#6fd08c]/60 bg-[#0f1a12] px-1.5 text-[10px] font-semibold leading-4 text-[#9fe3b4]">{{ tr(links > 1 ? `行き先は同じ枠へ (${links})` : "行き先は同じ枠へ", links > 1 ? `Goes to the same box (${links})` : "Goes to the same box") }}</span>
    ◇ {{ tr(`分かれ目 (${split ?? 0} 行)`, `Split (${split ?? 0} rows)`) }}<span v-if="choice" data-tree-hand-choice class="text-amber-200">→ {{ choice }} ▾</span>
  </button>
  <button v-else type="button" data-tree-hand :data-hand-of="id" class="nodrag nopan pointer-events-auto absolute z-[5] flex w-max -translate-x-1/2 items-center gap-1.5 py-0.5 pl-1.5 pr-3 -translate-y-1/2 rounded-2xl border border-amber-400/60 bg-[#1a140d] text-[12px] font-semibold text-amber-100 shadow-[0_2px_10px_rgba(0,0,0,0.6)] hover:border-amber-300 hover:bg-[#2a2014]"
    :class="off ? '!pointer-events-none' : ''" :style="{ left: `${x}px`, top: `${y}px`, scale: sc, maxWidth: maxW, ...(laneRgb ? { borderColor: `rgb(${laneRgb})` } : {}) }" :data-hand-lane="lane || undefined" :title="handLabel(hand)" @click="$emit('open')">
    <span v-if="links" data-tree-hand-link-tag class="pointer-events-none absolute bottom-full left-1/2 mb-1 w-max -translate-x-1/2 whitespace-nowrap rounded-sm border border-[#6fd08c]/60 bg-[#0f1a12] px-1.5 text-[10px] font-semibold leading-4 text-[#9fe3b4]">{{ tr(links > 1 ? `行き先は同じ枠へ (${links})` : "行き先は同じ枠へ", links > 1 ? `Goes to the same box (${links})` : "Goes to the same box") }}</span>
    <span v-if="lane && laneRgb" data-tree-hand-lane class="shrink-0 rounded-sm px-1 text-[10px] font-bold text-black" :style="{ background: `rgb(${laneRgb})` }">{{ tr(LANE[lane][0], LANE[lane][1]) }}</span>
    <span v-if="hold" data-tree-hand-hold class="shrink-0 rounded-sm bg-violet-400/25 px-1 text-[10px] text-violet-100" :title="tr('予見の枠: まだ使わずに持って結果を見る', 'Foresight: held, not used yet')">{{ tr("持つ", "Hold") }}</span>
    <span class="flex shrink-0 items-center gap-0.5"><img v-for="k in icons" :key="k" :src="iconOf(k)" alt="" class="size-6 object-contain" /></span>
    <!-- お告げも文字で (10-26 モンキー 7 の 24: 絵だけでアビスの反響が読めなかった)。全文は乗せた時の title -->
    <span data-tree-hand-name class="min-w-0 whitespace-normal break-words leading-tight">{{ [hand.currency, ...hand.omens].map((k) => handName(k)).join(" + ") }}</span>
    <!-- カオススパムオーブ (当たるまで) は横にカオスの段の名前 -->
    <!-- 狙い無しの手 (結果は「打った後」の箱 1 つ。札が高貴だけで狙い無しと分からなかった、10-22 白紙から組んだ試し) -->
    <!-- 骨は 3 択 (S-37、11-07): 未発現のままは「未発現」、発現させて狙い無しは「発現・狙い無し」 -->
    <span v-if="hand.free || veilKeep(hand) || whittleNoAim" data-tree-hand-free-tag class="shrink-0 rounded-sm bg-white/15 px-1 text-[10px]">{{ veilKeep(hand) ? tr("未発現", "unrevealed") : veilPick(hand) && !isRevealHand(hand.currency) ? tr("発現・狙い無し", "reveal, no target") : tr("狙い無し", "no target") }}</span>
    <span v-if="runeOn" data-tree-hand-rune class="shrink-0 rounded-sm bg-sky-400/20 px-1 text-[10px] text-sky-100" :title="tr(`この手でルーンが嵌まる: ${runeOn} (一度嵌まったら戻っても嵌まったまま)`, `A rune is socketed at this step: ${runeOn} (stays socketed on return paths)`)">{{ tr("ルーン", "Rune") }}</span>
    <span v-if="choice" data-tree-hand-choice class="min-w-0 whitespace-normal break-words rounded-sm bg-amber-400/20 px-1 leading-tight text-amber-200">{{ choice }} ▾</span>
  </button>
</template>
