/**
 * use-sim-recipes.ts — シミュレーションの画面 (StageSimPanel.vue) のレシピの保存・呼び出し・ファイルの書き出しと読み込み。
 * StageSimPanel.vue から分けた (2026-10-16、500 行の決まり)。画面の 1 つごとに呼ぶ (状態は画面ごと)
 */
import { useArmed } from "../../utils/use-armed";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { craftStage, mergeRecipesFromFile, readSimRecipes, recipesToFile, writeSimRecipes, type SimRecipe, type SimSession } from "../../state/craft-stage";
import { track } from "../../utils/track";
import type { SimTargetsCtx } from "./use-sim-targets";
import type { SimRunCtx } from "./use-sim-run";
import { recipeShareUrl } from "./recipe-share";
import { tr } from "../../i18n/lang";
import { simJumpOpen } from "../../state/web-page";


export function useSimRecipes(d: SimTargetsCtx & SimRunCtx) {
  const { boughtDivine, fourDivine, rareDivine, fracDone, itemDivine, loadKept, magicDivine, modsDone, sortDone, num, orderDone, patternDone, recipeOut,
    restoring, results, sessionNow, startDone, whiteDivine, whiteOk } = d;
  const s = craftStage;
  // 工程の「決めた」を前回から戻すのはやめた (2026-10-08 オーナー「毎回リセットでおｋ」。途中の保存 (writeSimSession) は要望・バグの添付用にだけ残す)
  /**
   * レシピ (名前を付けて残した途中)。右上の「レシピ ▼」から保存・呼び出し・名前の付け替え・消す
   * (2026-10-07 オーナー「このガチャの仕組みシミュレーターで保管しときたい」「レシピ保存ボタンで管理できるように、名前も自分で変えて」)
   */
  const recipes = ref<SimRecipe[]>(readSimRecipes());
  const recipeOpen = ref(false);
  const recipeName = ref("");
  /** レシピの「呼び出す」「消す」の 2 回押し (key = load:id / del:id。2026-10-10 動きの揃え 7) */
  const recipeArm = useArmed();
  const recipeRenaming = ref<string | null>(null);
  const baseJa = computed(() => s.item.value?.baseJa ?? s.base.value);
  const fmtDate = (t: number): string => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  function openRecipes(): void {
    recipeOpen.value = !recipeOpen.value;
    recipeNote.value = "";
    recipeArm.clear();
    if (recipeOpen.value && !recipeName.value) recipeName.value = `${baseJa.value} ${fmtDate(Date.now())}`;
  }
  function saveRecipe(): void {
    const name = recipeName.value.trim() || `${baseJa.value} ${fmtDate(Date.now())}`;
    const r: SimRecipe = { id: `${Date.now()}`, name, savedAt: Date.now(), baseJa: baseJa.value, session: JSON.parse(JSON.stringify(sessionNow())) as SimSession };
    recipes.value = [r, ...recipes.value];
    writeSimRecipes(recipes.value);
    track("recipe:save");
    recipeName.value = "";
  }
  /** 外を押す・Esc で閉じる */
  const recipeBox = ref<HTMLElement | null>(null);
  function recipeOutside(e: Event): void {
    if (!recipeOpen.value) return;
    if (e instanceof KeyboardEvent ? e.key === "Escape" && !recipeRenaming.value : !recipeBox.value?.contains(e.target as Node)) { recipeOpen.value = false; recipeArm.clear(); }
  }
  onMounted(() => { document.addEventListener("pointerdown", recipeOutside, true); document.addEventListener("keydown", recipeOutside); });
  onBeforeUnmount(() => { document.removeEventListener("pointerdown", recipeOutside, true); document.removeEventListener("keydown", recipeOutside); });
  function renameRecipe(id: string, name: string): void {
    if (recipeRenaming.value !== id) return;
    recipeRenaming.value = null;
    const n = name.trim();
    if (!n) return;
    recipes.value = recipes.value.map((x) => (x.id === id ? { ...x, name: n } : x));
    writeSimRecipes(recipes.value);
  }
  /**
   * 書き出し・読み込み (URL を移す時・PC を替える時に持っていく。2026-10-07 オーナー「更新でレシピがなくならないように」)。
   * 書き出しはファイルを保存 (保存できない環境ではクリップボードへ)、読み込みは選んだファイルから今の一覧に無い物だけ足す
   */
  const recipeNote = ref("");
  const recipeFile = ref<HTMLInputElement | null>(null);
  async function exportRecipes(): Promise<void> {
    const text = recipesToFile(recipes.value);
    const name = `exiledesk-recipes-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
      recipeNote.value = `${recipes.value.length} 件を ${name} に書き出しました`;
    } catch {
      await navigator.clipboard.writeText(text).catch(() => undefined);
      recipeNote.value = "ファイルに保存できなかったのでクリップボードに写しました";
    }
  }
  async function importRecipes(ev: Event): Promise<void> {
    const f = (ev.target as HTMLInputElement).files?.[0];
    (ev.target as HTMLInputElement).value = "";
    if (!f) return;
    const r = mergeRecipesFromFile(await f.text(), recipes.value);
    if (r.added) { recipes.value = r.list; writeSimRecipes(recipes.value); }
    recipeNote.value = r.bad && !r.added && !r.skipped ? "レシピのファイルではありません" : `${r.added} 件足しました${r.skipped ? ` (同じ物 ${r.skipped} 件は飛ばした)` : ""}${r.bad ? ` · 読めない物 ${r.bad} 件` : ""}`;
  }
  /**
   * URL をコピー (レシピ全部を URL の # に乗せる。開いた人はそのレシピで始まる。recipe-share.ts)。r が無ければ今の状態
   * (2026-10-18 オーナー「ファイルじゃなくて URL から始めるようにする、シェア機能」)
   */
  async function copyRecipeUrl(r?: SimRecipe): Promise<void> {
    const name = r?.name ?? (recipeName.value.trim() || `${baseJa.value} ${fmtDate(Date.now())}`);
    const url = await recipeShareUrl({ name, baseJa: r?.baseJa ?? baseJa.value, session: r?.session ?? (JSON.parse(JSON.stringify(sessionNow())) as SimSession) });
    const ok = await navigator.clipboard.writeText(url).then(() => true, () => false);
    recipeNote.value = ok ? tr(`「${name}」の URL をコピーしました (開くとこのレシピで始まる)`, `Copied the URL for "${name}" (opening it starts this recipe)`) : tr("コピーできませんでした", "Couldn't copy");
    track("recipe:url");
  }
  function removeRecipe(id: string): void {
    if (!recipeArm.arm(`del:${id}`)) return;
    recipes.value = recipes.value.filter((x) => x.id !== id);
    writeSimRecipes(recipes.value);
  }
  /** 呼び出す: 今の状態を置き換える (2 回押し)。1 つ戻すと同じやり方で、工程の「決めた」も戻す */
  async function loadRecipe(r: SimRecipe): Promise<void> {
    if (!recipeArm.arm(`load:${r.id}`)) return;
    const ses = r.session;
    restoring.v = true;
    // ベースが変わる時は、先にベースだけ替えて、ベースの watch (ソケットを空にする等) を済ませてから残りを入れる
    // (2026-10-07 靴から手袋のレシピを呼ぶと、ソケットと 2 以降が消えていた)
    if (s.base.value !== ses.base) { s.base.value = ses.base; await nextTick(); }
    s.itemLevel.value = ses.itemLevel;
    s.simTargets.value = ses.targets;
    s.simSockets.value = ses.sockets;
    s.simStart.value = ses.start ?? "white";
    s.simStartItem.value = ses.startItem ?? null;
    s.simStartCost.value = ses.startCost ?? 0;
    s.simOrder.value = ses.order;
    // 前の作り方 (木・流れ・打って作る) のパターンは読まない (2026-10-10 / 2026-10-12 オーナー「前の打って作るは外していい」。クイズだけ)
    const plays = ses.patterns.filter((p) => p.quiz);
    s.simPatterns.value = plays.length ? plays : [{ name: "パターン 1", steps: [], quiz: { v: 3, rules: {} } }];
    s.reset();
    whiteOk.value = !!ses.flags.whiteOk; modsDone.value = !!ses.flags.modsDone; sortDone.value = !!ses.flags.modsDone; fracDone.value = !!ses.flags.fracDone;
    startDone.value = !!ses.flags.startDone; orderDone.value = !!ses.flags.orderDone;
    results.value = [];
    recipeOut.value = null;
    void nextTick(() => {
      patternDone.value = !!ses.flags.patternDone;
      loadKept();
      // このブラウザに覚えた値段が無ければ、レシピに残した値段 (呼び出した後に 3 のベース代が空で「決めた」が押せなかった。2026-10-08 完成判定 2 回目)
      const pr = ses.prices;
      if (pr) {
        if (num(whiteDivine.value) == null && pr.white != null) whiteDivine.value = pr.white;
        if (num(fourDivine.value) == null && pr.four != null) fourDivine.value = pr.four;
        if (num(boughtDivine.value) == null && pr.bought != null) boughtDivine.value = pr.bought;
        if (num(magicDivine.value) == null && pr.magic != null) magicDivine.value = pr.magic;
        if (num(rareDivine.value) == null && pr.rare != null) rareDivine.value = pr.rare;
        if (pr.item != null) itemDivine.value = pr.item;
      }
      restoring.v = false; recipeOpen.value = false;
      simJumpOpen.value++;
    });
  }
  // ベースを選ぶ前に選んだレシピを、開いたらそのまま読み込む (2 回押しの確認は要らない: まだ何も組んでいない)。
  // URL から来たレシピ (recipe-share.ts) は開いている間にも来るので、来たら保存した一覧を読み直してから
  let mounted = false;
  function takePending(): void {
    const id = s.simPendingRecipe.value;
    if (!id) return;
    s.simPendingRecipe.value = null;
    recipes.value = readSimRecipes();
    const r = recipes.value.find((x) => x.id === id);
    if (r) { recipeArm.arm(`load:${r.id}`); void loadRecipe(r); }
  }
  onMounted(() => { mounted = true; takePending(); });
  watch(() => s.simPendingRecipe.value, () => { if (mounted) takePending(); });
  return { recipes, recipeOpen, recipeName, recipeArm, recipeRenaming, baseJa, fmtDate, openRecipes, saveRecipe, recipeBox,
    recipeOutside, renameRecipe, recipeNote, recipeFile, exportRecipes, importRecipes, removeRecipe, loadRecipe, copyRecipeUrl };
}
export type SimRecipesCtx = ReturnType<typeof useSimRecipes>;
