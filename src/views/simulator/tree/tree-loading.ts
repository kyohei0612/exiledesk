/**
 * tree-loading.ts — 木を開いて組み直している間の印 (S-196、覆いは TreeLoadingCover.vue)。頁の外枠 (WebApp) からも読むので軽く置く (木の組み直しの作りを読み込まない)。
 * (スイッチ sharedOpenCover、S-196f2) 共有 URL (#recipe=) でサイトを開いた時は、頁を読み始めた時から印を立てる (前はエミュの頁と木の頁へ移るまでの間が触れた。
 * 11-19 オーナー「スマホでレシピ開くと横で、読み込み中も一部さわれちゃうでしょ、画面バグって。読み込み中で統一してええよ。」)。外すのは木を組む方 (use-tree-open) と読めない時 (recipe-share)
 */
import { ref } from "vue";
import { flag } from "../../../web/release-flags";

/** 共有 URL で開いた時に最初から覆うか */
export const coverFromBoot = (): boolean => flag("sharedOpenWait") && flag("sharedOpenCover");
const atBoot = coverFromBoot() && typeof location !== "undefined" && location.hash.startsWith("#recipe=");

/** 開いている間 (木は触れない。読み込み中の覆いを出す) */
export const treeLoading = ref(atBoot);
/** 置いてある覆いの番号 (古い順)。頁の外枠と木の頁の両方に置いた時は先の 1 つだけ描く */
const covers = ref<number[]>([]);
let coverNo = 0;
export function claimCover(): { first: () => boolean; drop: () => void } {
  const no = ++coverNo;
  covers.value = [...covers.value, no];
  return { first: () => covers.value[0] === no, drop: () => { covers.value = covers.value.filter((x) => x !== no); } };
}
// 読みが止まった時に画面ごと触れなくしない: 頁を開いた時から覆って 60 秒たっても外れなければ外す
if (atBoot) setTimeout(() => { treeLoading.value = false; }, 60_000);
