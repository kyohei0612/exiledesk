/**
 * use-stage-base.ts — クラフトステージでベースを選んだか・選ぶ (CraftStage.vue と設定の欄 StageSettings.vue で共通、2026-10-16 500 行の決まりで分けた)。
 * 1 つの画面で 1 回だけ作る (最初に呼んだ所の物をあとの呼び出しでも返す)
 */
import { computed, nextTick, ref, watch } from "vue";
import { craftStage as s, URL_BASE, type SimRecipe } from "../../state/craft-stage";
/** シミュレーターで狙う MOD を選ぶ間のアイテムレベル (アイテムレベルの選び方の一番上) */
export const SIM_ILVL_MAX = 86;
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { scrollToTop } from "../../utils/keep-place";
import { course } from "../../state/tutorial/craft-course";
import { topic } from "../../state/tutorial/craft-topic";
import { basePage, recipesPage, simStep } from "../../state/web-page";
import { currentRecipeId } from "../../state/simulator/sim-recipe-store";
import { simPasted } from "../../state/simulator/sim-state";
import { restoredFromSession } from "../../state/stage-session";

function create() {
  const inApp = isTauriRuntime();
  const phone = { get value(): boolean { return typeof window !== "undefined" && window.innerWidth < 768; } };
  /**
   * Web の PC は「ベース未選択」から始める: ベース選びだけ開いて、アイテム・棚・MOD 一覧は選ぶまで出さない (シミュレーターの最初と同じ)。
   * 2026-10-10 オーナー「PC はベース選びから」「最初から指輪の画面出てるから違う、ベースから下は非表示」。
   * 分析で 6 割の人が既定の金の指輪のまま触っていた。スマホは覗くだけの人が多いので今まで通りすぐ打てる形
   */
  // 初めての人はスマホでもベース選びから (人気のベースを一番上に。2026-10-11 オーナー「スマホも初手金の指輪じゃなくて、初めての人には人気のベースを選択させる」)
  const FIRST_BASE_KEY = "exiledesk.stage.basePicked";
  let firstTime = false;
  try { firstTime = !localStorage.getItem(FIRST_BASE_KEY); } catch { /* 覚えられない時は今まで通り */ }
  // ベースの読み物のページから ?base= で来た時は、選ぶ所を飛ばしてそのベースから
  const handNoBase = ref(!inApp && !URL_BASE && (!phone.value || firstTime) && s.mode.value === "hand" && !s.log.value.length);
  // 共有の URL から開いた時はベースが決まっている (ここから打つ・白から打つで、ベース選びに戻さない)
  watch(() => s.replay.value?.shared, (v) => { if (v) handNoBase.value = false; }, { immediate: true });
  // 録画モードで URL の最初の状態を入れた時もベースは決まっている (POE2Tube 要望 ㊷)
  watch(() => s.recPreset.value, (v) => { if (v) handNoBase.value = false; }, { immediate: true });
  // 記事などから戻って写しから戻した時もベースは決まっている (2026-10-22、state/stage-session.ts)
  watch(() => restoredFromSession.value, (v) => { if (v) handNoBase.value = false; }, { immediate: true });
  // クラフトのコースを始めた時もベースは決まっている (2026-10-17)
  watch(() => course.value ?? topic.value, (c) => { if (c) handNoBase.value = false; }, { immediate: true });
  const simNoBase = computed(() => s.mode.value === "sim" && !s.replay.value && !s.simPicked.value);
  /**
   * シミュレーションのベースを選んだ時は、狙い・順番・パターンを空に戻す (前のベースの手が残って変になっていた。
   * 2026-10-07 オーナー「腕のキャッシュで表示されてた、一回やり直したらシミュレーションの所はリセットだね」)
   */
  function pickSimBase(en: string): void {
    handNoBase.value = false;
    try { localStorage.setItem(FIRST_BASE_KEY, "1"); } catch { /* 無くてよい */ }
    s.base.value = en;
    s.simTargets.value = [];
    s.simOrder.value = [];
    s.simPatterns.value = [{ name: "パターン 1", steps: [], quiz: { v: 3, rules: {} } }];
    s.simStart.value = "white";
    s.simStartItem.value = null;
    simPasted.value = null;
    // レシピからでなく新しく選んだ時は、開いているレシピから外れる (保存は「新しいレシピ」になる)
    if (!s.simPendingRecipe.value) currentRecipeId.value = null;
    // シミュレーターのベースはシミュレーターで選んだ時だけ決まる (エミュレーターから切り替えたら、ベース選びから。2026-10-18 初めての 10 人の 2 人目)
    if (s.mode.value === "sim") { s.simPicked.value = true; simStep.value = "mods"; } // 工程のページは ② 狙う MOD から
    s.simGrant.value = null; // 付与スキルは 3 で選び直す
    // シミュレーターのアイテムレベルは 3 (始め方) で決める。2 で全部の段を選べるように一番上にしておく (2026-10-18 オーナー「MOD を選んだ後なら、付く下限のアイテムレベルを既定で置ける」)
    if (s.mode.value === "sim") s.itemLevel.value = SIM_ILVL_MAX;
    s.reset();
    // スマホ: 選んだ所 (下の方) から一番上の見出しまで飛ばず、ベースの欄 (次に決めるアイテムレベル・始め方) を画面の上に (2026-10-09)
    if (phone.value) void nextTick(() => scrollToTop(document.querySelector("[data-stage-settings]"), "auto"));
  }
  /** ベースを選ぶ前の右上の「レシピ」(シミュレーターの帯は StageSimPanel が出すが、ベースを選ぶ前はまだ無い) */
  const preRecipeOpen = ref(false);
  function startFromRecipe(r: SimRecipe): void {
    preRecipeOpen.value = false;
    // ベースを選ぶページから札で始めた時もページを出る (URL・題が「ベースを選ぶ」のまま残っていた。2026-10-21)
    basePage.value = false;
    recipesPage.value = false;
    s.simPendingRecipe.value = r.id;
    pickSimBase(r.session.base);
  }

  return { handNoBase, simNoBase, pickSimBase, preRecipeOpen, startFromRecipe };
}
let one: ReturnType<typeof create> | null = null;
export function useStageBase(): ReturnType<typeof create> {
  one ??= create();
  return one;
}
