<!--
  TreeHandShelf.vue — ツリーの右の欄: 箱の次に打つ手を、クラフト台のカレンシーの棚から選ぶ (2026-10-22 オーナー「下の＋も同じ感じにしてええよ」、TreeHandPick の置き換え)。
  その箱の見本 (tree-sample.ts) を provideShelf で棚に渡すので、打てない手は灰色。持った物 + お告げを「この手にする」で箱の手に。
  結果の箱は手の種類で決める (カオス = 入れ替え、消去 = 消す、カタリスト = 品質だけ、それ以外 = 足す、カオススパム = 当たりだけ)。入力はカオススパムだけ。
  触媒のお告げの手は、前に「品質だけ上げる手」(カタリストの札) を自動で足す (10-22 オーナーの案 A。前の「先に打つカタリスト」の選びと 1 枚札は消した)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw } from "vue";
import { craftStage as s, iconOf, nameOf } from "../../../state/craft-stage";
import CurrencyShelf from "../../craft-stage/CurrencyShelf.vue";
import HeldOmens from "../../craft-stage/HeldOmens.vue";
import { heldOmensOf } from "../../craft-stage/held-omens";
import { mulberry32, omensFor, stepOutcomes } from "../../../services/craft-stage/engine";
import { aimHeld, aimsOf, fillCatalyst, handProblem, sampleOf, singleOutOf } from "../../../services/simulator/tree/tree-sample";
import { CATALYSING, canSpam, isCatalyst, kindOfCurrency, TREE_CATALYSTS } from "../../../services/simulator/tree/tree-hands";
import { handLabel, handName, outName } from "./tree-names";
import { kindOfHand, setHand, type Aim, type Hand, type HandKind, type OutKind } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";
import { useSimShelf } from "../use-sim-shelf";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ boxId: string; current: Hand | null }>();
/** pick の preCatalyst = 前に足す品質だけ上げる手のカタリスト (触媒のお告げで、まだ品質を上げる手の後でない時) */
/** only = 結果が 1 通りの手の結果 (tree-sample の singleOutOf、光のお告げ + 消去など) */
const emit = defineEmits<{ pick: [hand: Hand, kind: HandKind, aims: Aim[], preCatalyst: string | null, only: { out: OutKind; aim: Aim | null } | null]; clear: []; close: [] }>();
const t = useTree();

const sample = computed(() => (s.data.value ? sampleOf(s.data.value, t.doc.value, props.boxId, 1) : null));
const item = computed(() => sample.value?.item ?? null);
const held = ref<string | null>(props.current?.currency ?? null);
const omens = ref<string[]>(props.current ? [...props.current.omens] : []);
const spam = ref(!!props.current?.repeat);
const spamMax = ref<number | null>(props.current?.repeat?.max ?? null);
/** 狙い無し (足す手だけ。カオススパムとは一緒にしない) */
const free = ref(!!props.current?.free);
const canFree = computed(() => !!held.value && kindOfCurrency(held.value) === "add");
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
const afterQuality = computed(() => {
  const b = t.doc.value.boxes[props.boxId], p = b?.out === "pass" && b.parent ? t.doc.value.boxes[b.parent] : null;
  return !!p?.hand && isCatalyst(p.hand.currency);
});
/** 持った物に触媒のお告げが掛けられるか */
const canCatalyse = computed(() => !!held.value && heldOmensOf(held.value).includes(CATALYSING));
/**
 * 前に足すカタリストの既定 = この箱でまだ付いていない狙いのタグに合う物 (無ければ並びの 1 つ目)。後から札を押して替えられる。
 * 品質の効きの計算ではなく、選びの初めの値だけ (タグはデータの MOD の tags)
 */
const autoCat = computed((): string => {
  const d = s.data.value, it = item.value;
  for (const a of d && it ? aimsOf(t.doc.value).filter((x) => !aimHeld(d, it, x)) : []) {
    const tags = d!.mods.get(a.modId)?.tags ?? [];
    const c = TREE_CATALYSTS.find((k) => tags.includes(k.slice("catalyst_".length)));
    if (c) return c;
  }
  return TREE_CATALYSTS[0]!;
});
/**
 * 棚に渡すアイテム = 前にカタリストの手を足す時はそれで品質を最大まで入れた後 (品質 0 では触媒のお告げが「品質が要る」で掛けられない。
 * 前は品質 0 の見本を渡していて、触媒の手を開き直すとお告げが外れていた、10-22)
 */
const needPre = computed(() => canCatalyse.value && !afterQuality.value);
const shelfItem = computed(() => { const d = s.data.value, it = item.value; return d && it && needPre.value ? fillCatalyst(d, it, autoCat.value, mulberry32(1)).item : it; });
const { release, onHold, onShelfDown } = useSimShelf(shelfItem, held, omens);
const used = computed(() => (held.value ? omensFor(held.value, omens.value) : []));
const catalysing = computed(() => used.value.includes(CATALYSING));

const hand = computed((): Hand | null => {
  if (!held.value) return null;
  return {
    currency: held.value, omens: used.value,
    catalyst: null, quality: 0,
    repeat: spam.value && canSpam(held.value) ? { until: "hit", max: spamMax.value && spamMax.value > 0 ? Math.round(spamMax.value) : null } : null,
    ...(free.value && canFree.value ? { free: true } : {}),
  };
});
/** 前に足すカタリスト (触媒のお告げを使い、まだ品質を上げる手の後でない時) */
const preCat = computed((): string | null => (catalysing.value && !afterQuality.value ? autoCat.value : null));
const RESULT: Record<HandKind, [string, string]> = {
  add: ["当たり + 外れ", "Hit + Miss"], remove: ["外れが消えた + 狙いが消えた", "Miss removed + Target lost"], swap: ["当たり + 狙いが消えた + 外れ", "Hit + Target lost + Miss"], spam: ["当たりだけ (当たるまで打つ)", "Hits only (until a hit)"], free: ["打った後 (何が付いても次へ。当たり / 外れに分けない)", "After (anything counts, no hit / miss split)"],
  quality: ["無し (品質を最大まで上げて、下の＋で次の手)", "None (raise quality to max, then add the next craft with + below)"],
};
const kind = computed((): HandKind | null => (hand.value ? kindOfHand(hand.value, kindOfCurrency(hand.value.currency)) : null));
/**
 * 当たりの箱の既定 = このツリーの狙いのうち、この箱でまだ付いていない物。木にまだ狙いが無ければ欲しい MOD のメモ
 * (10-22 白紙から組んだ手袋: 狙い 0 で当たるまでにすると MOD の空の当たりの箱を見本で引き直し続け、ページが 5 分固まった)。
 * カオススパムはその全部、足す・入れ替える手はこの手で付きうる物だけ (エンジンの stepOutcomes。10-22 靴・手袋で、当たりの箱が空のまま 1 箱ずつ MOD・行・段を選ぶのが手間だった)
 */
const hitAims = computed((): Aim[] => {
  const d = s.data.value, it = item.value, h = hand.value;
  if (!d || !it || !h || (kind.value !== "spam" && kind.value !== "add" && kind.value !== "swap")) return [];
  const tree = aimsOf(t.doc.value);
  const open = (tree.length ? tree : t.doc.value.memoAims ?? []).filter((a) => !aimHeld(d, it, a));
  if (kind.value === "spam") return open;
  const outs = (stepOutcomes(d, it, h.currency, h.omens) ?? []).filter((o) => !o.void);
  return outs.length ? open.filter((a) => outs.some((o) => aimHeld(d, o.item, a))) : open;
});
/** 結果が 1 通りの手か (この箱の見本 8 つにエンジンで打った行き先を全部たどる。触媒の手は前のカタリストを入れた後で) */
const only = computed(() => (hand.value && s.data.value ? singleOutOf(s.data.value, t.doc.value, props.boxId, hand.value, preCat.value) : null));
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
/** この箱の見本に打てない手は確定させない (お告げが効かない・消せる物が無い等。オーナー 10-22「進行不能」、tree-sample の handProblem) */
const problem = computed((): string | null => {
  if (!hand.value || !shelfItem.value || !s.data.value) return null;
  // 当たるまで繰り返すのに狙いが 1 つも無い (まだ付いていない狙いが無い) 時は決めさせない
  if (kind.value === "spam" && !hitAims.value.length) return tr("狙いが無い (欲しい MOD のメモに足すか、当たりの箱で MOD を選んでから)", "No target yet (add one to the wanted mods memo, or pick a mod in a hit box first)");
  return handProblem(s.data.value, preCat.value ? shelfItem.value : item.value!, hand.value);
});
function ok(): void {
  const h = hand.value, k = kind.value;
  if (h && k && !problem.value) emit("pick", h, k, hitAims.value, preCat.value, only.value);
}
</script>

<template>
  <div data-tree-hand-pick class="flex min-h-0 flex-col gap-2 text-[13px]" @contextmenu="held && ($event.preventDefault(), release())">
    <div class="flex items-center gap-2">
      <b class="flex-1 text-[14px]">{{ tr("次に打つ手", "Next craft") }}</b>
      <button type="button" class="g-btn sm" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <p class="text-[11px] opacity-65">{{ tr("棚から持って「この手にする」。灰色はこの箱の見本に打てない手", "Pick from the shelf, then \"Use this\". Grey = can't be used on this box's sample") }}</p>

    <!-- 持っている物と、残した入力 (触媒のカタリストの品質・カオススパム) -->
    <div v-if="held" class="flex flex-col gap-1.5 rounded-md bg-white/[0.04] p-2">
      <div class="flex min-w-0 items-center gap-1.5">
        <span class="flex shrink-0 items-center -space-x-1"><img v-for="ic in [held, ...used].filter((x) => !!iconOf(x))" :key="ic" :src="iconOf(ic)" alt="" class="size-6 object-contain" /></span>
        <b class="min-w-0 truncate" :title="hand ? handLabel(hand) : ''">{{ [nameOf(held), ...used.map(nameOf)].join(" + ") }}</b>
      </div>
      <p v-if="preCat" data-tree-hand-pre-cat class="text-[12px] text-sky-200/90">{{ tr(`前に「${handName(preCat)} (品質を最大まで)」の手を足す (札を押すとカタリストを替えられる)`, `Adds "${handName(preCat)} (to max quality)" before this (click its chip to change the catalyst)`) }}</p>
      <label v-if="canSpam(held)" class="flex min-h-7 cursor-pointer flex-wrap items-center gap-2">
        <input v-model="spam" type="checkbox" />{{ tr("当たるまで繰り返す (カオススパム)", "Repeat until a hit (Chaos spam)") }}
        <span v-if="spam" class="flex items-center gap-1 text-[12px] opacity-80">{{ tr("上限", "Max") }}<input v-model.number="spamMax" type="number" min="1" class="h-7 w-16 rounded-md border border-white/15 bg-black/40 px-1 text-right" :placeholder="tr('なし', 'none')" />{{ tr("回", "") }}</span>
      </label>
      <p v-if="kind" class="text-[11px] opacity-70">{{ tr("結果の箱", "Result boxes") }}: {{ only ? tr(`${outName(only.out)}だけ (結果は 1 通り)`, `${outName(only.out)} only (one possible result)`) : tr(RESULT[kind][0], RESULT[kind][1]) }}</p>
      <!-- 替える時は、消える箱の数を先に小さく (オーナー 10-22。1 つ戻す / Ctrl+Z で戻せる)。持ち直しは棚で別の物を押すだけ (ボタンは無し) -->
      <div class="flex flex-wrap items-center gap-1.5">
        <button type="button" data-tree-hand-ok class="g-btn-red sm" :disabled="!!problem" :title="problem ?? undefined" @click="ok">{{ current ? tr("この手に替える", "Use this craft") : tr("この手にする", "Use this craft") }}</button>
        <span v-if="problem" data-tree-hand-problem class="text-[11px] text-rose-200/90">{{ tr(`この箱では打てない: ${problem}`, `Can't be used on this box: ${problem}`) }}</span>
        <span v-else-if="gone" data-tree-hand-gone class="text-[11px] text-rose-200/90">{{ tr(`替えると下の ${gone} 箱が消える (1 つ戻すで戻せる)`, `Replacing removes ${gone} box(es) below (Undo restores)`) }}</span>
      </div>
    </div>
    <button v-if="current" type="button" class="g-btn sm self-start" @click="emit('clear')">{{ tr("この手を消す (下も消える)", "Remove this craft (and below)") }}</button>

    <div data-tree-shelf @pointerdown="onShelfDown">
      <CurrencyShelf @hold="onHold">
        <!-- 持った物に掛けられるお告げ = クラフト台と同じ部品と置き場 (HeldOmens.vue を持ったアイコンのすぐ下に重ねる。inline-held だと棚の一番下で見切れた、10-21 本物のマウス)。
             足す手は同じ欄に「狙い無し」(適当打ち、オーナー 10-22「お告げの欄の中に適当打ちがまだ無い」) -->
        <template v-if="heldOmensOf(held).length || canFree" #held><div class="flex flex-col gap-1.5"><HeldOmens /><label v-if="canFree" data-tree-hand-free-box class="flex min-h-8 cursor-pointer items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-500/[0.06] px-2 text-[12px]">
          <input v-model="free" data-tree-hand-free type="checkbox" />{{ tr("狙い無し (空きを 1 つ埋めるだけ)", "No target (just fill an open slot)") }}
        </label></div></template>
      </CurrencyShelf>
    </div>
  </div>
</template>
