<!--
  TreeGoalPage.vue — 「0 完成形の設定」の重ね窓 (2026-10-22 オーナー「ツリー特化。箱を押す → 重ね窓で選ぶ → 閉じる で完結」)。枠は ModalShell (前の TreeBasePage と同じ)。
  1 = ベース・レアリティ・アイテムレベル (適正): 上の行が TreeBasePick、下はベースのページと同じ BaseCatalog。ベースを選ぶと 2 へ。
  2 = 完成の MOD: 共通の MOD 表 (for-share の ModTable、エミュの「このベースに付く MOD」と同じ土台)、段の行のボタンは「狙いにする」(もう一度押すと外す) と「フラクチャー」(印、複数可 = どれかが固定されればよい、10-23 オーナー)。
  右に完成形のアイテムのカード (付き方を見ながら作る。MOD の行の右クリックでも印を付け外し、印が 2 つ以上なら 1 行「フラクチャー MOD ×n」+ ホバーで中身)。狙いは MOD の枠を超えてよい (止めない、乗らない物はカードの下に)。
  ベースを替えると白紙から (下の箱か始まりの MOD があれば 1 回確かめる、1 つ戻すで戻せる)。開いている印は use-tree の goalPage
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import BaseCatalog from "../../../components/items/BaseCatalog.vue";
import ModalShell from "../../../components/ui/ModalShell.vue";
import ModTable from "../../../components/for-share/mod-list/ModTable.vue";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { startOf } from "../../../services/simulator/tree/tree-model";
import type { StageMod } from "../../../services/craft-stage/engine";
import TreeBasePick from "./TreeBasePick.vue";
import { useTree } from "./use-tree";

const t = useTree();
const step = computed(() => t.goalPage.value);
const startMods = computed(() => startOf(t.doc.value).mods.length);
const asking = ref<string | null>(null);
/**
 * ベースをまだ選んでいない (use-tree の needBase = 白紙で開いた時・空の形から開いた時): 一覧はどの部位も開かずに出す (エミュのベースのページの baseUnpicked と同じ)。
 * 前は今の木のベース (既定の金の指輪) の部位が開いた状態で始まり、指輪を押すと 1 回目は畳むだけだった (10-23 オーナー「指輪にしたかったが 2 回クリックしないと開かない」)。
 * 前は「白紙の木か」で決めていたので、ベースを選んだ後に「MOD」から開き直して閉じても空の形に戻った (10-23 に needBase へ)
 */
const unpicked = ref(t.needBase.value);
/**
 * 閉じる (× / Esc / 枠の外)。ベースをまだ選んでいない白紙の木では、既定のベースで木を始めず、シミュの画面に残ってベースが無い時の空の形を出す
 * (use-tree の needBase。10-23 オーナー「ベースが無いとツリーもくそもない」「× 押したらシミュレーターが消え失せる」)
 */
function close(): void {
  asking.value = null;
  t.goalPage.value = 0;
  t.needBase.value = unpicked.value;
}
/** 2 へ進む (段のタブ・「次へ」)。今のベースで決めた扱い (白紙のまま 2 を開いてから閉じても空の形にはしない) */
function toMods(): void { unpicked.value = false; t.needBase.value = false; t.goalPage.value = 2; }
function pick(en: string): void {
  unpicked.value = false;
  t.needBase.value = false;
  if (en === t.doc.value.base) { t.goalPage.value = 2; return; }
  if (t.lostOnBase.value > 0 || startMods.value || t.goals.value.length) { asking.value = en; return; }
  apply(en);
}
function apply(en: string): void {
  asking.value = null;
  t.setBase(en, t.doc.value.itemLevel);
  t.goalPage.value = 2;
}
const pickGoal = { has: t.hasGoal, toggle: t.toggleGoal };
/** その段の狙いにフラクチャーの印があるか */
const isFrac = (modId: string, tier: number): boolean => t.goals.value.some((a) => a.modId === modId && a.tier === tier && a.fractured);
const marks = computed(() => t.goals.value.filter((a) => a.fractured).map((a) => a.modId));
/** カードの行の右クリック = その狙いの段で印を付け外し (狙いでない MOD は来ない) */
function onCardFracture(m: StageMod): void {
  const g = t.goals.value.find((a) => a.modId === m.modId);
  if (g) t.toggleFracture(g.modId, g.tier);
}
const CARD_W = 340;
/** スマホ (768px 未満) は窓の中身の幅 (画面 − 枠と余白 90) に合わせる (340 のままだと右がはみ出した、10-23) */
const cardW = innerWidth < 768 ? Math.min(CARD_W, innerWidth - 90) : CARD_W;
</script>

<template>
  <ModalShell :open="true" rec="tree-goal" :title="tr('0 完成形の設定', '0 Final item')" :close-title="tr('ツリーへ戻る (Esc / 枠の外を押す)', 'Back to the tree (Esc / click outside)')" width="w-[88%] h-[86%]" full-on-phone body-class="px-3 pb-3" @close="close">
    <template #subheader>
      <!-- 1 → 2 の段 (押すとその段へ) -->
      <div data-tree-goal-steps class="flex items-center gap-2 px-3 pb-2">
        <button type="button" data-tree-goal-step="1" class="g-tab !min-h-[30px] !px-4 !text-[13px]" :class="step === 1 ? 'on' : ''" @click="t.goalPage.value = 1">{{ tr("1 ベース", "1 Base") }} <span class="ml-1 text-[11px] opacity-70">{{ tr(jaTypeName(t.doc.value.base), t.doc.value.base) }}</span></button>
        <span class="opacity-40">→</span>
        <button type="button" data-tree-goal-step="2" class="g-tab !min-h-[30px] !px-4 !text-[13px]" :class="step === 2 ? 'on' : ''" @click="toMods">{{ tr("2 完成の MOD", "2 Final mods") }} <span class="ml-1 rounded-full bg-black/25 px-1.5 text-[11px] tabular-nums">{{ t.goals.value.length }}</span></button>
      </div>
    </template>
    <div v-if="step === 1" data-tree-goal-base class="flex min-w-0 flex-col gap-3">
      <TreeBasePick />
      <!-- ベースを替えると今の木が消える時だけ、1 回確かめる -->
      <div v-if="asking" data-tree-base-ask class="flex flex-wrap items-center gap-3 rounded-lg border border-rose-400/60 bg-[#2a1416] px-3 py-2 text-[13px]">
        <p class="min-w-0 flex-1">{{ tr(`${jaTypeName(asking)} の白紙から組み直します。今の木 (箱 ${t.lostOnBase.value} 個${startMods ? "・始まりの MOD" : ""}${t.goals.value.length ? "・完成の狙い" : ""}) が消えます (1 つ戻すで戻せます)。`, `Start over from a blank ${asking}. This tree (${t.lostOnBase.value} box(es)${startMods ? ", starting mods" : ""}${t.goals.value.length ? ", final targets" : ""}) will be removed (Undo brings it back).`) }}</p>
        <button type="button" class="g-btn sm" @click="asking = null">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" data-tree-base-ok class="g-btn sm" @click="apply(asking!)">{{ tr("替える", "Change") }}</button>
      </div>
      <BaseCatalog :data="s.data.value" :selected="unpicked ? '' : t.doc.value.base" @pick="pick" />
    </div>
    <!-- 768px 未満は縦に積む (完成形のカードが上、表は全部の幅。横に並べると表が 1 文字幅に潰れた、10-23 デザイン部長の気づき・メモ web-phone-layout) -->
    <div v-else data-tree-goal-mods class="flex min-h-0 min-w-0 items-start gap-4 max-md:flex-col max-md:items-stretch">
      <div class="min-w-0 flex-1"><ModTable overlay :data="s.data.value" :item="t.goalItem.value?.item ?? null">
        <!-- 段の行のボタンは「狙いにする」(オーナー 10-22) と、狙いにした段だけその右に「フラクチャー」(印、10-23)。
             前はフラクチャーが左にあり、狙いでない段で押すと狙いに足して印も付けたので、狙いにするつもりで印が付いた (10-23 オーナー「印を付けていないのに ✦ スタート」) -->
        <template #tier-actions="{ row: r, tier: tt }">
          <td class="w-48 whitespace-nowrap py-0.5 text-right">
            <button type="button" data-mod-pick class="tbtn" :class="pickGoal.has(tt.modId ?? r.id, tt.tier) ? 'on' : ''" :title="pickGoal.has(tt.modId ?? r.id, tt.tier) ? tr('もう一度押すと狙いから外す', 'Click again to remove the target') : tr(`${tt.rank} 以上を完成の狙いにする`, `Make ${tt.rank}+ a final target`)" @click.stop="pickGoal.toggle(tt.modId ?? r.id, tt.tier)">{{ pickGoal.has(tt.modId ?? r.id, tt.tier) ? tr("✓ 狙い", "✓ Target") : tr("狙いにする", "Target") }}</button>
            <button v-if="pickGoal.has(tt.modId ?? r.id, tt.tier)" type="button" data-mod-fracture class="tbtn ml-1" :class="isFrac(tt.modId ?? r.id, tt.tier) ? 'on !text-mod-fractured' : ''" :title="isFrac(tt.modId ?? r.id, tt.tier) ? tr('もう一度押すとフラクチャーの印を外す', 'Click again to remove the fracture mark') : tr(`${tt.rank} 以上をフラクチャーの候補にする (どれか 1 つが固定されたレアからスタート)`, `Make ${tt.rank}+ a fracture candidate (start from a rare with one of them fractured)`)" @click.stop="t.toggleFracture(tt.modId ?? r.id, tt.tier)">{{ isFrac(tt.modId ?? r.id, tt.tier) ? tr("✦ 印", "✦ Marked") : tr("フラクチャー", "Fracture") }}</button>
          </td>
        </template>
      </ModTable></div>
      <!-- 完成形のカード (ページの送りでも見えるよう上に留める) -->
      <div data-tree-goal-card class="sticky top-0 flex shrink-0 flex-col gap-2 max-md:static max-md:order-first max-md:!w-full max-md:items-center" :style="{ width: `${CARD_W}px` }">
        <StageItemCard v-if="t.goalItem.value" :item="t.goalItem.value.item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" :fracture-group="marks" fracturable @fracture="onCardFracture" />
        <!-- 枠を超えた狙い (10-23 オーナー「欲しい物を全部選ぶので枠を超えてよい」): 止めずにカードの下に並べる -->
        <div v-if="t.goalItem.value?.left.length" data-tree-goal-over class="flex flex-col gap-0.5 rounded-md bg-white/[0.04] px-2 py-1 text-[12px]">
          <p class="opacity-70">{{ tr(`カードに乗らない狙い ${t.goalItem.value.left.length} つ (枠の外。どれかが付けば当たり)`, `${t.goalItem.value.left.length} target(s) beyond the slots (a hit if any rolls)`) }}</p>
          <p v-for="a in t.goalItem.value.left" :key="a.modId" data-tree-goal-over-row class="min-w-0 truncate" :class="a.fractured ? 'text-mod-fractured' : 'text-[#c8c8ff]'" :title="a.reason">{{ a.fractured ? "✦ " : "" }}{{ t.startModLabel(a) }}</p>
        </div>
        <p v-if="t.goalItem.value?.note" data-tree-goal-problem class="rounded-md border border-rose-400/50 bg-[#2a1416] px-2 py-1 text-[12px] text-rose-100">{{ tr(`付けられない狙いがある: ${t.goalItem.value.note}`, `A target can't be added: ${t.goalItem.value.note}`) }}</p>
        <p class="text-[12px] opacity-70">{{ tr("「狙いにする」= その段以上が付けば当たり。後の箱の当たりはこの狙いから選ぶ。「フラクチャー」(カードの右クリックでも) = 印のどれか 1 つが固定されたレアからスタート、印が無ければ白から", "“Target” = a hit if that tier or better rolls. Later hit boxes pick from these targets. “Fracture” (or right-click on the card) = start from a rare with one marked mod fractured; no marks = start from white") }}</p>
      </div>
    </div>
    <!-- 下の帯は 2 完成の MOD の段だけ。ベースの段の「次へ」は出さない (ベースを押すと 2 へ進む。10-23 オーナー「ベース決めないと進めないし、どのみち」)。
         下の帯は一覧を送っても見える所 (ModalShell の footer)。「決めた」は決める手の赤 (g-btn-red、1 画面 1 つ) で右、「← ベース」は控えめなまま左 (10-23 オーナー「分かりづらい」) -->
    <template v-if="step === 2" #footer>
      <div class="flex w-full items-center gap-2">
        <button type="button" class="g-btn sm" @click="t.goalPage.value = 1">{{ tr("← ベース", "← Base") }}</button>
        <button type="button" data-tree-goal-done class="g-btn-red ml-auto min-h-11 min-w-40 px-4 text-[14px] max-md:flex-1" @click="close">{{ tr("決めた (ツリーへ)", "Done (back to the tree)") }}</button>
      </div>
    </template>
  </ModalShell>
</template>
