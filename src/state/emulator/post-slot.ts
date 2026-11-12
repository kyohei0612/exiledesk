/**
 * post-slot.ts — デイリーの投稿の中のエミュ (D-12、?page=daily&q=post-emu) は、エミュのタブとは別の品で動かす (D-12b・M-06c、スイッチ dailyPostOwnItem)。
 * 品の置き場 (craft-stage.ts の play) を、投稿の中のエミュを開いている間だけ「投稿用」(post) に切り替える。切り替えるのはここだけ。
 * エミュのタブの品・工程・戻すの控えは emu の置き場に残ったまま触らない。投稿用の手は emu_use・履歴・戻って来た時の写しに入らない。
 * オーナー 11-12「エミュで作り直すボタンはデイリー内でだからエミュのタブとは別個で1からベース選ぶところから始めさせないと辻褄が合わないね」
 */
import { computed, ref, shallowRef, watch } from "vue";
import { craftStage as s } from "../craft-stage";
import { dailyPage } from "../web-page";
import { flag } from "../../web/release-flags";
import type { Force, StageItem } from "../../services/craft-stage/engine";

export const POST_OWN = flag("dailyPostOwnItem");
/** 投稿用の置き場はまだベースを選んでいない (選ぶ画面から入った時はベース選びから。use-stage-base.ts が読む) */
export const postNoBase = ref(true);
/** 投稿の中で作っている品 (ベースを選ぶ・載せるまでは null)。投稿のページはエミュのタブにいる間もこれを読む */
export const postItem = shallowRef<StageItem | null>(null);

const inPostEmu = computed(() => POST_OWN && dailyPage.value?.view === "detail" && dailyPage.value.q === "post-emu");
/** エミュの置き場の最初の用意 (init の白の品・写しの戻し) が済むまでは切り替えない (済む前に切り替えると、その用意が投稿用に入る) */
const emuReady = computed(() => s.play.value !== "emu" || !!s.item.value);
// 切り替えは次の描きの前 (sync にしない = init・写しの戻しの途中で切り替わらない)。タブ移り・戻る / 進む・読み直しのどれで出入りしても、ページの URL だけで決まる
watch(() => inPostEmu.value && emuReady.value, (on) => {
  if (on && s.play.value === "emu") {
    s.hold(null);
    s.play.value = "post";
    if (!s.item.value) s.reset(); // 初めて入った時の白の品 (ベース選びの後ろに置く物)
  } else if (!on && s.play.value === "post") {
    s.hold(null);
    s.play.value = "emu";
  }
}, { immediate: true });
watch(() => [s.play.value, s.item.value, postNoBase.value] as const, ([p, it, nb]) => { if (p === "post") postItem.value = nb ? null : it; }, { flush: "sync" });

/**
 * 確かめの画面の品を投稿用の置き場に載せる (工程なし・始めの MOD として。段は同じ、値はその段の中で振り直す)。
 * 載せられない組ならエンジンの訳を返し、投稿用の品は変えない。エミュのタブの品は触らない
 */
export function loadPostItem(base: string, ilvl: number, mods: Force[]): string | null {
  const was = s.play.value;
  if (was === "lesson") return "lesson";
  s.play.value = "post";
  try {
    const why = s.startWith(base, ilvl, mods);
    if (!why) postNoBase.value = false;
    return why;
  } finally {
    s.play.value = was;
  }
}
/** 投稿用の品を空に戻す (投稿が送れた後。次はベース選びから) */
export function clearPostItem(): void {
  postNoBase.value = true;
  postItem.value = null;
}
