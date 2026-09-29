/**
 * 画面遷移の共有状態 (2026-09-14)
 *
 * App.vue のローカル変数だった activeNav をここに移し、画面から別の画面へ飛べるようにする。
 * 例: 上位プレイヤーMOD一覧のスキル欄の「コラプト計算」→ ジェムコラプトの賭け (そのジェムを選んで計算開始)。
 * CenterContent は keep-alive なので、飛び先の画面は「受け取り待ちの値」を watch して拾う。
 */
import { ref } from "vue";

/** 表示中の画面 (LeftSidebar の id) */
// 再生モードの URL (?stage-plan=…) で開いた時はクラフトステージから (POE2Tube の撮影用。2026-09-27)
export const activeNav = ref<string>(typeof location !== "undefined" && (new URLSearchParams(location.search).has("stage-plan") || new URLSearchParams(location.search).has("view")) ? "craft-stage" : "econ-currency");

/** ジェムコラプトの賭けで開いてほしいジェム (英語名)。画面側が受け取ったら null に戻す */
export const pendingGemCorrupt = ref<string | null>(null);

/** ジェムコラプトの賭けへ移動し、そのジェムで計算を始めさせる */
export function openGemCorrupt(nameEn: string): void {
  pendingGemCorrupt.value = nameEn;
  activeNav.value = "gem-corrupt";
}

/**
 * クラフト計算機で開いてほしい中身 (ベース + 狙う MOD と段)。計算機が受け取ったら null に戻す (2026-09-29)。
 * 上位プレイヤー MOD 一覧の「クラフトへ」から。型は services/craft-v2/to-craft.ts の CraftPlan
 */
export const pendingCraft = ref<import("../services/craft-v2/to-craft").CraftPlan | null>(null);

/** クラフト計算機へ移動し、その中身で作り方を組ませる */
export function openCraftLab(plan: import("../services/craft-v2/to-craft").CraftPlan): void {
  pendingCraft.value = plan;
  activeNav.value = "htc-craft";
}
