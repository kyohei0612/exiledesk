/**
 * update-check.ts — 「更新を確認」を設定画面から起動するための共有状態 (2026-09-16)
 *
 * オーナー要望: 「アプリを開いたまま更新確認したいから設定にボタンを作って、
 * 起動時と同じ場所 (右下のトースト) に更新のポップを出して」。
 * 実際のチェックとインストールは UpdateToast.vue が持っているので、
 * ここは「押されたこと」と「結果」だけを受け渡す。
 */
import { ref } from "vue";

/** 押されるたびに増える。UpdateToast が watch してチェックを走らせる */
export const updateCheckRequest = ref(0);

/** 設定画面に出す結果 (トーストとは別に、押した側にも見えるように) */
export type UpdateCheckState = "idle" | "checking" | "none" | "available" | "error";
export const updateCheckState = ref<UpdateCheckState>("idle");
export const updateCheckError = ref<string | null>(null);

/** 設定画面の「更新を確認」ボタンから呼ぶ */
export function requestUpdateCheck(): void {
  updateCheckRequest.value += 1;
}
