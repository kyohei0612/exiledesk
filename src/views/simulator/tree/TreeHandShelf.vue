<!--
  TreeHandShelf.vue — ツリーの右の欄: 箱の次に打つ手を、クラフト台のカレンシーの棚から選ぶ (2026-10-22 オーナー「下の＋も同じ感じにしてええよ」、TreeHandPick の置き換え)。
  その箱の見本 (tree-sample.ts) を provideShelf で棚に渡すので、打てない手は灰色。持った物 + お告げを「この手にする」で箱の手に。
  結果の箱は手の種類で決める (カオス = 入れ替え、消去 = 消す、カタリスト = 品質だけ、それ以外 = 足す、カオススパム = 当たりだけ)。入力はカオススパムだけ。
  触媒のお告げの手は、前に「品質だけ上げる手」(カタリストの札) を自動で足す (10-22 オーナーの案 A。前の「先に打つカタリスト」の選びと 1 枚札は消した)。
  10-22 オーナー「今の箱の時点のアイテムに付けるイメージ」: 上にその箱の時点のアイテムのカード、棚から持ってカードを押すとその手になる (エミュと同じ、文字のボタンは無し)。
  「狙い無し」と骨のアビスの反響はお告げの枠の中 (HeldOmens の slot、お告げと同じ並び)。重ね窓の枠は TreeHandPage
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw } from "vue";
import { craftStage as s, iconOf, nameOf } from "../../../state/craft-stage";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import CurrencyShelf from "../../../components/for-share/shelf/CurrencyShelf.vue";
import HeldOmens from "../../../components/for-share/shelf/HeldOmens.vue";
import { omensAllowedFor, type StageItem } from "../../../services/craft-stage/engine";
import { omensFor } from "../../../services/craft-stage/engine";
import { aimHeldOn } from "../../../services/simulator/tree/tree-aim";
import { effectOf } from "../../../services/simulator/tree/tree-hands";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { CATALYSING, canSpam, ECHO, isBone, isCatalyst, TREE_CATALYSTS } from "../../../services/simulator/tree/tree-hands";
import { handLabel, handName, outName } from "./tree-names";
import { treeRowTags } from "./tree-row-tags";
import { setHand, type Aim, type Hand, type HandKind, type OutKind } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";
import { useSimShelf } from "../use-sim-shelf";
import { afterQualityOf, autoCatOf, handOf, hitAimsOf, kindOf, needAimOf, onlyOf, preFillOf, problemOf } from "./tree-hand-plan";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ boxId: string; current: Hand | null }>();
/** pick の preCatalyst = 前に足す品質だけ上げる手のカタリスト (触媒のお告げで、まだ品質を上げる手の後でない時) */
/** only = 結果が 1 通りの手の結果 (tree-sample の singleOutOf、光のお告げ + 消去など) */
/** back = 打たずに既にある箱へ戻す (重ね窓を閉じて箱を押して選ぶ) */
const emit = defineEmits<{ pick: [hand: Hand, kind: HandKind, aims: Aim[], preCatalyst: string | null, only: { out: OutKind; aim: Aim | null } | null]; clear: []; close: []; split: []; back: []; aim: [] }>();
const t = useTree();

const sample = computed(() => (s.data.value ? sampleOf(s.data.value, t.doc.value, props.boxId, 1) : null));
const item = computed(() => sample.value?.item ?? null);
/** 狙いに当たらない MOD の行は「外れ MOD」(乗せた時のカードと同じ、10-25 オーナー「プラスで MOD 選んだ時ハズレ MOD の表示が溶けてる」) */
const rowTags = (it: StageItem | null) => (s.data.value && it ? treeRowTags(s.data.value, t.doc.value, t.doc.value.boxes[props.boxId]?.unwanted ?? [], it) : null);
/** 当たりの MOD が決まっていない当たりの箱 (棚は出さずに先に MOD を選ばせる、tree-hand-plan の needAimOf) */
const needAim = computed(() => needAimOf(t.doc.value, props.boxId, sample.value?.note));
const held = ref<string | null>(props.current?.currency ?? null);
const omens = ref<string[]>(props.current ? [...props.current.omens] : []);
const spam = ref(!!props.current?.repeat);
const spamMax = ref<number | null>(props.current?.repeat?.max ?? null);
/** 狙い無し (足す手だけ。カオススパムとは一緒にしない) */
const free = ref(!!props.current?.free);
/** フラクチャーの手で ✦ にする狙い (modId。null = 乱数 = エンジンどおり、10-22 オーナー) */
const fracOf = ref<string | null>(props.current?.fractureOf ?? null);
const isFracture = computed(() => !!held.value && effectOf(held.value) === "fracture");
/** ✦ の候補 = 完成の狙い (この箱の見本に付いていない物はグレー) */
const fracChoices = computed(() => { const d = s.data.value, it = item.value; return t.goals.value.map((a) => ({ a, on: !!d && !!it && aimHeldOn(d, it, a, { sameText: true }) })); });
/** ✦ にする狙い (選んでいなければ、この箱で付いている最初の狙い。必ずどれか 1 つを固定、10-24 オーナー) */
const fracPick = computed(() => fracOf.value ?? fracChoices.value.find((c) => c.on)?.a.modId ?? null);
/** 骨の手にアビスの反響 (発現の候補を 1 回引き直す)。既定で付ける (10-22 オーナー「お告げは必ず反響を使わんとやばいよ」)。前の手を開いた時はその手のまま */
const echo = ref(props.current ? props.current.omens.includes(ECHO) : true);
const canFree = computed(() => !!held.value && effectOf(held.value) === "add");
/** Esc: 今の手を替えている時は欄ごと取り消す (何も替えない、オーナー 10-22「枠の外・Esc で取り消し」)。新しい手の時は持った物を離す */
function onKey(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  if (props.current) { emit("close"); e.stopImmediatePropagation(); }
  else if (held.value) { release(); e.stopImmediatePropagation(); }
}
onMounted(() => window.addEventListener("keydown", onKey, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey, true));
/** 持つ / 離す (クラフト台と同じ: 同じ物をもう一度押す・右クリック・Esc = 離す。お告げの欄も閉じる、オーナー 10-22) 棚・打てるかは use-sim-shelf */
/** この箱が品質だけ上げる手の後 (通り抜け) か */
const afterQuality = computed(() => afterQualityOf(t.doc.value, props.boxId));
/** 持った物に触媒のお告げが掛けられるか */
const canCatalyse = computed(() => !!held.value && omensAllowedFor(held.value).includes(CATALYSING));
/** 前に足すカタリストの既定 (tree-hand-plan の autoCatOf) */
const autoCat = computed((): string | null => { const d = s.data.value, it = item.value; return d && it ? autoCatOf(d, t.doc.value, it) : null; });
/**
 * 棚に渡すアイテム = 前にカタリストの手を足す時はそれで品質を最大まで入れた後 (品質 0 では触媒のお告げが「品質が要る」で掛けられない。
 * 前は品質 0 の見本を渡していて、触媒の手を開き直すとお告げが外れていた、10-22)
 */
const needPre = computed(() => canCatalyse.value && !afterQuality.value);
const preFill = computed(() => { const d = s.data.value, it = item.value; return d && it ? preFillOf(d, it, needPre.value, autoCat.value) : null; });
const shelfItem = computed(() => preFill.value?.item ?? item.value);
const { release, onHold, onShelfDown } = useSimShelf(shelfItem, held, omens);
const used = computed(() => (held.value ? omensFor(held.value, omens.value) : []));
const catalysing = computed(() => used.value.includes(CATALYSING));

const hand = computed((): Hand | null => (held.value ? handOf({ held: held.value, omens: omens.value, spam: spam.value, spamMax: spamMax.value, free: free.value && canFree.value, echo: echo.value, fractureOf: isFracture.value ? fracPick.value : null }) : null));
/** 前に足すカタリスト (触媒のお告げを使い、まだ品質を上げる手の後でない時) */
const preCat = computed((): string | null => (catalysing.value && !afterQuality.value ? autoCat.value : null));
const RESULT: Record<HandKind, [string, string]> = {
  add: ["当たり + 外れ", "Hit + Miss"], remove: ["外れが消えた + 狙いが消えた", "Miss removed + Target lost"], swap: ["当たり + 狙いが消えた + 外れ", "Hit + Target lost + Miss"], spam: ["当たりだけ (当たるまで打つ)", "Hits only (until a hit)"], free: ["打った後 (何が付いても次へ。当たり / 外れに分けない)", "After (anything counts, no hit / miss split)"],
  quality: ["無し (品質を最大まで上げて、下の＋で次の手)", "None (raise quality to max, then add the next craft with + below)"],
  essence: ["付いた + 狙いが消えた (付く MOD は必ず付く)", "Added + Target lost (the essence mod always lands)"],
  fracture: ["狙いが ✦ になった (必ず選んだ狙いを固定)", "The target fractured (always fixes the chosen target)"],
};
/** 狙いを持って着く人がいない箱では「狙いが消えた」を作らない時の文 (tree-model の setHand、tree-lost.ts) */
const RESULT_NO_LOST: Partial<Record<HandKind, [string, string]>> = { remove: ["外れが消えた", "Miss removed"], swap: ["当たり + 外れ", "Hit + Miss"], essence: ["付いた (付く MOD は必ず付く)", "Added (the essence mod always lands)"] };
const kind = computed((): HandKind | null => (hand.value ? kindOf(hand.value) : null));
/** 結果の箱の文 (写しに手を付けて「狙いが消えた」が出来るかを見る) */
const resultText = computed((): [string, string] | null => {
  const h = hand.value, k = kind.value;
  if (!h || !k) return null;
  const alt = RESULT_NO_LOST[k];
  if (!alt) return RESULT[k];
  const d = structuredClone(toRaw(t.doc.value));
  setHand(d, props.boxId, h, k, hitAims.value, null);
  return d.boxes[props.boxId]?.outs.some((o) => d.boxes[o]?.out === "lost") ? RESULT[k] : alt;
});
/** 当たりの箱の既定 (tree-hand-plan の hitAimsOf) */
const hitAims = computed((): Aim[] => { const d = s.data.value, it = item.value, h = hand.value; return d && it && h ? hitAimsOf(d, t.doc.value, props.boxId, it, h, t.goals.value, isFracture.value ? fracPick.value : null) : []; });
/** 結果が 1 通りの手か (tree-hand-plan の onlyOf) */
const only = computed(() => (hand.value && s.data.value ? onlyOf(s.data.value, t.doc.value, props.boxId, hand.value, preCat.value, hitAims.value) : null));
/** この手に替えると消える箱の数 (結果の箱から先。手の種類が同じなら 0。写しに打って数える) */
const gone = computed((): number => {
  const h = hand.value, k = kind.value;
  if (!props.current || !h || !k) return 0;
  const d = structuredClone(toRaw(t.doc.value));
  const before = Object.keys(d.boxes).length;
  setHand(d, props.boxId, h, k, hitAims.value, only.value);
  const kept = new Set(Object.keys(d.boxes));
  return before - Object.keys(t.doc.value.boxes).filter((id) => kept.has(id)).length;
});
/** この箱の見本に打てない手は確定させない (tree-hand-plan の problemOf) */
const problem = computed((): string | null => (hand.value && item.value && s.data.value ? problemOf(s.data.value, item.value, hand.value, hitAims.value, preCat.value, preFill.value) : null));
/** お告げの並びに置く札 (お告げのボタンと同じ高さ) */
const OMEN_CHIP = "flex min-h-12 max-w-[96px] items-center justify-center rounded-lg border border-white/15 bg-black/30 px-2 text-center text-[11px] leading-tight hover:border-violet-300/60";
const OMEN_ON = "!border-violet-300 bg-violet-500/30 text-violet-50";
function ok(): void {
  const h = hand.value, k = kind.value;
  if (h && k && !problem.value) emit("pick", h, k, hitAims.value, preCat.value, only.value);
}
</script>

<template>
  <!-- エミュのクラフトの画面と同じ並び: 左にアイテムのカード (幅もエミュと同じ既定)、右にカレンシーの棚。スマホは縦積み (カードが上) (10-24 オーナー「右側カレンシーで左側アイテムの姿勢はエミュ産で慣れてる」) -->
  <div v-if="needAim" data-tree-hand-need-aim class="flex flex-col items-start gap-3 py-6 text-[14px]">
    <p>{{ tr("この当たりの箱は、まだ当たりの MOD が決まっていません。先に MOD を選ぶと、この箱のアイテムができて次の手を選べます", "This hit box has no target mod yet. Pick the mod first; then the item at this box exists and you can choose the next craft") }}</p>
    <button type="button" data-tree-hand-pick-aim class="g-btn-red min-h-10 px-4" @click="emit('aim')">{{ tr("当たりの MOD を選ぶ", "Pick the hit mod") }}</button>
  </div>
  <div v-else data-tree-hand-pick class="grid min-h-0 items-start gap-4 text-[13px] md:grid-cols-[auto_minmax(0,1fr)]" @contextmenu="held && ($event.preventDefault(), release())">
    <!-- この箱の時点のアイテム (見本)。持ってカードを押す = この手にする (エミュと同じ操作) -->
    <!-- カードの下はエミュと同じく空ける (持っている間はカードのすぐ下に「押すと使う · 右クリック / Esc で手放す」が重ねて出る) -->
    <div class="flex min-w-0 flex-col gap-8 md:w-[480px]">
      <div data-tree-hand-card :class="held && problem ? 'cursor-not-allowed opacity-60' : ''" :title="problem ?? undefined"><StageItemCard v-if="shelfItem" :item="preCat ? shelfItem : item ?? shelfItem" :row-tags="rowTags(preCat ? shelfItem : item ?? shelfItem)" :added="[]" :removed="[]" :holding="!!held && !problem" :flash-key="0" @use="ok" /></div>
      <div class="flex min-w-0 flex-col gap-1.5">
        <p class="text-[12px] opacity-70">{{ tr("棚から持って、カードを押すとこの箱の次の手になる", "Hold a currency from the shelf and click the item to make it this box's next craft") }}</p>
        <!-- 打たずに分ける (分かれ目、10-22 オーナー OK): 今の形 (揃った狙い・外れの数) で行き先を分ける。始まりの箱では出さない -->
        <button v-if="t.doc.value.boxes[boxId]?.out !== 'start'" type="button" data-tree-split class="g-btn sm self-start" :title="tr('手を打たずに、今の形 (揃った狙いの数・外れの数) で行き先を分ける', 'Do not craft; branch by the current shape (targets held, misses)')" @click="emit('split')">◇ {{ tr("打たずに分ける (分かれ目)", "Split without crafting") }}</button>
        <button v-if="t.doc.value.boxes[boxId]?.out !== 'start'" type="button" data-tree-hand-back class="g-btn sm self-start" :title="tr('打たずに既にある箱へ戻す (窓を閉じて、戻り先の箱を押す)', 'Return to an existing box instead (closes this window; click the box)')" @click="emit('back')">↩ {{ tr("既にある箱へ戻す", "Return to a box") }}</button>
        <button v-if="current" type="button" class="g-btn sm self-start" @click="emit('clear')">{{ tr("この手を消す (下も消える)", "Remove this craft (and below)") }}</button>

    <!-- 持っている物と、残した入力 (触媒のカタリストの品質・カオススパム) -->
    <div v-if="held" class="flex flex-col gap-1.5 rounded-md bg-white/[0.04] p-2">
      <div class="flex min-w-0 items-center gap-1.5">
        <span class="flex shrink-0 items-center -space-x-1"><img v-for="ic in [held, ...used].filter((x) => !!iconOf(x))" :key="ic" :src="iconOf(ic)" alt="" class="size-6 object-contain" /></span>
        <b class="min-w-0 truncate" :title="hand ? handLabel(hand) : ''">{{ [nameOf(held), ...used.map(nameOf)].join(" + ") }}</b>
      </div>
      <!-- カタリストの手はここで種類を替える (棚にカタリストが無い、10-22 13 通り組んだ #7) -->
      <div v-if="isCatalyst(held)" data-tree-hand-cats class="flex flex-wrap gap-1">
        <!-- 絵は相場に無く出ないので名前 (「のカタリスト」を省く、10-22 開発版で空の四角が並んだ) -->
        <button v-for="c in TREE_CATALYSTS" :key="c" type="button" data-tree-hand-cat :data-cat="c" class="min-h-7 rounded-md border px-2 text-[12px]" :class="c === held ? 'border-amber-300 bg-amber-500/20 text-amber-100' : 'border-white/10 hover:bg-white/10'" :title="nameOf(c)" :aria-pressed="c === held" @click="held = c">{{ nameOf(c).replace(/のカタリスト$| Catalyst$/, "") }}</button>
      </div>
      <p v-if="preCat" data-tree-hand-pre-cat class="text-[12px] text-sky-200/90">{{ tr(`前に「${handName(preCat)} (品質を最大まで)」の手を足す (札を押すとカタリストを替えられる)`, `Adds "${handName(preCat)} (to max quality)" before this (click its chip to change the catalyst)`) }}</p>
      <!-- フラクチャー: ✦ にする MOD を狙いから選ぶ。必ずその狙いを固定し、外れは費用で数える (10-24 オーナー「2 回外れて 1 回当たり」。前の「乱数」の選択肢はやめた) -->
      <div v-if="isFracture" data-tree-hand-frac class="flex flex-col gap-1 text-[12px]">
        <div class="flex flex-wrap items-center gap-1">
          <span class="opacity-80">{{ tr("✦ にする MOD", "Fracture") }}</span>
          <button v-for="c in fracChoices" :key="c.a.modId" type="button" data-tree-hand-frac-pick :data-frac="c.a.modId" class="min-h-7 max-w-[220px] truncate rounded-md border px-2" :class="[fracPick === c.a.modId ? 'border-amber-300 bg-amber-500/20 text-amber-100' : 'border-white/10 hover:bg-white/10', c.on ? '' : 'opacity-40']" :title="c.on ? t.startModLabel(c.a, true) : tr('この箱の時点では付いていない', 'Not on the item at this box')" @click="fracOf = c.a.modId">✦ {{ t.startModLabel(c.a, true) }}</button>
        </div>
        <p data-tree-hand-frac-rule class="opacity-70">{{ tr("固定できる MOD が 2 つ以上なら、2 回外れて 1 回当たりとして、ここまでの費用とフラクチャーを 2 回分足す", "With 2+ mods that could fracture, counts as 2 misses then a hit: adds this point's cost and the Fracturing Orb twice") }}</p>
      </div>
      <label v-if="canSpam(held)" class="flex min-h-7 cursor-pointer flex-wrap items-center gap-2">
        <input v-model="spam" type="checkbox" />{{ tr("当たるまで繰り返す (カオススパム)", "Repeat until a hit (Chaos spam)") }}
        <span v-if="spam" class="flex items-center gap-1 text-[12px] opacity-80">{{ tr("上限", "Max") }}<input v-model.number="spamMax" type="number" min="1" class="h-7 w-16 rounded-md border border-white/15 bg-black/40 px-1 text-right" :placeholder="tr('なし', 'none')" />{{ tr("回", "") }}</span>
      </label>
      <p v-if="kind" class="text-[11px] opacity-70">{{ tr("結果の箱", "Result boxes") }}: {{ only ? tr(`${outName(only.out)}だけ (結果は 1 通り)`, `${outName(only.out)} only (one possible result)`) : resultText ? tr(resultText[0], resultText[1]) : "" }}</p>
      <!-- 替える時は、消える箱の数を先に小さく (オーナー 10-22。1 つ戻す / Ctrl+Z で戻せる)。持ち直しは棚で別の物を押すだけ。決めるのはカードを押す -->
      <div class="flex flex-wrap items-center gap-1.5">
        <span v-if="problem" data-tree-hand-problem class="text-[11px] text-rose-200/90">{{ tr(`この箱では打てない: ${problem}`, `Can't be used on this box: ${problem}`) }}</span>
        <span v-else-if="gone" data-tree-hand-gone class="text-[11px] text-rose-200/90">{{ tr(`替えると下の ${gone} 箱が消える (1 つ戻すで戻せる)`, `Replacing removes ${gone} box(es) below (Undo restores)`) }}</span>
      </div>
    </div>
      </div>
    </div>

    <div data-tree-shelf @pointerdown="onShelfDown">
      <CurrencyShelf @hold="onHold">
        <!-- 持った物に掛けられるお告げ = クラフト台と同じ部品と置き場 (HeldOmens.vue を持ったアイコンのすぐ下に重ねる。inline-held だと棚の一番下で見切れた、10-21 本物のマウス)。
             足す手は同じ欄に「狙い無し」(適当打ち、オーナー 10-22「お告げの欄の中に適当打ちがまだ無い」) -->
        <template v-if="omensAllowedFor(held).length || canFree || (!!held && isBone(held))" #held><HeldOmens>
          <!-- お告げと同じ並びの札 (10-22 オーナー「狙い無しはお告げの枠の中に」): アビスの反響 (骨) と狙い無し (足す手) -->
          <button v-if="held && isBone(held)" type="button" data-tree-hand-echo :aria-pressed="echo" :class="[OMEN_CHIP, echo ? OMEN_ON : '']" :title="tr('アビスの反響のお告げ (発現の候補を 1 回引き直す)', 'Omen of Abyssal Echoes (reroll the reveal options once)')" @click="echo = !echo">{{ tr("アビスの反響", "Abyssal Echoes") }}</button>
          <button v-if="canFree" type="button" data-tree-hand-free :aria-pressed="free" :class="[OMEN_CHIP, free ? OMEN_ON : '']" :title="tr('狙い無し (空きを 1 つ埋めるだけ。当たり / 外れに分けない)', 'No target (just fill an open slot; no hit / miss split)')" @click="free = !free">{{ tr("狙い無し", "No target") }}</button>
        </HeldOmens></template>
      </CurrencyShelf>
    </div>
  </div>
</template>
