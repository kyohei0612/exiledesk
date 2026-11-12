/**
 * to-daily.ts — エミュの設定の欄の「デイリーに投稿 →」(D-10・M-06b、スイッチ emuToDaily)。
 * エミュの品はデイリーの投稿のページがエミュと同じ 1 つの品 (craftStage) を直に読むので、渡すのは「今の品で確かめの画面へ」の合図だけ。
 * エミュの画面はデイリーの画面のコード (views/daily) を読まない。合図を受けるのは DailyPost.vue
 */
import { nextTick, ref } from "vue";
import { dailyPage } from "../web-page";
import { openDailyPage } from "../../web/page";

/** 投稿のページが開いた時に、今のエミュの品で確かめの画面 (D-13) へ進む合図。受けた側が下ろす */
export const emuPostAsk = ref(false);

/** 投稿のページを開き、今の品で確かめの画面へ。移った先は頭から出す (D-15b)。ブラウザの戻るでエミュへ戻る */
export function openDailyPost(): void {
  emuPostAsk.value = true;
  openDailyPage({ view: "detail", q: "post" });
  const d = dailyPage.value;
  if (d?.view !== "detail" || d.q !== "post") { emuPostAsk.value = false; return; } // 移らなかった時は合図を残さない
  void nextTick(() => window.scrollTo(0, 0));
}
