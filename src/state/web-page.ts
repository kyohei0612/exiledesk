/**
 * web-page.ts (state) — Web 版の「別のページ」の印 (2026-10-18 オーナー: ベース選び・要望・バグを送る・スパムシミュレーターもページに)。
 * URL と題・履歴は src/web/page.ts。ここは画面 (CraftStage.vue・WebApp.vue) と page.ts が一緒に見る印だけ。アプリ版はページにしない (今まで通り)
 */
import { ref } from "vue";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { craftStage as s } from "./craft-stage";

/** ページを移る作り (Web 版だけ) */
export const PAGES_ON = !isTauriRuntime();
/** 「ベースを変える」で開いたベース選びのページ */
export const basePage = ref(false);
/** まだベースを選んでいない (初めて・白に戻した後)。この間もベース選びのページ。CraftStage.vue が合わせる */
export const baseUnpicked = ref(false);
/** 要望・バグを送るのページ */
export const feedbackPage = ref(false);
/**
 * スパムシミュレーターのページ (?page=routes)。カレンシーの見出しの「スパムシミュレーター」で開く → MOD を 1 つ選ぶ → 増強・カオス・高貴のスパムを比べる
 * (2026-10-18 オーナー「1 MOD を対象にどのルートが一番早く着くか」「スパム計算機はここで全部管理」)
 */
export const routesOpen = ref(false);
/** 計算が済んだら運試しの欄を開く (X のシェアから来た時。state/spam-share-open.ts) */
export const routesLuck = ref(false);
/** 嵌めて打つルーンの id (null = エミュレーターのアイテムに嵌めている物。StageRouteRunes.vue) */
export const routesRunes = ref<string[] | null>(null);
/** その狙い (選ぶまでは null) */
export const routesTarget = ref<{ modId: string; minTierIndex: number } | null>(null);
/** スパムシミュレーターのページを開く (カレンシーの見出しのボタン)。最初は「狙う MOD を選ぶ」の画面 (すぐ窓は出さない。2026-10-19 オーナー「こっちのがかわいい」) */
export function openRoutes(): void {
  s.hold(null);
  routesTarget.value = null;
  routesOpen.value = true;
}
