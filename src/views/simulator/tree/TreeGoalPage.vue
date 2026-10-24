<!--
  TreeGoalPage.vue — 「0 完成形の設定」の重ね窓 (2026-10-22 オーナー「ツリー特化。箱を押す → 重ね窓で選ぶ → 閉じる で完結」)。枠は ModalShell (前の TreeBasePage と同じ)。
  1 = ベース・レアリティ・アイテムレベル (適正): 上の行が TreeBasePick、下はベースのページと同じ BaseCatalog。ベースを選ぶと 2 へ。
  2 = 完成の MOD: 共通の MOD 表 (for-share の ModTable、エミュの「このベースに付く MOD」と同じ土台)、段の行のボタンは「狙いにする」(もう一度押すと外す) と「フラクチャー」(印、複数可 = どれかが固定されればよい、10-23 オーナー)。
  右に完成形のアイテムのカード (付き方を見ながら作る。MOD の行の右クリックでも印を付け外し、印が 2 つ以上なら 1 行「フラクチャー MOD ×n」+ ホバーで中身)。狙いは MOD の枠を超えてよい (止めない、乗らない物はカードの下に)。
  ベースを替えると木は白紙から (下の箱があれば 1 回確かめる、1 つ戻すで戻せる)。完成の狙い・始まりの MOD は新しいベースにも付く物だけ残し、外した物は 2 の段の上に 1 行 (10-24 オーナー)。開いている印は use-tree の goalPage
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import BasePickBody from "../../../components/for-share/BasePickBody.vue";
import ModalShell from "../../../components/ui/ModalShell.vue";
import ModTable from "../../../components/for-share/mod-list/ModTable.vue";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { tierRankLabel, type StageMod } from "../../../services/craft-stage/engine";
import type { Aim, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { goalBlock } from "../../../services/craft-stage/engine-sim";
import TreeBasePick from "./TreeBasePick.vue";
import TreeRecipeBar from "./TreeRecipeBar.vue";
import TreeFlowSteps from "./TreeFlowSteps.vue";
import TreeTabs from "./TreeTabs.vue";
import TreeFractureAsk from "./TreeFractureAsk.vue";
import { useTree } from "./use-tree";
import { openTreePage, treeStep } from "../../../web/page";

const t = useTree();
const step = computed(() => t.goalPage.value);
const asking = ref<string | null>(null);
/** ベースを替えて外した狙いの文 (新しいベースに付かない物、2 の段の上に 1 行。次にベースを替える・閉じるまで) */
const dropped = ref<string[]>([]);
/**
 * ベースをまだ選んでいない (use-tree の needBase = 白紙で開いた時・空の形から開いた時): 一覧はどの部位も開かずに出す (エミュのベースのページの baseUnpicked と同じ)。
 * 前は今の木のベース (既定の金の指輪) の部位が開いた状態で始まり、指輪を押すと 1 回目は畳むだけだった (10-23 オーナー「指輪にしたかったが 2 回クリックしないと開かない」)。
 * 前は「白紙の木か」で決めていたので、ベースを選んだ後に「MOD」から開き直して閉じても空の形に戻った (10-23 に needBase へ)
 */
const unpicked = ref(t.needBase.value);
/**
 * ページで出す (?page=sim-base / sim-mods、web/page の treeStep。10-24 夜オーナー「基本はページ全体にベース表示、MOD も別ページ。
 * オーバーレイはツリーのなかにあるベース選択の所」)。ツリーの中の札 (TreeGoalNode など) から開いた時は今まで通り窓。
 * 開いている間はツリーを隠す (SimTreePage が use-tree の goalInline を見る)
 */
const blankOpen = t.needBase.value;
// ベースがまだ無い白紙の木 (＋ 新しいツリー・白紙で開いた時) も窓でなくページ (ツリーの URL のまま。ここで URL を移すと、戻るで白紙の木へ戻ってまたベース選びへ飛ばされ、戻れなくなる)
const asPage = computed(() => treeStep.value !== "tree" || blankOpen);
watch(asPage, (v) => { t.goalInline.value = v; }, { immediate: true });
onBeforeUnmount(() => { t.goalInline.value = false; });
/** 段を移る: ページの時は URL ごと移る (履歴に積む = 戻るで前の段)、窓の時は窓の中で替える。0 = ツリーへ */
function go(n: 0 | 1 | 2): void {
  const to = n === 1 ? "base" : n === 2 ? "mods" : "tree";
  if (asPage.value && treeStep.value !== to) openTreePage(to);
  t.goalPage.value = n;
}
/** 「替える」の確かめが出たら見える所へ送る (一覧を下まで送っていると上の帯が見えず、ベースを押しても進まないように見えた、10-23 オーナー) */
const askEl = ref<HTMLElement | null>(null);
watch(asking, (v) => { if (v) void nextTick(() => askEl.value?.scrollIntoView({ block: "nearest" })); });
/** 段のタブの右端のレシピから別の木を開いた = 窓を閉じてその木へ */
function onRecipe(): void { asking.value = null; dropped.value = []; go(0); }
/**
 * 閉じる (× / Esc / 枠の外)。ベースをまだ選んでいない白紙の木では、既定のベースで木を始めず、シミュの画面に残ってベースが無い時の空の形を出す
 * (use-tree の needBase。10-23 オーナー「ベースが無いとツリーもくそもない」「× 押したらシミュレーターが消え失せる」)
 */
function close(): void {
  asking.value = null;
  dropped.value = [];
  t.needBase.value = unpicked.value;
  go(0);
}
// URL から先にページが開き、白紙の判定 (SimTreePage の onMounted の needBase) が後から立つ時も「まだ選んでいない」にする (初めての sim-base で戻り先の無い「← ツリーに戻る」が出ていた)
watch(() => t.needBase.value, (v) => { if (v) unpicked.value = true; });
/** 手の入った木 (始まりの箱に手がある) */
const hasHand = (d: TreeDoc): boolean => Object.keys(d.boxes).length > 1 || !!d.boxes.start?.hand;
/**
 * 戻れる木がある: ほかのタブに手か狙いの入った木、または今のタブに手が入っている (木で打ってから MOD のページへ来た)。
 * 初めての時のベース選び・ベースを選んだ後の MOD のページ (狙いだけ) には出さない (10-25 オーナー「ベース決めるところでツリーへ戻るはないでしょ」「残さないで」)
 */
const canBack = computed(() => t.tabDocs.value.some((d0, i) => (i === t.active.value ? !unpicked.value && hasHand(t.doc.value) : hasHand(d0) || !!d0.memoAims?.length)));
function backToTree(): void {
  asking.value = null;
  dropped.value = [];
  if (unpicked.value && t.leaveNewTab()) { if (treeStep.value !== "tree") openTreePage("tree"); return; }
  go(0);
}
/** 2 へ進む (段のタブ・「次へ」)。今のベースで決めた扱い (白紙のまま 2 を開いてから閉じても空の形にはしない) */
function toMods(): void { unpicked.value = false; t.chooseBase(); go(2); }
/** 流れの帯を押した: 1 = ベース、2 = 完成の MOD、3 = ツリーへ (閉じる)、4 = 閉じて結果のまとめ */
function onFlow(n: 1 | 2 | 3 | 4): void {
  if (n === 1) go(1);
  else if (n === 2) toMods();
  else { close(); if (n === 4) t.reportOpen.value = true; }
}
function pick(en: string): void {
  unpicked.value = false;
  t.needBase.value = false;
  if (en === t.doc.value.base) { t.chooseBase(); go(2); return; }
  if (t.lostOnBase.value > 0) { asking.value = en; return; }
  apply(en);
}
function apply(en: string): void {
  asking.value = null;
  // 文は替える前のベースの行で作る (外した MOD は新しいベースの一覧に無い)
  const label = new Map(t.goals.value.map((a) => [a.modId, t.startModLabel(a, true)]));
  dropped.value = t.setBase(en, t.doc.value.itemLevel).map((a) => label.get(a.modId) ?? tr("(名前の無い MOD)", "(unnamed mod)"));
  go(2);
}
const pickGoal = { has: t.hasGoal, toggle: t.toggleGoal };
/**
 * 今の狙いの組にその段を足せない理由 (足せれば null。エンジンの入口 goalBlock: 枠・同じ系統・冒涜 1 つまで・クラフト MOD の上限・アイテムレベル、10-24 オーナー)。
 * 同じ MOD の段の替えは見ない (その MOD を除いた組で聞く)。適正の間はアイテムレベルが狙いに合わせて上がるので、レベルでは断らない。組・ベース・レベルが変わるまで覚える
 */
const FIT_ILVL = 100;
let blockMemo = new Map<string, string | null>(), blockFor = "";
function blockOf(modId: string, tier: number): string | null {
  const d = s.data.value, doc = t.doc.value;
  if (!d) return null;
  const lv = doc.ilvlFit ? FIT_ILVL : doc.itemLevel, aims = t.goals.value.filter((a) => a.modId !== modId).map((a) => ({ modId: a.modId, tier: a.tier }));
  const key = `${doc.base}|${lv}|${JSON.stringify(aims)}`;
  if (key !== blockFor) { blockFor = key; blockMemo = new Map(); }
  const k = `${modId}|${tier}`;
  if (!blockMemo.has(k)) blockMemo.set(k, goalBlock(d, doc.base, lv, aims, { modId, tier }));
  return blockMemo.get(k) ?? null;
}
/** その行 (系統) の狙い (段ごとに modId が違うまとめ行もあるので、行の段のどれかの modId で引く) */
const rowGoal = (r: { id: string; tiers: Array<{ modId?: string }> }): Aim | undefined => t.goals.value.find((a) => a.modId === r.id || r.tiers.some((x) => x.modId === a.modId));
/**
 * その段の行が狙いの中のどこか (10-24 オーナー「T2 を選んだら T2 以上」、狙いは MOD 1 つ): "pick" = 選んだ段 (✓ 狙い)、"in" = 選んだ段より上で含まれる (控えめな「含む」)、null = 狙いの外
 */
function goalAt(modId: string, tier: number): "pick" | "in" | null {
  const g = t.goals.value.find((a) => a.modId === modId);
  return !g ? null : g.tier === tier ? "pick" : tier < g.tier ? "in" : null;
}
/** その段の狙いにフラクチャーの印があるか */
const isFrac = (modId: string, tier: number): boolean => t.goals.value.some((a) => a.modId === modId && a.tier === tier && a.fractured);
const marks = computed(() => t.goals.value.filter((a) => a.fractured).map((a) => a.modId));
/** 印を付け外す。印が無い所から付けたら、フラクチャーの始め方 (済みから / 前から) を聞く (TreeFractureAsk、10-24 夜オーナー) */
const fracAsk = ref(false);
function markFracture(modId: string, tier: number): void {
  const had = marks.value.length;
  t.toggleFracture(modId, tier);
  if (!had && marks.value.length) fracAsk.value = true;
}
/** カードの行の × = 一覧で外したのと同じ (狙いから外す、印も一緒に外れる。10-24 夜オーナー「アイテムにつく UI からもバツで消したい」) */
function onCardRemove(modId: string): void {
  const g = t.goals.value.find((a) => a.modId === modId);
  if (g) t.toggleGoal(g.modId, g.tier);
}
/** カードの行の右クリック = その狙いの段で印を付け外し (狙いでない MOD は来ない) */
function onCardFracture(m: StageMod): void {
  const g = t.goals.value.find((a) => a.modId === m.modId);
  if (g) markFracture(g.modId, g.tier);
}
/** 完成の MOD の段の説明 (日本語・英語の組、1 つの事 = 1 行) */
const HELP: Array<[string, string]> = [
  ["狙いにする: その段以上が付けば当たり (狙いは MOD 1 つ、上の段は「含む」)", "Target: a hit if that tier or better rolls (one target per mod; higher tiers are included)"],
  ["後の箱の当たりは、この狙いから選ぶ", "Later hit boxes pick from these targets"],
  ["フラクチャー (✦) = 完成品に残す MOD の印。複数付けてよく、どれか 1 つが固定されたレアから始まる (カードの右クリックでも)", "Fracture (✦) = marks a mod the finished item keeps. Several are fine; the start is a rare with one of them fractured (or right-click on the card)"],
  ["印が無ければ白から", "No marks: start from a white item"],
];
</script>

<template>
  <!-- ページで出している間は高さを決めず、本文の送りの箱も外す (ページごと送る。1 の段 = 10-23 オーナー「エミュと同じ展開時の表示の仕方」、2 の段 = 10-24 オーナー「一覧の中に別のスクロールの箱を作らない」)。窓の時は窓の本文 1 つで送る -->
  <ModalShell :open="true" :inline="asPage" :closable="!(asPage && unpicked)" rec="tree-goal" :title="tr('0 完成形の設定', '0 Final item')" :close-title="tr('ツリーへ戻る (Esc / 枠の外を押す)', 'Back to the tree (Esc / click outside)')" :width="asPage ? (step === 1 ? 'w-full max-md:!border-0 max-md:[border-image:none] max-md:!bg-none max-md:!p-0' : 'w-full') : 'w-[88%] h-[86%]'" full-on-phone :body-class="asPage ? (step === 1 ? 'px-3 pb-3 max-md:px-2 !overflow-visible' : 'px-3 pb-3 !overflow-visible') : 'px-3 pb-3'" @close="close">
    <template #subheader>
      <!-- 流れの 4 段の帯 (ツリーのページの上と同じ部品 TreeFlowSteps、10-24 オーナー)。初手 (ベース未選択) の間は 2 から先は押せない。右端に保存したレシピから開く -->
      <div data-tree-goal-steps class="flex flex-wrap items-center gap-2 px-3 pb-2">
        <!-- ツリーへ戻る (10-24 夜オーナー「一方通行が多い、ツリーに戻るボタンとか普通にあってもいい。保存云々は聞かなくておｋ」)。新しいツリーのベース選びなら、そのタブをやめて前の木へ -->
        <button v-if="asPage && canBack" type="button" data-tree-goal-back class="g-btn sm shrink-0" @click="backToTree">{{ tr("← ツリーに戻る", "← Back to tree") }}</button>
        <TreeFlowSteps :current="step === 2 ? 2 : 1" :no-base="unpicked" @go="onFlow" />
        <span class="ml-auto shrink-0"><TreeRecipeBar menu-only @opened="onRecipe" /></span>
      </div>
      <!-- 木が 2 つ以上ある時はタブもここに (新しいツリーのベース選びの間も前の木へ戻れる、10-24 モンキー初めての人の回 8) -->
      <TreeTabs v-if="t.tabDocs.value.length > 1" class="px-3 pb-2" />
      <!-- 適正でアイテムレベルを変えた時の一言 (10-24 オーナー: 黙って変わると気づかない、文字は最低限で閉じられる形) -->
      <p v-if="t.ilvlNote.value" data-tree-ilvl-note class="flex min-w-0 items-center gap-2 px-3 pb-2 text-[12px] text-amber-200/90">
        <span class="min-w-0 truncate">{{ tr(`アイテムレベルを ${t.ilvlNote.value.to} に合わせました (適正)`, `Item level set to ${t.ilvlNote.value.to} (fit)`) }}</span>
        <button type="button" data-tree-ilvl-note-close class="shrink-0 rounded px-1 opacity-60 hover:bg-white/10 hover:opacity-100" :aria-label="tr('閉じる', 'Close')" @click="t.ilvlNote.value = null">×</button>
      </p>
      <p v-if="step === 2 && dropped.length" data-tree-goal-dropped class="min-w-0 truncate px-3 pb-2 text-[12px] text-rose-200/80" :title="dropped.join('\n')">{{ tr(`このベースに付かない狙いを外した: ${dropped.join("・")}`, `Removed targets this base can't roll: ${dropped.join(", ")}`) }}</p>
    </template>
    <div v-if="step === 1" data-tree-goal-base class="flex min-w-0 flex-col gap-3">
      <TreeBasePick />
      <!-- ベースを替えると今の木が消える時だけ、1 回確かめる (上に貼り付けて、一覧を送っていても見える所に) -->
      <div v-if="asking" ref="askEl" data-tree-base-ask class="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-rose-400/60 bg-[#2a1416] px-3 py-2 text-[13px]">
        <p class="min-w-0 flex-1">{{ tr(`${jaTypeName(asking)} の白紙から組み直します。今の木 (箱 ${t.lostOnBase.value} 個) が消えます。完成の狙いは ${jaTypeName(asking)} にも付く物だけ残ります (1 つ戻すで戻せます)。`, `Start over from a blank ${asking}. This tree (${t.lostOnBase.value} box(es)) will be removed. Final targets that ${asking} can roll are kept (Undo brings it back).`) }}</p>
        <button type="button" class="g-btn sm" @click="asking = null">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" data-tree-base-ok class="g-btn sm" @click="apply(asking!)">{{ tr("替える", "Change") }}</button>
      </div>
      <!-- エミュのベースのページと同じ作り (共通の BasePickBody: 帯 + ベースの一覧、未選択の時は人気のベースを上に)。帯はシミュの説明で「すぐ試す」は無し (10-23 オーナー) -->
      <BasePickBody :selected="unpicked ? '' : t.doc.value.base" :popular="unpicked" :intro="unpicked" :quick="false"
        :title="tr('完成させたいアイテムから、打ち方の道を組んで費用を見積もれます', 'Plan a craft route to the item you want and estimate the cost')"
        :lead="tr('ベースを選び、狙いの MOD を決めると、スタートから完成までの道をツリーで組めます。100 人回して完成の割合と費用を出します', 'Choose a base and your target mods, then lay out the route from the start to the finished item as a tree. Run it 100 times for the finish rate and the cost')"
        @pick="pick" />
    </div>
    <!-- 768px 未満は縦に積む (完成形のカードが上、表は全部の幅。横に並べると表が 1 文字幅に潰れた、10-23 デザイン部長の気づき・メモ web-phone-layout) -->
    <div v-else data-tree-goal-mods class="flex min-h-0 min-w-0 items-start gap-4 max-md:flex-col max-md:items-stretch">
      <div class="min-w-0 flex-1"><ModTable overlay :data="s.data.value" :item="t.goalItem.value?.item ?? null">
        <!-- 段の行のボタンは「狙いにする」(オーナー 10-22) と、狙いにした段だけその右に「フラクチャー」(印、10-23)。
             前はフラクチャーが左にあり、狙いでない段で押すと狙いに足して印も付けたので、狙いにするつもりで印が付いた (10-23 オーナー「印を付けていないのに ✦ スタート」) -->
        <!-- 狙いの MOD の行に札 (印ありは ✦ の色)、段の表では狙いの段の左に色の帯 (行の色、10-24 オーナー「フラクチャーにした行は色を変えて」) -->
        <template #row-badge="{ row: r }">
          <span v-if="rowGoal(r)" data-mod-goal-badge class="whitespace-nowrap rounded-sm px-1 py-px text-[10px] leading-none" :class="rowGoal(r)!.fractured ? 'bg-mod-fractured/25 text-mod-fractured' : 'bg-amber-400/20 text-amber-100'">{{ rowGoal(r)!.fractured ? "✦ " : "" }}{{ tierRankLabel(rowGoal(r)!.tier) }}</span>
        </template>
        <template #tier-lead="{ row: r, tier: tt }">
          <td class="w-1 p-0" :class="goalAt(tt.modId ?? r.id, tt.tier) ? (rowGoal(r)?.fractured ? 'bg-mod-fractured/70' : 'bg-amber-300/50') : ''" />
        </template>
        <template #tier-actions="{ row: r, tier: tt }">
          <td class="w-48 whitespace-nowrap py-0.5 text-right">
            <!-- 選んだ段より上の段は狙いに含まれる印だけ (押すとそこから上に絞る)。ボタンの形にすると狙いが 2 つあるように見えた (10-24 オーナー) -->
            <button v-if="goalAt(tt.modId ?? r.id, tt.tier) === 'in'" type="button" data-mod-included class="px-2 text-[12px] opacity-60 hover:opacity-100" :title="tr(`狙いに含む。押すと ${tt.rank} 以上に絞る`, `Included in the target. Click to narrow to ${tt.rank}+`)" @click.stop="pickGoal.toggle(tt.modId ?? r.id, tt.tier)">{{ tr("含む", "Included") }}</button>
            <button v-else type="button" data-mod-pick class="tbtn" :disabled="!!blockOf(tt.modId ?? r.id, tt.tier)" :class="pickGoal.has(tt.modId ?? r.id, tt.tier) ? 'on' : ''" :title="blockOf(tt.modId ?? r.id, tt.tier) ?? (pickGoal.has(tt.modId ?? r.id, tt.tier) ? tr('もう一度押すと狙いから外す', 'Click again to remove the target') : tr(`${tt.rank} 以上を完成の狙いにする`, `Make ${tt.rank}+ a final target`))" @click.stop="pickGoal.toggle(tt.modId ?? r.id, tt.tier)">{{ pickGoal.has(tt.modId ?? r.id, tt.tier) ? (tt.tier === 1 ? tr("✓ 狙い", "✓ Target") : tr(`✓ 狙い (${tt.rank} 以上)`, `✓ Target (${tt.rank}+)`)) : tr("狙いにする", "Target") }}</button>
            <button v-if="goalAt(tt.modId ?? r.id, tt.tier) !== 'in'" type="button" data-mod-fracture class="tbtn ml-1" :disabled="!!blockOf(tt.modId ?? r.id, tt.tier)" :class="isFrac(tt.modId ?? r.id, tt.tier) ? 'on !text-mod-fractured' : ''" :title="blockOf(tt.modId ?? r.id, tt.tier) ?? (isFrac(tt.modId ?? r.id, tt.tier) ? tr('もう一度押すとフラクチャーの印を外す', 'Click again to remove the fracture mark') : tr(`${tt.rank} 以上をフラクチャーの候補にする (どれか 1 つが固定されたレアからスタート)`, `Make ${tt.rank}+ a fracture candidate (start from a rare with one of them fractured)`))" @click.stop="markFracture(tt.modId ?? r.id, tt.tier)">{{ isFrac(tt.modId ?? r.id, tt.tier) ? tr("✦ 印", "✦ Marked") : tr("フラクチャー", "Fracture") }}</button>
          </td>
        </template>
      </ModTable></div>
      <!-- 完成形のカード (ページの送りでも見えるよう上に留める) -->
      <!-- カードはエミュと同じ既定の幅 (480、スマホは全幅。10-24 オーナー「アイテム絵はシミュと同じ」) -->
      <div data-tree-goal-card class="sticky top-0 flex shrink-0 flex-col gap-2 max-md:static max-md:order-first md:w-[480px]">
        <StageItemCard v-if="t.goalItem.value" :item="t.goalItem.value.item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :fracture-group="marks" fracturable row-remove tier-at-least @fracture="onCardFracture" @remove="onCardRemove" />
        <!-- 枠を超えた狙い (10-23 オーナー「欲しい物を全部選ぶので枠を超えてよい」): 止めずにカードの下に並べる -->
        <div v-if="t.goalItem.value?.left.length" data-tree-goal-over class="flex flex-col gap-0.5 rounded-md bg-white/[0.04] px-2 py-1 text-[12px]">
          <p class="opacity-70">{{ tr(`カードに乗らない狙い ${t.goalItem.value.left.length} つ (枠の外。どれかが付けば当たり)`, `${t.goalItem.value.left.length} target(s) beyond the slots (a hit if any rolls)`) }}</p>
          <p v-for="a in t.goalItem.value.left" :key="a.modId" data-tree-goal-over-row class="min-w-0 truncate" :class="a.fractured ? 'text-mod-fractured' : 'text-[#c8c8ff]'" :title="a.reason">{{ a.fractured ? "✦ " : "" }}{{ t.startModLabel(a, true) }}</p>
        </div>
        <p v-if="t.goalItem.value?.note" data-tree-goal-problem class="rounded-md border border-rose-400/50 bg-[#2a1416] px-2 py-1 text-[12px] text-rose-100">{{ tr(`付けられない狙いがある: ${t.goalItem.value.note}`, `A target can't be added: ${t.goalItem.value.note}`) }}</p>
        <!-- 説明は 1 つの事 = 1 行 (10-24 オーナー「・で区切って行で分ける、1 行は折り返して OK」) -->
        <ul data-tree-goal-help class="flex list-disc flex-col gap-0.5 pl-4 text-[12px] opacity-70">
          <li v-for="(line, k) in HELP" :key="k">{{ tr(line[0], line[1]) }}</li>
        </ul>
        <!-- 次へ (決めた) はカードと説明の下 (10-24 オーナー)。列ごと上に留めるので一覧を送っても見える。スマホは列が上に積まれるので下の帯に出す -->
        <div class="max-md:hidden"><button type="button" data-tree-goal-done class="g-btn-red min-h-11 w-full px-4 text-[14px]" @click="close">{{ tr("決めた (ツリーへ)", "Done (back to the tree)") }}</button></div>
      </div>
      <!-- スマホはカードの列が上に積まれるので、「決めた」は一覧の下に貼り付ける (一覧を送っている間は画面の下に見える) -->
      <div class="sticky bottom-0 z-10 bg-[#120d08]/90 py-2 md:hidden"><button type="button" data-tree-goal-done class="g-btn-red min-h-11 w-full px-4 text-[14px]" @click="close">{{ tr("決めた (ツリーへ)", "Done (back to the tree)") }}</button></div>
    </div>
    <!-- 下の帯は 2 完成の MOD の段だけで「← ベース」を控えめに。ベースの段の「次へ」は出さない (ベースを押すと 2 へ進む。10-23 オーナー「ベース決めないと進めないし、どのみち」)。
         「決めた」(決める手の赤 g-btn-red、1 画面 1 つ) はカードと説明の下へ移した (10-24 オーナー) -->
    <template v-if="step === 2" #footer>
      <div class="flex w-full items-center gap-2">
        <button type="button" class="g-btn sm" @click="go(1)">{{ tr("← ベース", "← Base") }}</button>
      </div>
    </template>
    <TreeFractureAsk v-if="fracAsk" @close="fracAsk = false" />
  </ModalShell>
</template>
