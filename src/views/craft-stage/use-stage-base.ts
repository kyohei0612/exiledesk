/**
 * use-stage-base.ts — クラフトステージでベースを選んだか・選ぶ (CraftStage.vue と設定の欄 StageSettings.vue で共通、2026-10-16 500 行の決まりで分けた)。
 * 1 つの画面で 1 回だけ作る (最初に呼んだ所の物をあとの呼び出しでも返す)
 */
import { nextTick, ref, watch } from "vue";
import { craftStage as s, URL_BASE } from "../../state/craft-stage";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { scrollToTop } from "../../utils/keep-place";
import { course, topic } from "../tutorial/course-entry";
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
  /** ベースを選ぶ (クラフト台。旧シミュレーターの狙い・順番などを空に戻す所は 10-23 に消した、ツリー特化) */
  function pickSimBase(en: string): void {
    handNoBase.value = false;
    try { localStorage.setItem(FIRST_BASE_KEY, "1"); } catch { /* 無くてよい */ }
    s.base.value = en;
    s.reset();
    // スマホ: 選んだ所 (下の方) から一番上の見出しまで飛ばず、ベースの欄 (次に決めるアイテムレベル・始め方) を画面の上に (2026-10-09)
    if (phone.value) void nextTick(() => scrollToTop(document.querySelector("[data-stage-settings]"), "auto"));
  }
  return { handNoBase, pickSimBase };
}
let one: ReturnType<typeof create> | null = null;
export function useStageBase(): ReturnType<typeof create> {
  one ??= create();
  return one;
}
