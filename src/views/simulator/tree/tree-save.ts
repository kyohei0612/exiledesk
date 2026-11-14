/**
 * tree-save.ts — 木をその場で保存する (2026-10-26 オーナー「サクッと保存できるようにしたい。名前とか決めずにツリー作ってて保存しますかって聞かれたら保存でおｋ」)。
 * 開いていたレシピなら上書き、無ければ自動の名前 (「<ベース> 10/26 21:30」、後で一覧で直せる) で新しく。名前は聞かない。
 * 帯の「保存」(TreeRecipeBar)・離れる時の「保存して進む」(SimTreePage・StageRecipesPage の setLeaveGuard)・ベースを替える時の「保存して替える」(TreeGoalPage) で同じ
 */
import { nextTick, watch } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import { toRecipeV1 } from "../../../services/simulator/tree/tree-recipe-v1";
import { treeLoading } from "./use-tree-open";
import { currentTreeRecipe, overwriteTreeRecipe, sameTree, saveTreeRecipe, setCurrentTreeRecipe, treeRecipes, type TreeRecipe } from "../../../state/simulator/tree-recipes";
import { openTreePage, treeStep } from "../../../web/page";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { fmtDate } from "../recipe-share";
import { track } from "../../../utils/track";
import { useTree } from "./use-tree";
import { blankTree, draftCode, openDraftTree } from "./tree-draft-open";
import { openedMark } from "./tree-tab-recipe";

/**
 * 作りかけ (失うと困る物がある) か。開いているレシピがあればそれと違う時、無ければ完成の狙いか手 (箱 2 つ以上) がある時。
 * ベースだけ選んだ白紙は数えない。離れる・白紙に戻す・タブを閉じる・ベースを替える・貼り付け・レシピを開く時の確かめの元 (10-26 オーナー
 * 「シミュレーターからエミュクリックしたら保存聞かれなくね」: 前は箱 2 つ以上だけで、ベースと狙いを決めた木は聞かずに消えた)。
 * current = この木が今のタブの木か (ほかのタブの木は開いているレシピと比べない)
 */
export function unsaved(d: TreeDoc, current = true): boolean {
  // エミュの「シミュレーターへ」で狙いを入れたままなら聞かない (10-26 夜オーナー「狙いを入れただけで戻る時は聞かずに戻す」)
  if (pristine && pristine === JSON.stringify(d)) return false;
  const cur = current ? currentTreeRecipe.value : null;
  if (!cur && current && challengeTree(d)) return false;
  const openedAs = openedMark.v;
  if (cur) return !(openedAs?.id === cur.id && openedAs.at === cur.updatedAt && openedAs.v1 === v1Of(d)) && !sameTree(d, cur.tree);
  return !!d.memoAims?.length || Object.keys(d.boxes).length > 1;
}
/**
 * 人のレシピ (共有 URL・デイリーの順位の木) を開いて組み直し終えた時の打ち方の形 (S-03c、11-09 オーナー「おけ」)。
 * 組み直した木は保存した写しと打ち方の形が字面でずれる事がある (提出の形・古い版の読み替え) ので、開いたままなら作りかけに数えない。触って変われば今までどおり。
 * at = その時のレシピの最後の保存 (上書きした後は保存した物と比べる)
 */
// 控えはタブごと (S-09 ②、tree-tab-recipe の openedMark。タブを替えると替わる)
const v1Of = (d: TreeDoc): string => JSON.stringify(toRecipeV1(d));
/**
 * デイリーの挑戦の木をシミュで映している (S-03c ②、D-37g の帯で移った時)。挑戦の木は挑戦の側が持つので、離れる時に保存を聞かない。
 * 見分けは今日の挑戦の完成形 (デイリーが木に入れる fillTopicDoc で作った狙いの組) が木の完成形と同じか。デイリーの部品は入口から読まないので、デイリーを開いて読み込み済みの時だけ借りる
 */
let daily: { api: typeof import("../../daily/daily-api"); aims: typeof import("../../daily/daily-aims") } | null = null;
void Promise.all([import("../../daily/daily-api"), import("../../daily/daily-aims")]).then(([api, aims]) => { daily = { api, aims }; }, () => { /* 無くても今までどおり聞く */ });
function challengeTree(d: TreeDoc): boolean {
  const x = daily?.api.getTry(daily.api.todayId());
  if (!daily || !x?.fractured || !d.memoAims?.length) return false;
  const p = JSON.parse(JSON.stringify(d)) as TreeDoc;
  daily.aims.fillTopicDoc(p, x.aims, x.fractured, x.from);
  return JSON.stringify(p.memoAims) === JSON.stringify(d.memoAims);
}
/** レシピ id を開いた後に呼ぶ: 読み込み (少しずつ描く・データ待ち) が終わったらその時の木を覚える */
export function markOpened(id: string): void {
  openedMark.v = null;
  const stop = watch(() => !treeLoading.value && !!s.data.value, (ready) => {
    if (!ready) return;
    queueMicrotask(() => stop());
    void nextTick(() => { const cur = currentTreeRecipe.value; if (cur?.id === id) openedMark.v = { id, at: cur.updatedAt, v1: v1Of(useTree().doc.value) }; });
  }, { immediate: true });
}
/** エミュから入れた直後の木 (JSON)。そのままなら作りかけに数えない。tree-paste.ts の requestEmuItem が入れる */
let pristine: string | null = null;
export function markPristine(d: TreeDoc | null): void { pristine = d ? JSON.stringify(d) : null; }
/** 自動の名前 (ベースの名前 + 日時) */
export const autoName = (d: TreeDoc): string => `${tr(jaTypeName(d.base), d.base)} ${fmtDate(Date.now())}`;

/**
 * 保存したレシピへ戻る (10-26 モンキー 6: 「保存して進む」で離れた後のブラウザの戻る・Ctrl+S の後の読み直しで白紙に着いた)。
 * 離れる・閉じる時に開いていたレシピの id をこのタブの間だけ (sessionStorage) 覚え、ツリーのページへ戻った時にそれを開き直す。
 * 作業中の木は持ち越さない決め (10-24 夜) とは別: 保存済みのレシピを開くだけ。保存していない木は覚えない (白紙から)
 */
const RESUME_KEY = "exiledesk.tree.resume";
export function rememberResume(): void {
  try { const id = currentTreeRecipe.value?.id; if (id) sessionStorage.setItem(RESUME_KEY, id); else sessionStorage.removeItem(RESUME_KEY); } catch { /* 覚えられなくてもよい */ }
}
/**
 * 覚えたレシピを捨てる。共有のレシピ (#recipe= / デイリーの順位) を開く時に呼ぶ (S-02)。残すと、開いている間 (少しずつ描く途中は白紙に見える) に
 * スマホの見るだけの画面が付いて resumeTree が前のレシピを開き、後から呼んだ方が勝つので今のレシピが取り消された
 * (11-14 デイリー: 昨日の上位 → ブラウザの戻るで一覧 → 今日の上位で昨日のローブが出た)
 */
export function forgetResume(): void {
  try { sessionStorage.removeItem(RESUME_KEY); } catch { /* 消せなくてもよい */ }
}
/** 覚えたレシピ (1 回だけ。無い・消えたなら null) */
export function takeResume(): TreeRecipe | null {
  try {
    const id = sessionStorage.getItem(RESUME_KEY);
    sessionStorage.removeItem(RESUME_KEY);
    return id ? treeRecipes.value.find((r) => r.id === id) ?? null : null;
  } catch { return null; }
}
/**
 * 覚えたレシピを開き直す (白紙の木でツリーのページを開いた時)。上のタブの「シミュレーター」はベース選び (sim-base) を開くので、
 * ツリーの画面へ移して URL も sim-tree に (10-26 猿の 8・13: ベース選びに着き「3 ツリー」が押せず、狙いが消えたように見えた)。
 * 作りかけの木がまだ手元にある (このタブで作っていた) 時も、上のタブで来たベース選びでなくその木へ。開き直したら true
 */
export function resumeTree(): boolean {
  const t = useTree(), d = t.doc.value;
  if (d.memoAims?.length || Object.keys(d.boxes).length > 1) {
    if (treeStep.value !== "base" || !d.baseChosen) return false;
  } else {
    const r = takeResume();
    if (!r) return false;
    // 端末の作りかけの木がこのレシピの最後の保存より新しければ作りかけの木を、このレシピのまま開く (保存せず進んだ後も足した手が残る、S-02 ①、11-08 オーナー「なこして」)
    // URL に共有のレシピ (#recipe=) がある時は、そちらを開く (openSharedRecipe) ので前のレシピを戻さない (11-14 デイリーの順位から今日の物を押すと昨日の物が出た、S-02)
    const shared = /[#&]recipe=/.test(location.hash), code = shared ? null : draftCode(r.updatedAt);
    if (shared) { /* 戻さない */ }
    else if (code) void openDraftTree(code, r).then((ok) => { if (!ok && blankTree(t.doc.value)) { setCurrentTreeRecipe(r.id); t.open(r.tree, true); } });
    else { setCurrentTreeRecipe(r.id); t.open(r.tree, true); }
  }
  try { const u = new URL(location.href); u.searchParams.set("page", "sim-tree"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); } catch { /* 置き換えられなくても開く */ }
  openTreePage("tree");
  t.goalPage.value = 0;
  return true;
}
/** 今の木を保存する。返すのは保存先のレシピと、上書きか (画面の一言用) */
export function quickSave(): { r: TreeRecipe; over: boolean } {
  const d = useTree().doc.value, cur = currentTreeRecipe.value;
  if (cur) { overwriteTreeRecipe(cur.id, d); track("tree-recipe:overwrite"); return { r: cur, over: true }; }
  const r = saveTreeRecipe(autoName(d), d);
  track("tree-recipe:save");
  return { r, over: false };
}
