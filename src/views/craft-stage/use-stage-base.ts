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
import { flag } from "../../web/release-flags";

function create() {
  const inApp = isTauriRuntime();
  const phone = { get value(): boolean { return typeof window !== "undefined" && window.innerWidth < 768; } };
  /**
   * 人が自分で選んだベース (ベースのページで押した物・「金の指輪ですぐ試す」)。空 = まだ選んでいない。
   * この 1 つの印で ① ベースのページの選んだ見た目 ② 上の帯とすぐ試す ③ / やエミュのタブで入った時にクラフトの画面かベースのページか、を全部決める
   * (2026-10-23 オーナー「開発版で絶対金の指輪で始まる」「直ってなくね」: 既定の金の指輪を持っているだけで選んだ扱いになり、帯が消えてクラフトの画面から始まっていた)
   */
  const CHOSEN_KEY = "exiledesk.stage.chosenBase";
  let chosen0 = "";
  try { chosen0 = localStorage.getItem(CHOSEN_KEY) ?? ""; } catch { /* 覚えられない時は選んでいない扱い */ }
  const chosenBase = ref(chosen0);
  // 本番は OK まで前の形 (release-flags の baseChosen): 印は「一度でもベースを選んだか」(FIRST_BASE_KEY) だけ、写しから戻したらいつもクラフトの画面へ
  const CHOSEN_ON = flag("baseChosen");
  const FIRST_BASE_KEY = "exiledesk.stage.basePicked";
  let pickedOnce = false;
  try { pickedOnce = !!localStorage.getItem(FIRST_BASE_KEY); } catch { /* 覚えられない時は選んでいない扱い */ }
  const picked = CHOSEN_ON ? !!chosenBase.value : pickedOnce;
  /**
   * Web の PC は「ベース未選択」から始める: ベース選びだけ開いて、アイテム・棚・MOD 一覧は選ぶまで出さない (シミュレーターの最初と同じ)。
   * 2026-10-10 オーナー「PC はベース選びから」「最初から指輪の画面出てるから違う、ベースから下は非表示」。
   * スマホは選んだ事のある人だけ今まで通りすぐ打てる形、選んでいない人はベース選びから (2026-10-11 オーナー「初めての人には人気のベースを選択させる」)。
   * ベースの読み物のページから ?base= で来た時は、選ぶ所を飛ばしてそのベースから
   */
  // スイッチ emuFresh (10-25 オーナー「エミュもリロードしたら基本最初から」): スマホの選んだ事のある人もベース選びから (ベースは覚えていないので、前は既定の金の指輪のクラフトの画面になっていた)
  const handNoBase = ref(!inApp && !URL_BASE && (!phone.value || !picked || flag("emuFresh")) && s.mode.value === "hand" && !s.log.value.length);
  // 共有の URL から開いた時はベースが決まっている (ここから打つ・白から打つで、ベース選びに戻さない)
  watch(() => s.replay.value?.shared, (v) => { if (v) handNoBase.value = false; }, { immediate: true });
  // 録画モードで URL の最初の状態を入れた時もベースは決まっている (POE2Tube 要望 ㊷)
  watch(() => s.recPreset.value, (v) => { if (v) handNoBase.value = false; }, { immediate: true });
  // 記事などから戻って写しから戻した時: 戻したベースが人の選んだ物の時だけクラフトの画面へ (既定の金の指輪の写しならベース選びのまま、2026-10-23)
  watch(() => restoredFromSession.value, (v) => { if (v && (!CHOSEN_ON || chosenBase.value === s.base.value)) handNoBase.value = false; }, { immediate: true });
  // クラフトのコースを始めた時もベースは決まっている (2026-10-17)
  watch(() => course.value ?? topic.value, (c) => { if (c) handNoBase.value = false; }, { immediate: true });
  /** 人が選んだ印だけ付ける (今のベースを押し直した時はアイテムはそのまま) */
  function markChosen(en: string): void {
    chosenBase.value = en;
    try { localStorage.setItem(CHOSEN_KEY, en); localStorage.setItem(FIRST_BASE_KEY, "1"); } catch { /* 無くてよい */ }
  }
  /** ベースを選ぶ (クラフト台。旧シミュレーターの狙い・順番などを空に戻す所は 10-23 に消した、ツリー特化) */
  function pickSimBase(en: string): void {
    handNoBase.value = false;
    markChosen(en);
    s.base.value = en;
    s.reset();
    // スマホ: 選んだ所 (下の方) から一番上の見出しまで飛ばず、ベースの欄 (次に決めるアイテムレベル・始め方) を画面の上に (2026-10-09)
    if (phone.value) void nextTick(() => scrollToTop(document.querySelector("[data-stage-settings]"), "auto"));
  }
  return { handNoBase, chosenBase, markChosen, pickSimBase };
}
let one: ReturnType<typeof create> | null = null;
export function useStageBase(): ReturnType<typeof create> {
  one ??= create();
  return one;
}
