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
/** シミュレーターのレシピのページ (?page=recipes。2026-10-21 オーナー「レシピ周りしっかり作りこんでくれ」、StageRecipesPage.vue) */
export const recipesPage = ref(false);
/** クラフトの道 (ツリー) のページ (?page=sim-tree。2026-10-22 オーナー OK、中身は views/simulator/tree/SimTreePage.vue) */
export const treePage = ref(false);
/** ツリーのページは開発版と手元の dev だけ (本番はオーナーの OK の後) */
export const TREE_ON = import.meta.env.DEV || import.meta.env.VITE_DEV_PREVIEW === "1";
/** ブログ (/blog/、ヘッダーのブログ・右の列の新しい記事) は本番でも出す (2026-10-22、ツリーとは切り離した。ページは build:web の build-blog-pages.mjs が作る) */
export const BLOG_ON = true;
/**
 * スパムシミュレーターのページ (?page=routes)。カレンシーの見出しの「スパムシミュレーター」で開く → MOD を 1 つ選ぶ → 増強・カオス・高貴のスパムを比べる
 * (2026-10-18 オーナー「1 MOD を対象にどのルートが一番早く着くか」「スパム計算機はここで全部管理」)
 */
export const routesOpen = ref(false);
/** 計算が済んだら運試しの欄を開く (X のシェアから来た時。state/spam-share-open.ts) */
export const routesLuck = ref(false);
/** 嵌めて打つルーンの id (null = エミュレーターのアイテムに嵌めている物。StageRouteRunes.vue) */
export const routesRunes = ref<string[] | null>(null);
/** シェアから来た時の計算済みの結果 (StageRoutesPage が計算の代わりに出す。route-race.ts の SharedRace) */
export const routesShared = ref<import("../services/craft-stage/route-race").SharedRace | null>(null);
/** その狙い (選ぶまでは null) */
export const routesTarget = ref<{ modId: string; minTierIndex: number } | null>(null);
/** スパムシミュレーターのページを開く (カレンシーの見出しのボタン)。最初は「狙う MOD を選ぶ」の画面 (すぐ窓は出さない。2026-10-19 オーナー「こっちのがかわいい」) */
export function openRoutes(): void {
  s.hold(null);
  routesTarget.value = null;
  routesOpen.value = true;
}
/**
 * シミュレーターの工程のページ (2026-10-19 オーナー「各工程ページ別にしたい、欲しい情報だけ簡易的に」「初心者でもわかりやすく」)。
 * ① ベースは ?page=base。② 狙う MOD → ③ 始め方 → ④ 付ける順番 → ⑤ 打ち方 → ⑥ 回す・結果 を ?page=sim-<工程> で 1 ページずつ ([[sim-step-pages]])
 */
export const SIM_STEPS = ["mods", "start", "order", "play", "result"] as const;
export type SimStep = (typeof SIM_STEPS)[number];
export const simStep = ref<SimStep>("mods");
/** レシピを呼び出した時に増やす: まだ決めていない一番先の工程のページへ (use-sim-steps の toFirstOpen) */
export const simJumpOpen = ref(0);
