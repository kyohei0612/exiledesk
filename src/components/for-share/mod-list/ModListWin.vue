<!--
  ModListWin.vue — 棚 + MOD の表の窓 (U-12e、スイッチ simModList。オーナー 11-12「ここにMOD一覧って感じでエミュのモッド一覧とカレンシー表示して欲しい」)。
  シミュの帯の「MOD 一覧」とデイリーの挑戦の帯の「MOD 一覧」が同じ窓を開く (渡すのは品と、棚に出さない物だけ)。
  棚の物を押すと「持った」形 = その手で付く MOD・ティアだけと付く確率 (エミュの MOD 一覧と同じ useHeldShares = エンジンの heldOdds、付かない物は hideDim で出さない)。
  もう一度押す・右クリック・「離す」で全部 (出やすさ) に戻る。見るだけの窓で、木にもアイテムにも何もしない (持った物・お告げはこの窓の中だけ、閉じると離す)
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ModalShell from "../../ui/ModalShell.vue";
import ModTable from "./ModTable.vue";
import CurrencyShelf from "../shelf/CurrencyShelf.vue";
import HeldOmens from "../shelf/HeldOmens.vue";
import { heldOmensOf } from "../shelf/held-omens";
import { useHeldShares } from "./use-held-shares";
import { provideShelf } from "../../../state/for-share/shelf-context";
import { iconOfKey, nameOfKey } from "../../../state/for-share/craft-stage-shelf";
import { craftStage as s } from "../../../state/craft-stage";
import { toggleOmen as toggleHeld, useReason, type StageItem } from "../../../services/craft-stage/engine";
import { baseNameOf, tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";

/**
 * blank = 何も付いていない素の品 (開いた時はいつもこれ。オーナー 11-12「アイテムカードに何もついてない状態で見たいな話し」)。
 * boxItem = 押している箱の品 (渡した時だけ上に切り替え「素の品 / 箱の品」を出す。箱の品ではエミュと同じく、付いている MOD と同じ系統は付かないので消える)。
 * hidden = 棚に出さない物 (シミュの木の棚と同じ物を渡す)
 */
const props = defineProps<{ open: boolean; blank: StageItem | null; boxItem?: StageItem | null; hidden?: (key: string, item: StageItem | null) => boolean }>();
const emit = defineEmits<{ close: [] }>();
const onBox = ref(false);
const item = computed(() => (onBox.value && props.boxItem ? props.boxItem : props.blank));
// 開くたびに素の品から
watch(() => props.open, () => { onBox.value = false; });
const held = ref<string | null>(null);
const omens = ref<string[]>([]);
function release(): void { held.value = null; omens.value = []; }
function onHold(k: string): void { if (held.value === k) release(); else { held.value = k; omens.value = []; } }
// 閉じた・品が替わった時は離す (前の品で持った物を次の品に持ち越さない)
watch([() => props.open, item], () => release());
const usableWith = (k: string, om: readonly string[]): string | null => {
  const d = s.data.value, it = item.value;
  return d && it ? useReason(d, it, k, om) : tr("準備中", "Loading");
};
provideShelf({
  data: s.data, item, omens, held,
  usable: (k) => usableWith(k, omens.value),
  usableBare: (k) => usableWith(k, []),
  toggleOmen: (id) => { omens.value = toggleHeld(omens.value, id); },
  hidden: (k) => !!props.hidden?.(k, item.value),
});
const heldName = computed(() => (held.value ? nameOfKey(held.value, item.value) : ""));
const sh = useHeldShares(() => {
  const d = s.data.value, it = item.value, k = held.value;
  return props.open && d && it && k ? { data: d, item: it, key: k, omens: omens.value, name: heldName.value } : null;
}, () => s.data.value);
/** 持っている間、その手で付かない MOD・ティアを出さない (U-12d) */
const MOD_HIDE = flag("modHide");
/** 持っているのに MOD を足さない物 (品質・コラプトなど) = 表は全部のまま、その事を 1 行で */
const noAdd = computed(() => !!held.value && !sh.heldCands.value);
</script>

<template>
  <ModalShell :open="open" :title="tr('MOD 一覧', 'Mod list')" width="h-[75vh] w-[75vw] max-w-full max-md:h-full max-md:w-full" body-class="min-h-0 flex-1 p-0" full-on-phone @close="emit('close')">
    <template #header>
      <span v-if="item" class="g-sec-sub min-w-0" data-mod-win-item>{{ baseNameOf(item) }}</span>
      <!-- 見る品の切り替え (箱を押している時だけ)。押していなければ素の品だけなので出さない -->
      <span v-if="boxItem" role="tablist" class="flex shrink-0 items-center gap-1" data-mod-win-which>
        <button type="button" role="tab" :aria-selected="!onBox" class="g-tab !min-h-[28px] !px-3 !text-[12px]" :class="!onBox ? 'on' : ''" @click="onBox = false">{{ tr("何も付いていない品", "Blank item") }}</button>
        <button type="button" role="tab" :aria-selected="onBox" class="g-tab !min-h-[28px] !px-3 !text-[12px]" :class="onBox ? 'on' : ''" @click="onBox = true">{{ tr("押している箱の品", "Selected box's item") }}</button>
      </span>
      <span v-else class="g-sec-sub shrink-0 opacity-70">{{ tr("何も付いていない状態", "nothing attached") }}</span>
    </template>
    <div v-if="item" data-mod-win class="grid h-full min-h-0 grid-cols-[minmax(0,30rem)_minmax(0,1fr)] max-xl:grid-cols-1 max-xl:overflow-y-auto" @contextmenu="held && ($event.preventDefault(), release())">
      <!-- 左: カレンシーの棚 (押す = 持つ / もう一度で離す)。持った物に掛けられるお告げは棚の中 (エミュ・木の手の窓と同じ部品) -->
      <div data-mod-win-shelf class="min-h-0 overflow-y-auto px-3 py-2 xl:border-r xl:border-white/10">
        <p class="mb-2 flex min-h-7 flex-wrap items-center gap-2 text-[12px] text-[var(--exile-color-text-secondary)]" data-mod-win-held>
          <template v-if="held">
            <img v-if="iconOfKey(held, item)" :src="iconOfKey(held, item) ?? undefined" alt="" class="size-6 object-contain" />
            <b class="text-sky-100">{{ heldName }}</b>
            <span>{{ noAdd ? tr("MOD を足さない物なので、表は全部のまま", "This does not add mods, so the full list is shown") : tr("で付く MOD だけを出している", ": showing only the mods it can roll") }}</span>
            <button type="button" class="tbtn" data-mod-win-release @click="release">{{ tr("離す", "Release") }}</button>
          </template>
          <span v-else>{{ tr("カレンシーを押すと、それで付く MOD だけと付く確率に絞る", "Pick a currency to see only the mods it can roll, with their chances") }}</span>
        </p>
        <CurrencyShelf @hold="onHold">
          <template v-if="heldOmensOf(held).length" #held><HeldOmens /></template>
        </CurrencyShelf>
      </div>
      <!-- 右: エミュの MOD 一覧と同じ表 (同じ % ・同じ判定) -->
      <div data-mod-win-table class="min-h-0 px-3 pb-3 xl:overflow-y-auto">
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
