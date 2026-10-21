<!--
  TreeHandShelf.vue — ツリーの右の欄: 箱の次に打つ手を、クラフト台のカレンシーの棚から選ぶ (2026-10-22 オーナー「下の＋も同じ感じにしてええよ」、TreeHandPick の置き換え)。
  その箱の見本 (tree-sample.ts) を provideShelf で棚に渡すので、打てない手は灰色。持った物 + お告げを「この手にする」で箱の手に。
  結果の箱は手の種類で決める (カオス = 入れ替え、消去 = 消す、それ以外 = 足す、カオススパム = 当たりだけ)。入力は触媒のカタリストの品質とカオススパムだけ
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { craftStage as s, iconOf, nameOf } from "../../../state/craft-stage";
import { provideShelf, simHidden } from "../../../state/emulator/shelf-context";
import CurrencyShelf from "../../craft-stage/CurrencyShelf.vue";
import HeldOmens from "../../craft-stage/HeldOmens.vue";
import { heldOmensOf } from "../../craft-stage/held-omens";
import { applyCurrency, mulberry32, omensFor } from "../../../services/craft-stage/engine";
import { aimHeld, aimsOf, fillCatalyst, sampleOf } from "../../../services/simulator/tree/tree-sample";
import { CATALYSING, canSpam, kindOfCurrency, TREE_CATALYSTS } from "../../../services/simulator/tree/tree-hands";
import { handLabel, handName } from "./tree-names";
import { kindOfHand, type Aim, type Hand, type HandKind } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ boxId: string; current: Hand | null }>();
const emit = defineEmits<{ pick: [hand: Hand, kind: HandKind, aims: Aim[]]; clear: []; close: [] }>();
const t = useTree();

const sample = computed(() => (s.data.value ? sampleOf(s.data.value, t.doc.value, props.boxId, 1) : null));
const item = computed(() => sample.value?.item ?? null);
const held = ref<string | null>(props.current?.currency ?? null);
const omens = ref<string[]>(props.current ? [...props.current.omens] : []);
const catalyst = ref<string>(props.current?.catalyst ?? TREE_CATALYSTS[0]);
const spam = ref(!!props.current?.repeat);
const spamMax = ref<number | null>(props.current?.repeat?.max ?? null);
function toggleOmen(id: string): void { omens.value = omens.value.includes(id) ? omens.value.filter((o) => o !== id) : [...omens.value, id]; }
provideShelf({
  data: s.data, item, omens, held,
  usable: (k) => {
    const d = s.data.value, it = item.value;
    if (!d || !it) return tr("準備中", "Loading");
    const r = applyCurrency(d, it, k, mulberry32(0), omens.value);
    return r.applied || r.random ? null : (r.reason ?? tr("打てない", "Can't use"));
  },
  toggleOmen,
  hidden: simHidden,
});
const used = computed(() => (held.value ? omensFor(held.value, omens.value) : []));
const catalysing = computed(() => used.value.includes(CATALYSING));

const hand = computed((): Hand | null => {
  if (!held.value) return null;
  return {
    currency: held.value, omens: used.value,
    catalyst: catalysing.value ? catalyst.value : null, ...catFill.value,
    repeat: spam.value && canSpam(held.value) ? { until: "hit", max: spamMax.value && spamMax.value > 0 ? Math.round(spamMax.value) : null } : null,
  };
});
/** カタリストは今の品質の最大まで (1 押しと同じ)。その箱の見本で何個入って何 % になったかを持つ (計算を繋ぐ時の費用の目安) */
const catFill = computed((): { quality: number; catalystCount: number } => {
  const d = s.data.value, it = item.value;
  if (!catalysing.value || !d || !it) return { quality: 0, catalystCount: 0 };
  const r = fillCatalyst(d, it, catalyst.value, mulberry32(1));
  return { quality: r.item.quality, catalystCount: r.count };
});
const RESULT: Record<HandKind, [string, string]> = {
  add: ["当たり + 外れ", "Hit + Miss"], remove: ["外れが消えた + 狙いが消えた", "Miss removed + Target lost"], swap: ["当たり + 狙いが消えた + 外れ", "Hit + Target lost + Miss"], spam: ["当たりだけ (当たるまで打つ)", "Hits only (until a hit)"],
};
const kind = computed((): HandKind | null => (hand.value ? kindOfHand(hand.value, kindOfCurrency(hand.value.currency)) : null));
function ok(): void {
  const h = hand.value, k = kind.value, d = s.data.value;
  if (!h || !k) return;
  // カオススパムの当たりの既定 = このツリーの狙いのうち、この箱でまだ付いていない物を全部
  const aims = k === "spam" && d && item.value ? aimsOf(t.doc.value).filter((a) => !aimHeld(d, item.value!, a)) : [];
  emit("pick", h, k, aims);
}
</script>

<template>
  <div data-tree-hand-pick class="flex min-h-0 flex-col gap-2 text-[13px]">
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
      <div v-if="catalysing" class="flex flex-wrap items-center gap-2">
        <select v-model="catalyst" class="h-8 rounded-md border border-white/15 bg-black/40 px-1">
          <option v-for="c in TREE_CATALYSTS" :key="c" :value="c">{{ handName(c) }}</option>
        </select>
        <span class="text-[12px] tabular-nums">{{ tr(`最大 ${catFill.quality}% まで (この箱で ${catFill.catalystCount} 個)`, `To max ${catFill.quality}% (×${catFill.catalystCount} here)`) }}</span>
        <span class="w-full text-[11px] opacity-60">{{ tr("打つたびに品質の最大まで入れ直す (触媒は 1 回で品質を使い切る)", "Refilled to max quality every time (Catalysing uses up the quality)") }}</span>
      </div>
      <label v-if="canSpam(held)" class="flex min-h-7 cursor-pointer flex-wrap items-center gap-2">
        <input v-model="spam" type="checkbox" />{{ tr("当たるまで繰り返す (カオススパム)", "Repeat until a hit (Chaos spam)") }}
        <span v-if="spam" class="flex items-center gap-1 text-[12px] opacity-80">{{ tr("上限", "Max") }}<input v-model.number="spamMax" type="number" min="1" class="h-7 w-16 rounded-md border border-white/15 bg-black/40 px-1 text-right" :placeholder="tr('なし', 'none')" />{{ tr("回", "") }}</span>
      </label>
      <p v-if="kind" class="text-[11px] opacity-70">{{ tr("結果の箱", "Result boxes") }}: {{ tr(RESULT[kind][0], RESULT[kind][1]) }}</p>
      <div class="flex flex-wrap gap-1.5">
        <button type="button" data-tree-hand-ok class="g-btn-red sm" @click="ok">{{ current ? tr("この手に替える", "Use this craft") : tr("この手にする", "Use this craft") }}</button>
        <button type="button" class="g-btn sm" @click="held = null; omens = []">{{ tr("持ち直す", "Pick again") }}</button>
      </div>
    </div>
    <button v-if="current" type="button" class="g-btn sm self-start" @click="emit('clear')">{{ tr("この手を消す (下も消える)", "Remove this craft (and below)") }}</button>

    <CurrencyShelf inline-held @hold="(k: string) => (held = k)">
      <!-- 持った物に掛けられるお告げ = クラフト台と同じ部品 (HeldOmens.vue、棚の文脈 provideShelf から取る。お告げの下の設定も出る) -->
      <template v-if="heldOmensOf(held).length" #held><HeldOmens /></template>
    </CurrencyShelf>
  </div>
</template>
