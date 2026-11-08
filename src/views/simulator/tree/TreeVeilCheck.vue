<script setup lang="ts">
/**
 * TreeVeilCheck.vue — 骨 (冒涜) の手の窓の 3 択「発現 / 狙い無し / 未発現」(S-32、11-07 オーナー「分かりやすくそこに未発現付与のチェック追加しようか、発現、狙い無し、未発現だね」)。
 * 既定は未発現 = 未発現のまま次へ (結果は「未発現の冒涜が付いた」の箱)。狙い無し = 打ってすぐ発現させ、出た MOD は外れ (後から打つ発現の手の狙い無しと同じ)。
 * 発現 = MOD を選ぶ窓を開き、選んだ物を ☑ にする (選ばずに閉じたら前の選びのまま)。前は「発現させる」☑ 1 つで、無しなら未発現 (10-27 夜オーナー)。
 * 高貴・カオスの窓と同じ並び (狙う MOD の ☑ = 完成の狙い → これ → 狙い無し、10-28 オーナー「誰がそこに表示しろって」)。
 * PC: ☑ を付けた時点で「このベースに付く MOD」の窓 (共通の ModTable、完成形の設定と同じ表) を開き、発現で出うる MOD の段から選ばせる
 *     (出ない MOD は灰色で選べない。選んだ物は ☑ の一覧に足して当たり、選ばずに閉じたら ☑ は外れたまま。10-28 オーナー「発現させるチェックで MOD を選ばせよう」)。
 * スマホ (big) も同じ窓を全画面で開く (S-38)。オンの時は「ほかの MOD を選ぶ」で置き石を足せる の下は PC も同じボタンで何度でも開いて足せる (S-32b)。
 * 発現させると狙い無しは同時にオンにならない (狙い無し = 未発現のまま次へ、最後の ☑ を外すと発現させるも外れる。TreeHandShelf、10-28 オーナー)。
 * noCheck = 後から打つ発現の手 (☑ は出さず、選ぶボタンだけ)。
 * 「発現させる」の下にアビスの反響のお告げの任意の ☑ (既定は無し。10-28 オーナー「発現させるの下に付ける感じで」)
 */
import { computed, ref } from "vue";
import ModTable from "../../../components/for-share/mod-list/ModTable.vue";
import ModalShell from "../../../components/ui/ModalShell.vue";
import { useHeldShares } from "../../../components/for-share/mod-list/use-held-shares";
import { isRevealHand } from "../../../services/simulator/tree/tree-veil";
import { craftStage as s } from "../../../state/craft-stage";
import { handName } from "./tree-names";
import { ECHO } from "../../../services/simulator/tree/tree-hands";
import type { Aim, Hand } from "../../../services/simulator/tree/tree-model";
import { revealPool, type ListRow, type ListTier, type StageItem } from "../../../services/craft-stage/engine";
import { tr } from "../../../i18n/lang";

/** 骨の 3 択 (TreeHandShelf の boneMode)。reveal = 発現 (☑ の MOD)、free = 発現させて狙い無し、keep = 未発現のまま */
export type BoneMode = "reveal" | "free" | "keep";
/** echo = アビスの反響のお告げが手に付いているか (任意の ☑、発現させる時 (発現・狙い無し) だけ出す。棚のお告げの欄と同じ omens を見る) */
const props = defineProps<{ modelValue: boolean; mode?: BoneMode; big?: boolean; noCheck?: boolean; boxId: string; item: StageItem | null; hand: Hand | null; echo?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; mode: [BoneMode]; add: [Aim]; echo: [boolean] }>();
const MODES = computed((): Array<{ k: BoneMode; label: string }> => [
  { k: "reveal", label: tr("発現 (選んだ MOD が出れば当たり)", "Reveal (a hit if a picked mod shows up)") },
  { k: "free", label: tr("狙い無し (発現させて、出た MOD は外れ)", "No target (reveal it; the mod counts as a miss)") },
  { k: "keep", label: tr("未発現 (未発現のまま付ける)", "Unrevealed (leave it unrevealed)") },
]);
/** 発現は MOD を選んでから (選ぶまで丸は移さない。10-28 オーナー「発現させるオンで狙い無しは無し」) */
function onMode(k: BoneMode): void {
  if (k === "reveal" && props.mode !== "reveal") { picking.value = true; return; }
  emit("mode", k);
}
const picking = ref(false);
/**
 * (S-38) エミュの MOD 一覧の窓 (StageModList の重ね窓) と同じ枠・同じ % と灰色 (for-share の useHeldShares = エンジンの heldOdds。
 * 骨とお告げはこの手の物、アイテムは箱のカード = 見本 1)。灰色 = もう付いている MOD と同じ系統・この骨で出ない段 (勢力の MOD は骨で出るので灰色にならない)。
 * 後から打つ発現 (骨を持たない) は % を出さず、灰色はエンジンの revealPool (今の未発現の枠で出うる MOD と段) から
 */

const shares = useHeldShares(() => { const d = s.data.value, h = props.hand; return picking.value && d && props.item && h && !isRevealHand(h.currency) ? { data: d, item: props.item, key: h.currency, omens: h.omens, name: handName(h.currency) } : null; }, () => s.data.value);
const pool = computed(() => { const d = s.data.value, h = props.hand; return picking.value && d && props.item && h && isRevealHand(h.currency) ? new Map(revealPool(d, props.item).map((p) => [p.modId, new Set(p.tiers)])) : null; });
const poolTier = (r: ListRow, x: ListTier): boolean => { const id = x.modId ?? r.id; return !!pool.value?.get(id)?.has(shares.tierIndexOf(id, x)); };
const dimRow = (r: ListRow): boolean => (pool.value ? r.blocked || !r.tiers.some((x) => poolTier(r, x)) : shares.rowDim(r));
const dimTier = (r: ListRow, x: ListTier): boolean => (pool.value ? !poolTier(r, x) : shares.tierDim(r, x));
// 開いた時は上 (一般の MOD) から、冒涜専用は下へ送れば見える (11-07 オーナー「開いたモッドが冒涜から始まるから、一般から始めて欲しい」。前は冒涜専用の節へ送っていた)
/** 「発現で選ぶ」を出す段 = 灰色でない行の灰色でない段 */
const pickable = (r: ListRow, x: ListTier): boolean => !dimRow(r) && !dimTier(r, x) && (pool.value != null || shares.heldTierShare(r, x) > 0);
function pick(a: Aim): void { picking.value = false; emit("add", a); }
</script>

<template>
  <!-- 並びと形は隣の狙いの行と同じ (PC は min-h-7 gap-2、スマホは枠付きの min-h-11 gap-3)。発現を選ぶと丸の下に反響と「発現で選ぶ MOD を選ぶ」 -->
  <!-- 丸は name で束ねない (発現は MOD を選ぶまで移さないので、ブラウザの束ねが今の丸を先に外してしまう)。反響と「選ぶ」は選んだ丸のすぐ下 -->
  <template v-if="!noCheck">
    <template v-for="m in MODES" :key="m.k">
      <label data-tree-hand-veil :data-veil-mode="m.k" class="flex cursor-pointer items-center" :class="big ? 'min-h-11 gap-3 rounded-lg border border-white/10 bg-black/20 px-3' : 'min-h-7 gap-2'">
        <input type="radio" class="shrink-0" :class="big ? 'size-5' : ''" :checked="mode === m.k" @change="($event.target as HTMLInputElement).checked = mode === m.k; onMode(m.k)" />
        <span class="min-w-0 break-words">{{ m.label }}</span>
      </label>
      <template v-if="mode === m.k && m.k !== 'keep'">
        <label data-tree-hand-veil-echo class="flex cursor-pointer items-center" :class="big ? 'min-h-11 gap-3 rounded-lg border border-white/10 bg-black/20 px-3' : 'min-h-7 gap-2 pl-5'">
          <input type="checkbox" class="shrink-0" :class="big ? 'size-5' : ''" :checked="!!echo" @change="emit('echo', ($event.target as HTMLInputElement).checked)" />
          <span class="min-w-0 break-words">{{ handName(ECHO) }} ({{ tr("候補を 1 回引き直す", "reroll the options once") }})</span>
        </label>
        <button v-if="m.k === 'reveal'" type="button" data-tree-hand-veil-more class="g-btn sm self-start" :class="big ? '!min-h-11' : 'ml-5'" @click="picking = true">{{ tr("発現で選ぶ MOD を選ぶ", "Pick the mod to reveal") }}</button>
      </template>
    </template>
  </template>
  <label v-if="noCheck" data-tree-hand-veil-echo class="flex cursor-pointer items-center" :class="big ? 'min-h-11 gap-3 rounded-lg border border-white/10 bg-black/20 px-3' : 'min-h-7 gap-2 pl-5'">
    <input type="checkbox" class="shrink-0" :class="big ? 'size-5' : ''" :checked="!!echo" @change="emit('echo', ($event.target as HTMLInputElement).checked)" />
    <span class="min-w-0 break-words">{{ handName(ECHO) }} ({{ tr("候補を 1 回引き直す", "reroll the options once") }})</span>
  </label>
  <button v-if="noCheck" type="button" data-tree-hand-veil-more class="g-btn sm self-start" :class="big ? '!min-h-11' : ''" @click="picking = true">{{ tr("発現で選ぶ MOD を選ぶ", "Pick the mod to reveal") }}</button>
  <!-- エミュの「このベースに付く MOD」の重ね窓と同じ枠 (CraftStage.vue の ModalShell と同じ大きさ、スマホは画面いっぱい) と同じ表 (S-38) -->
  <ModalShell :open="picking" rec="tree-veil-mods" :title="tr('このベースに付く MOD', 'Mods for this base')" :close-title="tr('閉じる (選ばない)', 'Close (pick nothing)')" width="w-[75%] h-[75%] max-[48rem]:h-auto" full-on-phone body-class="px-3 pb-3" @close="picking = false">
    <template #header><span class="g-sec-sub max-[48rem]:hidden">{{ tr('発現で選ぶ MOD (段の「発現で選ぶ」で当たりに)', 'Mod to pick when revealing (use Pick on a tier)') }}</span></template>
    <div data-tree-hand-veil-pick>
      <ModTable
        overlay :data="s.data.value" :item="item"
        :share="shares.shareOf" :tier-share="shares.tierShareOf" :row-dim="dimRow" :tier-dim="dimTier" :row-title="shares.rowTitle" :tier-title="shares.tierTitle" :share-title="shares.shareTitle"
        :share-head="shares.shareHead.value" :tone="shares.heldCands.value ? 'sky' : 'amber'" :section-late="shares.sectionLate"
      >
        <template #tier-actions="{ row: r, tier: tt }">
          <td class="py-0.5 pl-2 text-right">
            <button v-if="pickable(r, tt)" type="button" data-mod-pick data-tree-hand-veil-tier class="tbtn" :title="tr(`${tt.rank} 以上が発現で選べたら当たり`, `A hit if ${tt.rank}+ is revealed`)" @click.stop="pick({ modId: tt.modId ?? r.id, tier: tt.tier })">{{ tr("発現で選ぶ", "Pick") }}</button>
          </td>
        </template>
      </ModTable>
    </div>
  </ModalShell>
</template>
