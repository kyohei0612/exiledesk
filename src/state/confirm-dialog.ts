/**
 * confirm-dialog.ts — アプリの中で描く「よろしいですか?」(2026-09-21)
 *
 * オーナー指摘:「確認ダイアログが 2 種類ある」。監視の入れ替えはアプリの中の黒いダイアログ、
 * ゲームログの消し込み・ログイン削除・監視リストの入れ替え警告は Windows の素のダイアログで、
 * 後者は見た目が浮いていた。window.confirm の代わりにこれを使う。
 *
 *   if (!(await askConfirm("ログを空にします。よろしいですか?", { danger: true }))) return;
 *
 * 呼ぶ側は await するだけ。画面 (ConfirmDialog.vue) は App.vue に 1 つ置いてある。
 */
import { computed, ref } from "vue";

export interface ConfirmOptions {
  /** 見出し (既定は「確認」) */
  title?: string;
  /** 実行ボタンの文言 (既定は「はい」) */
  okLabel?: string;
  /** やめるボタンの文言 (既定は「キャンセル」) */
  cancelLabel?: string;
  /** 取り消せない操作は赤くする */
  danger?: boolean;
}

interface Pending extends ConfirmOptions {
  message: string;
  resolve: (ok: boolean) => void;
}

const pending = ref<Pending | null>(null);

export const confirmDialog = {
  pending: computed(() => pending.value),
};

/** 聞く。はい = true / キャンセル・背景クリック = false */
export function askConfirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  // 既に聞いている時は、前の問いをキャンセル扱いで閉じてから (ダイアログは 1 つだけ)
  pending.value?.resolve(false);
  return new Promise<boolean>((resolve) => {
    pending.value = { ...opts, message, resolve };
  });
}

/** 画面から押された時 (ConfirmDialog.vue が呼ぶ) */
export function answerConfirm(ok: boolean): void {
  const p = pending.value;
  pending.value = null;
  p?.resolve(ok);
}
