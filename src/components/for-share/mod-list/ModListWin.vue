<!--
  ModListWin.vue — カレンシーの帯 + MOD の表の窓 (U-12e、スイッチ simModList。オーナー 11-12「ここにMOD一覧って感じでエミュのモッド一覧とカレンシー表示して欲しい」)。
  シミュの帯の「MOD 一覧」とデイリーの挑戦の帯の「MOD 一覧」が同じ窓を開く (渡すのは品と、帯に出さない物だけ)。確率を確かめるだけの窓で、木にもアイテムにも何もしない。
  上 = 打てるカレンシーの低い横長の帯。札はいつもの棚のアイコン (ShelfButton の小さい形 = 四角い絵 + 段の印、名前と説明は乗せた時のカード、値段は出さない。オーナー 11-12「いつものカレンシーアイコンがイイな」)。
  札は「持つ」でなくオン / オフ: 押すとオン (光る枠)・もう一度でオフ・別の札で替わる (オンは 1 つ)。オンの物の名前は帯の下の行に出す。
  オンの間 = その手で付く MOD・ティアだけと付く確率 (エミュの持った時と同じ useHeldShares = エンジンの heldOdds、付かない物は hideDim で出さない)、オフ = 全部と出やすさ。
  オンの物に掛けられるお告げは、同じ帯の続きに小さい札で (オン / オフ)。下 = エミュの MOD 一覧と同じ表 (プレフィックス / サフィックスが横 2 列)。
  (オーナー 11-12「そのモッド上に横に長い感じでカレンシー打てる奴並べるみたいな感じ」「持つとかじゃなくてオンオフで頼むわ」)
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ModalShell from "../../ui/ModalShell.vue";
import ModTable from "./ModTable.vue";
import ShelfButton from "../shelf/ShelfButton.vue";
import { heldOmensOf } from "../shelf/held-omens";
import { useHeldShares } from "./use-held-shares";
import { ORBS, bonesFor, essenceShelf, nameOfKey } from "../../../state/for-share/craft-stage-shelf";
import { provideShelf } from "../../../state/for-share/shelf-context";
import { craftStage as s } from "../../../state/craft-stage";
import { omenBlock, toggleOmen as toggleHeld, useReason, type StageItem } from "../../../services/craft-stage/engine";
import { baseNameOf, tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";

/**
 * blank = 何も付いていない素の品 (開いた時はいつもこれ。オーナー 11-12「アイテムカードに何もついてない状態で見たいな話し」)。
 * boxItem = 押している箱の品 (渡した時だけ上に切り替え「素の品 / 箱の品」を出す。箱の品ではエミュと同じく、付いている MOD と同じ系統は付かないので消える)。
 * hidden = 帯に出さない物 (シミュの木の棚と同じ物を渡す)
 */
const props = defineProps<{ open: boolean; blank: StageItem | null; boxItem?: StageItem | null; hidden?: (key: string, item: StageItem | null) => boolean }>();
const emit = defineEmits<{ close: [] }>();
const onBox = ref(false);
const item = computed(() => (onBox.value && props.boxItem ? props.boxItem : props.blank));
/** オンの札 (null = オフ = 全部の MOD と出やすさ) と、掛けたお告げ */
const on = ref<string | null>(null);
const omens = ref<string[]>([]);
function off(): void { on.value = null; omens.value = []; }
function toggle(k: string): void { if (on.value === k) off(); else { on.value = k; omens.value = []; } }
// 開くたびに素の品・オフから。品が替わった時もオフ (前の品でオンにした物を持ち越さない)
watch(() => props.open, () => { onBox.value = false; off(); });
watch(item, () => off());

/** 帯に並べない種類: MOD を足さない物 (神・フラクチャー・髪束・フラックス・品質・消去)。確率を見る窓なので、足す手だけ */
const NO_ADD = new Set(["other", "flux", "quality", "annul"]);
/** 帯の札 = 今の品に打てて (エンジンの useReason、棚の「使用可能」と同じ判定)、MOD を足す物。オーブ → 骨 → エッセンスの順 */
const chips = computed((): string[] => {
  const d = s.data.value, it = item.value;
  if (!d || !it) return [];
  const all = [...ORBS.filter((g) => !NO_ADD.has(g.kind)).flatMap((g) => g.keys), ...bonesFor(it), ...essenceShelf(d, it).flatMap((g) => g.keys)];
  return all.filter((k) => !props.hidden?.(k, it) && useReason(d, it, k, []) === null);
});
/** オンの物に掛けられるお告げ (エミュ・木の手の窓と同じ入口。帯に出さない物は除く)。掛けられない物を押せなくするのは札の側 (エンジンの omenBlock) */
const omenChips = computed(() => (on.value ? heldOmensOf(on.value).filter((o) => !props.hidden?.(o, item.value)) : []));
function toggleOmen(o: string): void { omens.value = toggleHeld(omens.value, o); }
// 札はいつもの棚のアイコン (ShelfButton)。棚の文脈 = この窓の品・オンの物・掛けたお告げ (エミュの今の品とは別)
provideShelf({
  data: s.data, item, omens, held: on,
  usable: (k) => { const d = s.data.value, it = item.value; return d && it ? useReason(d, it, k, omens.value) : null; },
  toggleOmen,
  omenBlock: (held, om, o) => omenBlock(s.data.value, item.value, held, om, o),
});

const sh = useHeldShares(() => {
  const d = s.data.value, it = item.value, k = on.value;
  return props.open && d && it && k ? { data: d, item: it, key: k, omens: omens.value, name: nameOfKey(k, it) } : null;
}, () => s.data.value);
/** オンの間、その手で付かない MOD・ティアを出さない (U-12d) */
const MOD_HIDE = flag("modHide");
</script>

<template>
  <ModalShell :open="open" :title="tr('MOD 一覧', 'Mod list')" width="w-[75%] h-[75%] max-md:h-auto" body-class="min-h-0 flex-1 p-0" full-on-phone @close="emit('close')">
    <template #header>
      <span v-if="item" class="g-sec-sub min-w-0" data-mod-win-item>{{ baseNameOf(item) }}</span>
      <!-- 見る品の切り替え (箱を押している時だけ)。押していなければ素の品だけなので出さない -->
      <span v-if="boxItem" role="tablist" class="flex shrink-0 items-center gap-1" data-mod-win-which>
        <button type="button" role="tab" :aria-selected="!onBox" class="g-tab !min-h-[28px] !px-3 !text-[12px]" :class="!onBox ? 'on' : ''" @click="onBox = false">{{ tr("素の品", "Blank item") }}</button>
        <button type="button" role="tab" :aria-selected="onBox" class="g-tab !min-h-[28px] !px-3 !text-[12px]" :class="onBox ? 'on' : ''" @click="onBox = true">{{ tr("押している箱の品", "Selected box's item") }}</button>
      </span>
      <span v-else class="g-sec-sub shrink-0 opacity-70">{{ tr("何も付いていない状態", "nothing attached") }}</span>
    </template>
    <div v-if="item" data-mod-win class="flex h-full min-h-0 flex-col max-xl:overflow-y-auto" @contextmenu="on && ($event.preventDefault(), off())">
      <!-- 上: 打てるカレンシーの帯 (2 行まで、多い時は帯の中だけ送る)。押す = オン / もう一度でオフ -->
      <div data-mod-win-shelf role="toolbar" :aria-label="tr('カレンシー (押すとその手で付く MOD だけ)', 'Currency (press to show only what it can roll)')" class="flex max-h-[106px] shrink-0 flex-wrap items-center gap-x-0.5 gap-y-1 overflow-y-auto border-b border-white/10 px-3 py-1.5 max-xl:max-h-none">
        <ShelfButton v-for="k in chips" :key="k" :k="k" bare :aria-pressed="on === k" @pick="toggle" />
        <span v-if="!chips.length" class="text-[12px] opacity-50">{{ tr("この品に打てるカレンシーが無い", "No currency can be used on this item") }}</span>
      </div>
      <!-- オンの間だけ、帯のすぐ下の 1 行: オンの物の名前 (札に名前が無いので) と、掛けられるお告げのいつものアイコン (オン / オフ)。掛けると進めない・意味が無い物は押せない (理由は乗せた時のカード) -->
      <div v-if="on" class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 bg-violet-500/[0.04] px-3 py-1">
        <span data-mod-win-held class="shrink-0 text-[12px] text-[var(--exile-color-text-title)]">{{ nameOfKey(on, item) }}</span>
        <template v-if="omenChips.length">
          <span class="shrink-0 text-[11px] text-violet-200/80">{{ tr("お告げ", "Omens") }}</span>
          <span data-held-omens class="flex flex-wrap items-center gap-x-0.5 gap-y-1">
            <ShelfButton v-for="o in omenChips" :key="o" :k="o" omen bare :data-omen="o" :aria-pressed="omens.includes(o)" @pick="toggleOmen" />
          </span>
        </template>
      </div>
      <!-- 下: エミュの MOD 一覧と同じ表 (同じ % ・同じ判定。窓の幅いっぱいなのでプレフィックス / サフィックスが横 2 列) -->
      <div data-mod-win-table class="min-h-0 flex-1 px-3 pb-3 xl:overflow-y-auto">
        <ModTable
          overlay :data="s.data.value" :item="item"
          :share="sh.shareOf" :tier-share="sh.tierShareOf" :row-dim="sh.rowDim" :tier-dim="sh.tierDim" :hide-dim="MOD_HIDE && !!sh.heldCands.value"
          :row-title="sh.rowTitle" :tier-title="sh.tierTitle" :share-title="sh.shareTitle"
          :share-head="sh.shareHead.value" :tone="sh.heldCands.value ? 'sky' : 'amber'" :section-late="sh.sectionLate"
        />
      </div>
    </div>
  </ModalShell>
</template>
