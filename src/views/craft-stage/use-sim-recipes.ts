/**
 * use-sim-recipes.ts — シミュレーションの画面 (StageSimPanel.vue) とレシピの受け渡し。
 * レシピの一覧・保存・上書き・共有は state/sim-recipe-store.ts とレシピのページ (StageRecipesPage.vue)・右上の SimRecipeBar.vue
 * (2026-10-21 オーナー「レシピ消したり上書きしたり色々できるように、シェアもない」で作り直した。前は右上の吹き出しに全部)。
 * ここは「呼び出す (今の状態を置き換える)」と、今の状態をストアに見せる (simNow) だけ
 */
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from "vue";
import { craftStage, readSimRecipes, type SimRecipe, type SimSession } from "../../state/craft-stage";
import { currentRecipeId, reloadRecipes, simNow } from "../../state/sim-recipe-store";
import type { SimTargetsCtx } from "./use-sim-targets";
import type { SimRunCtx } from "./use-sim-run";
import { simJumpOpen } from "../../state/web-page";

export function useSimRecipes(d: SimTargetsCtx & SimRunCtx) {
  const { boughtDivine, fourDivine, rareDivine, fracDone, itemDivine, loadKept, magicDivine, modsDone, sortDone, num, orderDone, patternDone, recipeOut,
    restoring, results, sessionNow, startDone, whiteDivine, whiteOk } = d;
  const s = craftStage;
  const baseJa = computed(() => s.item.value?.baseJa ?? s.base.value);
  const fmtDate = (t: number): string => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  // 今の状態をストアに見せる (レシピのページの「今の状態で上書き」・右上の保存)
  const now = { session: () => JSON.parse(JSON.stringify(sessionNow())) as SimSession, baseJa: () => baseJa.value };
  onMounted(() => { simNow.value = now; });
  onBeforeUnmount(() => { if (simNow.value === now) simNow.value = null; });

  /** 呼び出す: 今の状態を置き換える。1 つ戻すと同じやり方で、工程の「決めた」も戻す。確かめ (保存していない変更) は呼ぶ側で */
  async function loadRecipe(r: SimRecipe): Promise<void> {
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
    currentRecipeId.value = r.id;
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
      restoring.v = false;
      simJumpOpen.value++;
    });
  }
  // ベースを選ぶページ・レシピのページ・URL から選んだレシピを、開いたらそのまま読み込む。
  // URL から来たレシピ (recipe-share.ts) は開いている間にも来るので、来たら保存した一覧を読み直してから
  let mounted = false;
  function takePending(): void {
    const id = s.simPendingRecipe.value;
    if (!id) return;
    s.simPendingRecipe.value = null;
    reloadRecipes();
    const r = readSimRecipes().find((x) => x.id === id);
    // ベースを替えた直後は「ベースが変わったらソケットを空に」の見張りがまだ動いていない。先に読むと入れたソケットが消えて ② に進めなかった
    // (2026-10-19 モンキーテスト: 画面を開いたまま URL からソケット 0 のレシピを開くと「ソケットの数を選ぶ」で止まった)。見張りが済んでから読む
    if (r) void nextTick(() => { void loadRecipe(r); });
  }
  onMounted(() => { mounted = true; takePending(); });
  watch(() => s.simPendingRecipe.value, () => { if (mounted) takePending(); });
  return { baseJa, fmtDate, loadRecipe };
}
export type SimRecipesCtx = ReturnType<typeof useSimRecipes>;
