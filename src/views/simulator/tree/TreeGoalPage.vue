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
import { goalBlockLoose } from "./tree-goal-cap";
import { TIER } from "../../../state/for-share/tier-word";
import TreeBasePick from "./TreeBasePick.vue";
import TreeRecipeBar from "./TreeRecipeBar.vue";
import TreeFlowSteps from "./TreeFlowSteps.vue";
import TreeTabs from "./TreeTabs.vue";
import TreeStartAsk from "./TreeStartAsk.vue";
import TreePasteBox from "./TreePasteBox.vue";
import SimTutorialEntry from "../tutorial/SimTutorialEntry.vue";
import TreePasteNote from "./TreePasteNote.vue";
import { pasteNote } from "./tree-paste";
import { quickSave, unsaved } from "./tree-save";
import { setCurrentTreeRecipe } from "../../../state/simulator/tree-recipes";
import { useTree } from "./use-tree";
import { orphanHits } from "./tree-fail";
import { openTreePage, treeStep } from "../../../web/page";
import { useTapFracture } from "../phone/use-tap-fracture";
import TreeGoalQuality from "./TreeGoalQuality.vue";
import { qualityUndecided } from "./tree-goal-quality";
import { isPhoneWidth } from "../../../utils/use-phone";
import { useGoalShown } from "./use-goal-shown";
import HelpTip from "../../../components/ui/HelpTip.vue";
import type { RowToggle } from "../../../components/for-share/item/stage-item-row-tag";
import { dropWay, inWay, isBreachAim, isCraftAim, toggleWay, wayUndecided, WAY_ORDER } from "./tree-way-mods";
import { flag } from "../../../web/release-flags";
import { useEditReset } from "./use-edit-reset";
import TreeAttachPick from "./TreeAttachPick.vue";
import { wayName } from "./tree-attach";
/** 段の行のボタンを「付ける」1 つに (S-10b) */
const ATTACH = flag("attachWay");

const t = useTree();
/** 完成形のカード (品質・ブリーチの「途中で消える」の行、スイッチ goalQuality) */
const shown = useGoalShown();
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
/** 貼り付けで取り込んだ (どの画面から貼っても。ベースと狙いを入れて ② へ移すのは tree-paste) = この窓の「まだ選んでいない」と確かめを外す */
watch(pasteNote, (v) => { if (v) { asking.value = null; dropped.value = []; unpicked.value = false; } });
/**
 * 閉じる (× / Esc / 枠の外)。ベースをまだ選んでいない白紙の木では、既定のベースで木を始めず、シミュの画面に残ってベースが無い時の空の形を出す
 * (use-tree の needBase。10-23 オーナー「ベースが無いとツリーもくそもない」「× 押したらシミュレーターが消え失せる」)
 */
function close(): void { edits.leave(closeNow); }
function closeNow(): void {
  asking.value = null;
  dropped.value = [];
  t.needBase.value = unpicked.value;
  go(0);
}
/** 今ある木の前提を変えたら木はスタートだけに (出る時に保存を聞く。S-67、スイッチ resetOnEdit) */
const edits = useEditReset(t);
watch(() => t.goalPage.value, (v, o) => { if (v && !o) edits.remember(); else if (!v) edits.forgetIfClosed(); }, { immediate: true });
// URL から先にページが開き、白紙の判定 (SimTreePage の onMounted の needBase) が後から立つ時も「まだ選んでいない」にする (初めての sim-base で戻り先の無い「← ツリーに戻る」が出ていた)
watch(() => t.needBase.value, (v) => { if (v) unpicked.value = true; });
/** 手の入った木 (始まりの箱に手がある) */
const hasHand = (d: TreeDoc): boolean => Object.keys(d.boxes).length > 1 || !!d.boxes.start?.hand;
/**
 * フラクチャーの設定が済んだか (「決めた」の後の窓で答えた = fracAsked。前に組んだ手のある木も済んだ扱い)。済むまでこの窓は × ・枠の外・Esc で閉じず、
 * 進むのは「決めた (ツリーへ)」だけ (10-27 夜オーナー「フラクチャー設定を素通りするから、絶対に MOD 一覧で × はない」「フラクチャー無しでも一旦どうする?って聞く」、スイッチ fracFirst)
 */
const fracDone = computed(() => !!t.doc.value.fracAsked || hasHand(t.doc.value));
/**
 * 戻れる木がある: ほかのタブに手か狙いの入った木、または今のタブに手が入っている (木で打ってから MOD のページへ来た)。
 * 初めての時のベース選び・ベースを選んだ後の MOD のページ (狙いだけ) には出さない (10-25 オーナー「ベース決めるところでツリーへ戻るはないでしょ」「残さないで」)
 */
const canBack = computed(() => t.tabDocs.value.some((d0, i) => (i === t.active.value ? !unpicked.value && hasHand(t.doc.value) : hasHand(d0) || !!d0.memoAims?.length)));
function backToTree(): void {
  asking.value = null;
  dropped.value = [];
  if (unpicked.value && t.leaveNewTab()) { if (treeStep.value !== "tree") openTreePage("tree"); return; }
  edits.leave(() => go(0));
}
/** 2 へ進む (段のタブ・「次へ」)。今のベースで決めた扱い (白紙のまま 2 を開いてから閉じても空の形にはしない) */
function toMods(): void { unpicked.value = false; t.chooseBase(); go(2); }
/** 流れの帯を押した: 1 = ベース、2 = 完成の MOD、3 = ツリーへ (閉じる)、4 = 閉じて結果のまとめ */
function onFlow(n: 1 | 2 | 3 | 4): void {
  if (n === 1) go(1);
  else if (n === 2) toMods();
  else toTree(n === 4 ? () => { t.reportOpen.value = true; } : undefined);
}
function pick(en: string): void {
  unpicked.value = false;
  t.needBase.value = false;
  if (en === t.doc.value.base) { t.chooseBase(); go(2); return; }
  // 消える箱があり、その木が作りかけ (保存していない) の時だけ聞く (保存済みのままなら消えてもレシピに残る)
  if (t.lostOnBase.value > 0 && unsaved(t.doc.value)) { asking.value = en; return; }
  apply(en);
}
/** 木が消えるベースの替え (確かめの答え)。替えた後は名前なしの新しい木 (開いていたレシピへ次の保存で上書きしない) */
function changeBase(save: boolean): void {
  const en = asking.value;
  if (!en) return;
  if (save) quickSave();
  setCurrentTreeRecipe(null);
  apply(en);
}
function apply(en: string): void {
  asking.value = null;
  // 文は替える前のベースの行で作る (外した MOD は新しいベースの一覧に無い)
  const label = new Map(t.goals.value.map((a) => [a.modId, t.startModLabel(a, true)]));
  dropped.value = t.setBase(en, t.doc.value.itemLevel).map((a) => label.get(a.modId) ?? tr("(名前の無い MOD)", "(unnamed mod)"));
  go(2);
}
/** 貼り付けで取り込んだ (ベースと狙いは tree-paste が入れた) = 完成の MOD のページへ */
function onPasted(): void { asking.value = null; dropped.value = []; unpicked.value = false; t.needBase.value = false; go(2); }
/** 途中で消えるクラフト MOD (tree-way-mods) も一覧では狙いと同じに光り、押すと外れる (スイッチ goalQuality) */
const pickGoal = {
  has: (modId: string, tier: number): boolean => t.hasGoal(modId, tier) || ((t.doc.value.wayMods ?? []).some((a) => a.modId === modId && a.tier === tier)),
  toggle: (modId: string, tier: number): void => { if (inWay(t.doc.value, modId)) t.edit((d) => dropWay(d, modId)); else t.toggleGoal(modId, tier); },
};
/** カードの下の「途中で消える」の切り替えに並べるクラフト MOD (残る物 + 途中で消える物。2 つ以上の時だけ出す) */
const crafts = computed(() => {
  const d = s.data.value, doc = t.doc.value;
  if (!d) return [];
  const list = [...t.goals.value.filter((a) => isCraftAim(d, a)).map((a) => ({ a, way: false })), ...(doc.wayMods ?? []).map((a) => ({ a, way: true }))];
  // 束 (S-30b) の時は切り替えはブリーチと前に「途中で消える」にした物だけ (ほかは束の札「どれか n つ」)
  return list.length >= 2 ? (ATTACH ? list.filter((c) => c.way || isBreachAim(c.a)) : list) : [];
});
/** 「途中で消える」の切り替えをカードの MOD の行の右に置く (デザインの口 rowToggles、10-27 夜オーナー。goalQuality と rowToggle の両方の時だけ、片方ならカードの下の欄) */
const inRow = computed(() => true);
const wayToggles = computed((): Map<string, RowToggle> | null => (inRow.value && crafts.value.length ? new Map(crafts.value.map((c) => [c.a.modId, { text: tr("途中で消える", "Removed on the way"), on: c.way, title: `${c.way ? tr("押すと残す (完成の狙いへ戻す)", "Click to keep it (back to the final targets)") : tr("押すと途中で消える物にする (完成の狙い・枠・完成の判定に数えない)", "Click to mark it removed on the way (not counted as a final target, slot or for completion)")}
${WAY_ORDER()}` }])) : null));
/** カードの札: 行の右に切り替えがある行は「途中で消える」の札を外す (押された切り替えと同じ言葉が 2 つ並ぶので) */
const cardTags = computed(() => { const tg = shown.tags.value, tv = wayToggles.value; if (!tg || !tv) return tg; const m = new Map(tg); for (const k of tv.keys()) m.delete(k); return m; });
/** カードに乗らない狙い (束のクラフト MOD はカードに出すので除く、S-30b) */
const overLeft = computed(() => { const l = t.goalItem.value?.left ?? [], b = shown.bundled.value; return b.size ? l.filter((a) => !b.has(a.modId)) : l; });
/** 残るクラフト MOD が上限を超えている間の「決めた」を押せない理由 */
const undecided = computed(() => (s.data.value ? wayUndecided(s.data.value, t.doc.value, t.goalItem.value?.item ?? null) : null));
/** 完成の狙いに無い MOD を当たりにしている箱 (狙いを外した後も木に残る。tree-model の orphanHits) */
const orphans = computed(() => orphanHits(t.doc.value));
const orphanNames = computed(() => [...new Set(orphans.value.map((id) => t.aimShort(t.doc.value.boxes[id]!.aim!)))].join(tr("・", ", ")));
/**
 * 今の狙いの組にその段を足せない理由 (足せれば null。エンジンの入口 goalBlock: 枠・同じ系統・冒涜 1 つまで・クラフト MOD の上限・アイテムレベル、10-24 オーナー)。
 * 同じ MOD の段の替えは見ない (その MOD を除いた組で聞く)。適正の間はアイテムレベルが狙いに合わせて上がるので、レベルでは断らない。組・ベース・レベルが変わるまで覚える
 */
const FIT_ILVL = 100;
let blockMemo = new Map<string, string | null>(), blockFor = "";
function blockOf(modId: string, tier: number): string | null {
  const d = s.data.value, doc = t.doc.value;
  if (!d) return null;
  // クラフト MOD は 2 つ目以降も足せる (残すか途中で消えるかはカードの下で決める、スイッチ goalQuality)。ほかのクラフト MOD を除いた組で聞く
  const craft = isCraftAim(d, { modId });
  const lv = doc.ilvlFit ? FIT_ILVL : doc.itemLevel, aims = t.goals.value.filter((a) => a.modId !== modId && !(craft && isCraftAim(d, a))).map((a) => ({ modId: a.modId, tier: a.tier }));
  const key = `${doc.base}|${lv}|${craft ? 1 : 0}|${JSON.stringify(aims)}`;
  if (key !== blockFor) { blockFor = key; blockMemo = new Map(); }
  const k = `${modId}|${tier}`;
  // 候補は枠に縛らず 10 まで (S-04、スイッチ goalTen): 枠以外の断りだけ
  if (!blockMemo.has(k)) blockMemo.set(k, goalBlockLoose(d, doc.base, lv, aims, { modId, tier }, t.goals.value.some((a) => a.modId === modId)));
  return blockMemo.get(k) ?? null;
}
/** 開いた行の頭に出す押せない理由 (理由ごとに段をまとめる。全部の段が押せる・もう狙いの行は無し。10-26 モンキー 7 の 6「灰色のボタンが並ぶだけで理由が見えない、スマホは乗せる事もできない」) */
function rowBlocks(r: { id: string; tiers: Array<{ modId?: string; tier: number; rank: string }> }): Array<{ why: string; ranks: string }> {
  if (rowGoal(r)) return [];
  const by = new Map<string, string[]>();
  for (const x of r.tiers) { const w = blockOf(x.modId ?? r.id, x.tier); if (w) by.set(w, [...(by.get(w) ?? []), x.rank]); }
  const n = r.tiers.length;
  return [...by].map(([why, rs]) => ({ why, ranks: rs.length === n ? "" : rs.length > 2 ? `${rs[0]}〜${rs[rs.length - 1]}` : rs.join(tr("・", ", ")) }));
}
/** フラクチャーを押せない理由: 冒涜の MOD (アマナム・クルガル・ウラマンなど) はフラクチャーできない (エンジンと同じ。10-25 指輪の猿 4: 押せて、テストで「始まりの形が作れない」) */
const DESECRATED_NO_FRACTURE = (): string => tr("冒涜の MOD はフラクチャーできない", "Desecrated mods can't be Fractured");
function fracBlockOf(r: { group?: string }, modId: string, tier: number): string | null {
  return r.group === "desecrated" || r.group === "otherworldly" ? DESECRATED_NO_FRACTURE() : blockOf(modId, tier);
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
/** スマホの形で「フラクチャーから」の時は、カードの MOD を押すとフラクチャー (✦、1 つだけ。右クリックが無いので。10-26 夜オーナー) */
const tapFrac = useTapFracture();
/** 印を付け外す (始め方はツリーへ行く時の窓 TreeStartAsk でまとめて決める、10-26 夜オーナー「そこで決める形に統一」。前は印を付けた時に 2 択を聞いた) */
function markFracture(modId: string, tier: number): void { t.toggleFracture(modId, tier); }
/** ツリーへ (「決めた」・流れの帯の 3 / 4): 完成の狙いがあれば「フラクチャーから / 白ベースから」の窓を出してから (どの入口から来ても同じ) */
const startAsk = ref<null | (() => void)>(null);
/** 品質の 2 択・カタリストの種類が未定のまま「決めた」を押した (押した後だけ欄の下に理由を出す、S-31c、スイッチ qualityAsk) */
const qualityTried = ref(false);
const qualityWarn = computed(() => (qualityTried.value ? qualityUndecided(t.doc.value, t.goalItem.value?.item) : null));
function toTree(after?: () => void): void {
  if (undecided.value) return;
  if (qualityUndecided(t.doc.value, t.goalItem.value?.item)) { qualityTried.value = true; document.querySelector("[data-tree-goal-quality]")?.scrollIntoView({ block: "nearest" }); return; }
  const go = (): void => edits.leave(() => { closeNow(); after?.(); });
  // 狙いが無い時はフラクチャーにする物が無いので聞かずに進む (答えた扱い)
  if (t.goals.value.length) startAsk.value = go; else { t.edit((d) => { d.fracAsked = true; }); go(); }
}
/** カードの行の × = 一覧で外したのと同じ (狙いから外す、印も一緒に外れる。10-24 夜オーナー「アイテムにつく UI からもバツで消したい」) */
function onCardRemove(modId: string): void {
  const g = t.goals.value.find((a) => a.modId === modId);
  if (g) t.toggleGoal(g.modId, g.tier);
}
/** カードの行の右クリック = その狙いの段で印を付け外し (狙いでない MOD は来ない) */
function onCardFracture(m: StageMod): void {
  const g = t.goals.value.find((a) => a.modId === m.modId);
  // 冒涜の MOD は印を付けられない (付いている印を外すのはよい)
  if (m.desecrated && !g?.fractured) return;
  if (g) markFracture(g.modId, g.tier);
}
/** 完成の MOD の段の説明 (日本語・英語の組、1 つの事 = 1 行。3 つ目が true の行は PC だけ = スマホに右クリックは無い、10-26 猿の 9) */
const HELP: Array<[string, string, boolean?]> = [
  [`狙いにする: その${TIER}以上が付けば当たり (狙いは MOD 1 つ、上の${TIER}は「含む」)`, "Target: a hit if that tier or better rolls (one target per mod; higher tiers are included)"],
  ["後の箱の当たりは、この狙いから選ぶ", "Later hit boxes pick from these targets"],
  ["フラクチャー (✦) = 固定してよい MOD の印。いくつでも付けられ、フラクチャーでどれか 1 つが固定されれば当たり。始め方 (フラクチャー済みから / 白から確定フラクチャー) は「決めた」の後の窓で選ぶ", "Fracture (✦) = marks mods that may be fixed. Mark any number; a fracture is a hit if any one of them is fixed. How to start (already fractured / sure fracture from white) is chosen after Done"],
  // カードの MOD を押してもフラクチャー (エミュと同じ、10-28 オーナー「スマホと共有でクリックでもフラクチャーできるようにPCも変えてくれ」、スイッチ clickFracture)
  ["カードの行を押しても印を付け外し (右クリックでも)", "Click a row on the card to toggle the mark too (right-click works too)"],
  ["印が無ければ「決めた」の後の窓で、フラクチャーにする MOD を選ぶか白ベース (フラクチャー無し) から", "No mark: after Done, pick the mod to fracture or start from a white base (no fracture)"],
];
/** 説明はスマホでは既定で閉じる (カードの下で MOD の行が画面の外へ押し出された、10-26 猿の 10)。PC は開いたまま */
const helpOpen = ref(!isPhoneWidth());
// 2 の段に着いたら上から (ベースの一覧を送った位置のまま着き、カードと狙いの行が見えなかった、10-26 猿の 1)
watch(step, (n) => { if (n === 2 && asPage.value) void nextTick(() => window.scrollTo(0, 0)); });
</script>

<template>
  <!-- ページで出している間は高さを決めず、本文の送りの箱も外す (ページごと送る。1 の段 = 10-23 オーナー「エミュと同じ展開時の表示の仕方」、2 の段 = 10-24 オーナー「一覧の中に別のスクロールの箱を作らない」)。窓の時は窓の本文 1 つで送る -->
  <ModalShell :open="true" :inline="asPage" :closable="!(asPage && unpicked) && fracDone" rec="tree-goal" :title="tr('0 完成形の設定', '0 Final item')" :close-title="tr('ツリーへ戻る (Esc / 枠の外を押す)', 'Back to the tree (Esc / click outside)')" :width="asPage ? (step === 1 ? 'w-full max-md:!border-0 max-md:[border-image:none] max-md:!bg-none max-md:!p-0' : 'w-full') : 'w-[88%] h-[86%] max-md:h-full'" full-on-phone :body-class="asPage ? (step === 1 ? 'px-3 pb-3 max-md:px-2 !overflow-visible' : 'px-3 pb-3 !overflow-visible') : 'px-3 pb-3'" @close="close">
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
        <span class="min-w-0 truncate max-md:overflow-visible max-md:whitespace-normal max-md:break-words">{{ tr(`アイテムレベルを ${t.ilvlNote.value.to} に合わせました (適正)`, `Item level set to ${t.ilvlNote.value.to} (fit)`) }}</span>
        <button type="button" data-tree-ilvl-note-close class="shrink-0 rounded px-1 opacity-60 hover:bg-white/10 hover:opacity-100" :aria-label="tr('閉じる', 'Close')" @click="t.ilvlNote.value = null">×</button>
      </p>
      <!-- 今ある木の前提を変えた: 木はスタートだけに戻る (S-67、スイッチ resetOnEdit) -->
      <div v-if="edits.ask.value" data-tree-edit-reset-ask class="sticky top-0 z-10 mx-3 mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-rose-400/60 bg-[#2a1416] px-3 py-2 text-[13px]">
        <p class="min-w-0 flex-1 break-words">{{ tr(`この変更で今の木 (箱 ${edits.ask.value.boxes} 個) は消え、スタートからやり直します。保存しますか?`, `This change clears the current tree (${edits.ask.value.boxes} boxes) and starts over from the start. Save it first?`) }}</p>
        <button type="button" data-tree-edit-reset-save class="g-btn sm" @click="edits.answer('save')">{{ tr("保存して変える", "Save and change") }}</button>
        <button type="button" data-tree-edit-reset-ok class="g-btn sm" @click="edits.answer('drop')">{{ tr("保存せず変える", "Change without saving") }}</button>
        <button type="button" data-tree-edit-reset-cancel class="g-btn sm" @click="edits.answer('cancel')">{{ tr("やめる (変更を戻す)", "Cancel (undo the change)") }}</button>
      </div>
      <TreePasteNote v-if="step === 2" />
      <!-- 外した狙いを使う当たりの箱が木に残っている (箱は消さない。木で × か、1 つ戻す。10-26 モンキー 7 の 5) -->
      <p v-if="step === 2 && orphans.length" data-tree-goal-orphans class="flex min-w-0 flex-wrap items-center gap-2 px-3 pb-2 text-[12px] text-rose-200/90">
        <span class="min-w-0 flex-1 break-words">{{ tr(`完成の狙いに無い当たりの箱が木に ${orphans.length} 個残っている: ${orphanNames}`, `${orphans.length} hit box(es) in the tree use a target that is no longer final: ${orphanNames}`) }}</span>
        <button type="button" data-tree-goal-undo class="g-btn sm shrink-0" :disabled="!t.canUndo.value" @click="t.undo">{{ tr("1 つ戻す", "Undo") }}</button>
      </p>
      <p v-if="step === 2 && dropped.length" data-tree-goal-dropped class="min-w-0 truncate max-md:overflow-visible max-md:whitespace-normal max-md:break-words px-3 pb-2 text-[12px] text-rose-200/80" :title="dropped.join('\n')">{{ tr(`このベースに付かない狙いを外した: ${dropped.join("・")}`, `Removed targets this base can't roll: ${dropped.join(", ")}`) }}</p>
    </template>
    <div v-if="step === 1" data-tree-goal-base class="flex min-w-0 flex-col gap-3">
      <TreeBasePick />
      <!-- チュートリアルの入口 (初回も 2 回目以降もいつも出す、スマホは出さない。10-26 夜オーナー) -->
      <!-- PC はチュートリアルの入口と貼り付けを横に並べる (縦に積むとアミュレットの段が 1660×860 で画面の下の外だった、10-26 モンキー 7 の 20) -->
      <div class="flex min-w-0 gap-3 max-md:flex-col [&>*]:min-w-0 [&>*]:flex-1">
        <SimTutorialEntry />
        <!-- アイテムを貼り付けて取り込む (一覧の上、目立つ口。10-25 オーナー「ベース一覧の所に分かりやすく出したい」)。取り込めたら完成の MOD へ -->
        <TreePasteBox @done="onPasted" />
      </div>
      <!-- ベースを替えると今の木が消える時だけ、1 回確かめる (上に貼り付けて、一覧を送っていても見える所に) -->
      <div v-if="asking" ref="askEl" data-tree-base-ask class="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-rose-400/60 bg-[#2a1416] px-3 py-2 text-[13px]">
        <p class="min-w-0 flex-1">{{ tr(`${jaTypeName(asking)} の白紙から組み直します。今の木 (箱 ${t.lostOnBase.value} 個) が消えます。完成の狙いは ${jaTypeName(asking)} にも付く物だけ残ります (1 つ戻すで戻せます)。`, `Start over from a blank ${asking}. This tree (${t.lostOnBase.value} box(es)) will be removed. Final targets that ${asking} can roll are kept (Undo brings it back).`) }}</p>
        <!-- 保存は名前を聞かずその場で (開いていたレシピなら上書き、tree-save.ts。10-26 オーナー「保存しますかって聞かれたら保存でおｋ」) -->
        <button type="button" data-tree-base-save class="g-btn sm" @click="changeBase(true)">{{ tr("保存して替える", "Save and change") }}</button>
        <button type="button" data-tree-base-ok class="g-btn sm" @click="changeBase(false)">{{ tr("保存せず替える", "Change without saving") }}</button>
        <button type="button" class="g-btn sm" @click="asking = null">{{ tr("やめる", "Cancel") }}</button>
      </div>
      <!-- エミュのベースのページと同じ作り (共通の BasePickBody: 帯 + ベースの一覧、未選択の時は人気のベースを上に)。帯はシミュの説明で「すぐ試す」は無し (10-23 オーナー) -->
      <!-- key: 白紙の判定が後から立つと (上の watch)、一覧は金の指輪の部位を開いた形で作られた後で、指輪の 1 回目の押しが畳むだけになっていた (猿 8 匹中 8 匹、10-25)。未選択に変わったら作り直して部位を閉じる -->
      <BasePickBody :key="unpicked ? 'unpicked' : 'picked'" :selected="unpicked ? '' : t.doc.value.base" :popular="unpicked" :intro="unpicked" :quick="false"
        :title="tr('完成させたいアイテムから、打ち方の道を組んで費用を見積もれます', 'Plan a craft route to the item you want and estimate the cost')"
        :lead="tr('ベースを選び、狙いの MOD を決めると、スタートから完成までの道をツリーで組めます。100 人回して完成の割合と費用を出します', 'Choose a base and your target mods, then lay out the route from the start to the finished item as a tree. Run it 100 times for the finish rate and the cost')"
        @pick="pick" />
    </div>
    <!-- スマホの形 (1280 未満、U-53) は縦に積む (完成形のカードが上、表は全部の幅。横に並べると表が 1 文字幅に潰れた、10-23 デザイン部長の気づき・メモ web-phone-layout) -->
    <div v-else data-tree-goal-mods class="flex min-h-0 min-w-0 items-start gap-4 max-md:flex-col max-md:items-stretch">
      <div class="min-w-0 flex-1"><ModTable overlay :data="s.data.value" :item="t.goalItem.value?.item ?? null">
        <!-- 段の行のボタンは「狙いにする」(オーナー 10-22) と、狙いにした段だけその右に「フラクチャー」(印、10-23)。
             前はフラクチャーが左にあり、狙いでない段で押すと狙いに足して印も付けたので、狙いにするつもりで印が付いた (10-23 オーナー「印を付けていないのに ✦ スタート」) -->
        <!-- 狙いの MOD の行に札 (印ありは ✦ の色)、段の表では狙いの段の左に色の帯 (行の色、10-24 オーナー「フラクチャーにした行は色を変えて」) -->
        <template #row-badge="{ row: r }">
          <span v-if="rowGoal(r)" data-mod-goal-badge class="whitespace-nowrap rounded-sm px-1 py-px text-[10px] leading-none" :class="rowGoal(r)!.fractured ? 'bg-mod-fractured/25 text-mod-fractured' : 'bg-amber-400/20 text-amber-100'">{{ rowGoal(r)!.fractured ? "✦ " : ATTACH && rowGoal(r)!.via ? `${wayName(rowGoal(r)!.via!)} ` : "" }}{{ tierRankLabel(rowGoal(r)!.tier) }}</span>
        </template>
        <template #row-open="{ row: r }">
          <p v-for="b in rowBlocks(r)" :key="b.why" data-mod-block-why class="mt-1 break-words rounded-md bg-rose-500/10 px-2 py-1 text-[12px] text-rose-100">{{ b.ranks ? `${b.ranks}: ` : "" }}{{ tr(`押せない: ${b.why}。替えるなら完成形のカードの × で外す`, `Can't pick: ${b.why}. To swap, remove one with × on the final item card`) }}</p>
        </template>
        <template #tier-lead="{ row: r, tier: tt }">
          <td class="w-1 p-0" :class="goalAt(tt.modId ?? r.id, tt.tier) ? (rowGoal(r)?.fractured ? 'bg-mod-fractured/70' : 'bg-amber-300/50') : ''" />
        </template>
        <template #tier-actions="{ row: r, tier: tt }">
          <td class="w-48 whitespace-nowrap py-0.5 text-right">
            <!-- 選んだ段より上の段は狙いに含まれる印だけ (押すとそこから上に絞る)。ボタンの形にすると狙いが 2 つあるように見えた (10-24 オーナー) -->
            <button v-if="goalAt(tt.modId ?? r.id, tt.tier) === 'in'" type="button" data-mod-included class="px-2 text-[12px] opacity-60 hover:opacity-100" :title="tr(`狙いに含む。押すと ${tt.rank} 以上に絞る`, `Included in the target. Click to narrow to ${tt.rank}+`)" @click.stop="pickGoal.toggle(tt.modId ?? r.id, tt.tier)">{{ tr("含む", "Included") }}</button>
            <!-- 付け方 4 択の「付ける」1 つ (S-10b、スイッチ attachWay)。途中で消えるクラフト MOD は前のボタンのまま (押すと外れる) -->
            <TreeAttachPick v-else-if="ATTACH && !inWay(t.doc.value, tt.modId ?? r.id)" :mod-id="tt.modId ?? r.id" :tier="tt.tier" :rank="tt.rank" :group="r.group" :block="blockOf(tt.modId ?? r.id, tt.tier)" :aim="t.goals.value.find((a) => a.modId === (tt.modId ?? r.id))" />
            <button v-else type="button" data-mod-pick class="tbtn" :disabled="!!blockOf(tt.modId ?? r.id, tt.tier)" :class="pickGoal.has(tt.modId ?? r.id, tt.tier) ? 'on' : ''" :title="blockOf(tt.modId ?? r.id, tt.tier) ?? (pickGoal.has(tt.modId ?? r.id, tt.tier) ? tr('もう一度押すと狙いから外す', 'Click again to remove the target') : tr(`${tt.rank} 以上を完成の狙いにする`, `Make ${tt.rank}+ a final target`))" @click.stop="pickGoal.toggle(tt.modId ?? r.id, tt.tier)">{{ pickGoal.has(tt.modId ?? r.id, tt.tier) ? (tt.tier === 1 ? tr("✓ 狙い", "✓ Target") : tr(`✓ 狙い (${tt.rank} 以上)`, `✓ Target (${tt.rank}+)`)) : tr("狙いにする", "Target") }}</button>
            <button v-if="goalAt(tt.modId ?? r.id, tt.tier) !== 'in' && !(ATTACH && !inWay(t.doc.value, tt.modId ?? r.id))" type="button" data-mod-fracture class="tbtn ml-1" :disabled="!!fracBlockOf(r, tt.modId ?? r.id, tt.tier) && !isFrac(tt.modId ?? r.id, tt.tier)" :class="isFrac(tt.modId ?? r.id, tt.tier) ? 'on !text-mod-fractured' : ''" :title="fracBlockOf(r, tt.modId ?? r.id, tt.tier) ?? (isFrac(tt.modId ?? r.id, tt.tier) ? tr('もう一度押すとフラクチャーの印を外す', 'Click again to remove the fracture mark') : tr(`${tt.rank} 以上をフラクチャーの候補にする (どれか 1 つが固定されたレアからスタート)`, `Make ${tt.rank}+ a fracture candidate (start from a rare with one of them fractured)`))" @click.stop="markFracture(tt.modId ?? r.id, tt.tier)">{{ isFrac(tt.modId ?? r.id, tt.tier) ? tr("✦ 印", "✦ Marked") : tr("フラクチャー", "Fracture") }}</button>
          </td>
        </template>
      </ModTable></div>
      <!-- 完成形のカード (ページの送りでも見えるよう上に留める) -->
      <!-- カードはエミュと同じ既定の幅 (480、スマホは全幅。10-24 オーナー「アイテム絵はシミュと同じ」) -->
      <div data-tree-goal-card class="sticky top-0 flex shrink-0 flex-col gap-2 max-md:static max-md:order-first md:w-[480px]">
        <p v-if="tapFrac.on.value" data-tree-goal-tap-frac class="break-words rounded border border-[#a3342a]/60 bg-[rgba(163,52,42,0.25)] px-2 py-1.5 text-[13px] text-mod-fractured">{{ tapFrac.note.value }}</p>
        <StageItemCard :row-group="shown.groups.value" v-if="t.goalItem.value" :item="shown.item.value ?? t.goalItem.value.item" :row-tags="cardTags" :row-toggles="wayToggles" @toggle="(id: string) => t.edit((d) => toggleWay(d, id))" :added="[]" :removed="[]" :holding="false" :flash-key="0" :fracture-group="marks" fracturable :click-fracture="flag('clickFracture')" row-remove tier-at-least :mods-head="flag('qualityAsk') ? tr('完成形の MOD', 'Target mods') : undefined" @fracture="onCardFracture" @remove="onCardRemove" @jump="(id) => tapFrac.on.value && tapFrac.tap(id, [...(t.goalItem.value?.item.prefixes ?? []), ...(t.goalItem.value?.item.suffixes ?? [])].find((x) => x.modId === id))" />
        <!-- 完成形の品質 (20% を超えるとブリーチのエッセンスの MOD が要る、10-27 夕オーナー、スイッチ goalQuality) -->
        <TreeGoalQuality v-if="t.goalItem.value" :warn="qualityWarn" />
        <!-- クラフト MOD が 2 つ以上: どれを途中で消すか (完成の狙い・枠・完成の判定に数えない)。残るのはクラフト MOD の上限まで (10-27 夜オーナー、スイッチ goalQuality) -->
        <div v-if="crafts.length" data-tree-goal-ways class="flex flex-col gap-1 px-1 text-[12px]">
          <span v-if="!inRow" class="opacity-80">{{ tr("クラフト MOD (途中で消える物は完成の狙いに数えない)", "Crafted mods (ones removed on the way don't count as final targets)") }}</span>
          <!-- 行の右に置いた時: 打つ順の文はカードの札に乗せると出る。スマホは乗せられないので ? を 1 つ -->
          <span v-else class="flex items-center gap-1 opacity-80 md:hidden">{{ tr("「途中で消える」の打つ順", "Order for \"removed on the way\"") }}<HelpTip :text="WAY_ORDER()" /></span>
          <div v-for="c in inRow ? [] : crafts" :key="c.a.modId" data-tree-goal-way :data-mod="c.a.modId" class="flex min-w-0 flex-wrap items-center gap-2">
            <span class="min-w-0 break-words" :class="c.way ? 'text-amber-200/80 line-through decoration-amber-200/40' : 'text-[#c8c8ff]'">{{ t.aimLabel(c.a) }}</span>
            <button type="button" data-tree-goal-way-toggle class="tbtn ml-auto shrink-0" :class="c.way ? 'on' : ''" :aria-pressed="c.way" @click="t.edit((d) => toggleWay(d, c.a.modId))">{{ tr("途中で消える", "Removed on the way") }}</button><HelpTip v-if="c.way" :text="WAY_ORDER()" />
          </div>
          <p v-if="undecided" data-tree-goal-way-undecided class="break-words text-rose-200/90">{{ undecided }}</p>
        </div>
        <!-- 自動で嵌めた扱いのルーン (TreeGoalCard と同じ、10-26 オーナー) -->
        <p v-if="t.goalItem.value?.item.augments?.length" data-tree-goal-runes class="px-1 text-[11px] text-[#9fd3ff]/80" :title="tr('完成の狙いに要るルーン (特殊 MOD の分・クラフト MOD 2 つ目のアストリッドの創造性) を自動で嵌めた扱い。ツリーではそのルーンの手・2 つ目のクラフト MOD の手から効く', 'Runes the targets need (for special mods, and Astrid’s Creativity for a 2nd crafted mod) are socketed automatically. In the tree they apply from that rune or crafted-mod step')">◇ {{ tr("ルーン (自動)", "Runes (auto)") }}: {{ t.goalItem.value.item.augments.map((a) => tr(a.ja, a.en)).join(tr("・", ", ")) }}</p>
        <!-- 枠を超えた狙い (10-23 オーナー「欲しい物を全部選ぶので枠を超えてよい」): 止めずにカードの下に並べる -->
        <div v-if="overLeft.length" data-tree-goal-over class="flex flex-col gap-0.5 rounded-md bg-white/[0.04] px-2 py-1 text-[12px]">
          <p class="opacity-70">{{ tr(`カードに乗らない狙い ${overLeft.length} つ (枠の外。どれかが付けば当たり)`, `${overLeft.length} target(s) beyond the slots (a hit if any rolls)`) }}</p>
          <p v-for="a in overLeft" :key="a.modId" data-tree-goal-over-row class="min-w-0 truncate max-md:overflow-visible max-md:whitespace-normal max-md:break-words" :class="a.fractured ? 'text-mod-fractured' : 'text-[#c8c8ff]'" :title="a.reason">{{ a.fractured ? "✦ " : "" }}{{ t.startModLabel(a, true) }}</p>
        </div>
        <p v-if="t.goalItem.value?.note" data-tree-goal-problem class="rounded-md border border-rose-400/50 bg-[#2a1416] px-2 py-1 text-[12px] text-rose-100">{{ tr(`付けられない狙いがある: ${t.goalItem.value.note}`, `A target can't be added: ${t.goalItem.value.note}`) }}</p>
        <!-- 説明は 1 つの事 = 1 行 (10-24 オーナー「・で区切って行で分ける、1 行は折り返して OK」) -->
        <details data-tree-goal-help-wrap :open="helpOpen" @toggle="helpOpen = ($event.target as HTMLDetailsElement).open">
          <summary class="cursor-pointer text-[12px] opacity-70 md:hidden">{{ tr("狙い・フラクチャーの使い方", "How targets and fracture work") }}</summary>
          <ul data-tree-goal-help class="flex list-disc flex-col gap-0.5 pl-4 text-[12px] opacity-70">
            <li v-if="ATTACH" data-tree-goal-attach-help>{{ tr("付ける: 付け方 (ふつう・フラクチャー・冒涜) を選ぶ。その付け方で出ない物は灰色で、押すと訳。冒涜は付け方の覚えだけ (何個でも)。エッセンスの MOD は「ふつう」で付ける", "Add: pick how it is added (Normal / Fracture / Desecrate). Greyed ways can't give that mod; click for why. Desecrate is only a note (any number). Essence mods use Normal") }}</li>
            <li v-for="(line, k) in HELP" :key="k" :class="line[2] ? 'max-md:hidden' : ''">{{ tr(line[0], line[1]) }}</li>
          </ul>
        </details>
        <!-- 次へ (決めた) はカードと説明の下 (10-24 オーナー)。列ごと上に留めるので一覧を送っても見える。スマホは列が上に積まれるので下の帯に出す -->
        <div class="max-md:hidden"><button type="button" data-tree-goal-done class="g-btn-red min-h-11 w-full px-4 text-[14px]" :disabled="!!undecided" :title="undecided ?? undefined" @click="toTree()">{{ tr("決めた (ツリーへ)", "Done (back to the tree)") }}</button></div>
      </div>
      <!-- スマホはカードの列が上に積まれるので、「決めた」は一覧の下に貼り付ける (一覧を送っている間は画面の下に見える) -->
      <div class="sticky bottom-0 z-10 bg-[#120d08]/90 py-2 md:hidden"><button type="button" data-tree-goal-done class="g-btn-red min-h-11 w-full px-4 text-[14px]" :disabled="!!undecided" :title="undecided ?? undefined" @click="toTree()">{{ tr("決めた (ツリーへ)", "Done (back to the tree)") }}</button></div>
    </div>
    <!-- 下の帯は 2 完成の MOD の段だけで「← ベース」を控えめに。ベースの段の「次へ」は出さない (ベースを押すと 2 へ進む。10-23 オーナー「ベース決めないと進めないし、どのみち」)。
         「決めた」(決める手の赤 g-btn-red、1 画面 1 つ) はカードと説明の下へ移した (10-24 オーナー) -->
    <template v-if="step === 2" #footer>
      <div class="flex w-full items-center gap-2">
        <button type="button" class="g-btn sm" @click="go(1)">{{ tr("← ベース", "← Base") }}</button>
      </div>
    </template>
    <TreeStartAsk v-if="startAsk" @done="() => { const go = startAsk; startAsk = null; go?.(); }" @close="startAsk = null" />
  </ModalShell>
</template>
