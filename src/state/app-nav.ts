/**
 * 画面遷移の共有状態 (2026-09-14)
 *
 * App.vue のローカル変数だった activeNav をここに移し、画面から別の画面へ飛べるようにする。
 * 例: 上位プレイヤーMOD一覧のスキル欄の「コラプト計算」→ ジェムコラプトの賭け (そのジェムを選んで計算開始)。
 * CenterContent は keep-alive なので、飛び先の画面は「受け取り待ちの値」を watch して拾う。
 */
import { ref } from "vue";

/** 表示中の画面 (LeftSidebar の id) */
export const activeNav = ref<string>("econ-currency");

/** ジェムコラプトの賭けで開いてほしいジェム (英語名)。画面側が受け取ったら null に戻す */
export const pendingGemCorrupt = ref<string | null>(null);

/** ジェムコラプトの賭けへ移動し、そのジェムで計算を始めさせる */
export function openGemCorrupt(nameEn: string): void {
  pendingGemCorrupt.value = nameEn;
  activeNav.value = "gem-corrupt";
}
