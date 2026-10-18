/**
 * web-page.ts (state) — Web 版の「別のページ」の印 (2026-10-18 オーナー: ベース選び・カオススパム計算機・要望・バグを送るもページに)。
 * URL と題・履歴は src/web/page.ts。ここは画面 (CraftStage.vue・WebApp.vue) と page.ts が一緒に見る印だけ。アプリ版はページにしない (今まで通り)
 */
import { computed, ref } from "vue";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { craftStage as s } from "./craft-stage";
import { inLesson } from "./craft-lesson";
import { spamKey, spamming } from "./chaos-spam";

/** ページを移る作り (Web 版だけ) */
export const PAGES_ON = !isTauriRuntime();
/** 「ベースを変える」で開いたベース選びのページ */
export const basePage = ref(false);
/** まだベースを選んでいない (初めて・白に戻した後)。この間もベース選びのページ。CraftStage.vue が合わせる */
export const baseUnpicked = ref(false);
/** 要望・バグを送るのページ */
export const feedbackPage = ref(false);
/**
 * カオススパム計算機のページ (?page=spam)。右の列 (チャンネル) も外して、アイテムと計算機だけ・両脇に縦長の枠
 * (2026-10-18 オーナー「固定バーあるし 1 ページとして扱わないんじゃないの」→「本当に別のページにする」)
 */
export const spamPage = computed(() => PAGES_ON && !s.replay.value && !inLesson.value && (!!spamKey.value || spamming.value));
