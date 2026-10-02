/**
 * 画面遷移の共有状態 (2026-09-14)
 *
 * App.vue のローカル変数だった activeNav をここに移し、画面から別の画面へ飛べるようにする。
 * 例: 上位プレイヤーの MOD のスキル欄の「コラプト計算」→ ヴァールの天秤のジェムコラプトのタブ (そのジェムを選んで計算開始)。
 * CenterContent は keep-alive なので、飛び先の画面は「受け取り待ちの値」を watch して拾う。
 *
 * 2026-10-03 画面の統合 (オーナー「被ってる機能・要らん機能を整理、似た物は一緒に」):
 *   - ヴァールの天秤の 4 画面 (アドニア / ジェムコラプト / 自動ジェム監視 / 規格外) は 1 画面 `vaal-scales` のタブに
 *   - 上位プレイヤー MOD 一覧 (旧 `craft-v2`) はクラフト計算機 `htc-craft` のタブに
 *   どちらも「どのタブを開くか」をここに置き、他の画面から飛ぶ時は画面 id とタブを同時に決める。
 */
import { ref } from "vue";

/** 表示中の画面 (LeftSidebar の id) */
// 再生モードの URL (?stage-plan=…) で開いた時はクラフトステージから (POE2Tube の撮影用。2026-09-27)
export const activeNav = ref<string>(typeof location !== "undefined" && (new URLSearchParams(location.search).has("stage-plan") || new URLSearchParams(location.search).has("view")) ? "craft-stage" : "econ-currency");

// ---- ヴァールの天秤 (views/VaalScales.vue) のタブ ----
export type VaalScalesTab = "overquality" | "gem-corrupt" | "gem-watch" | "rare-craft";
export const VAAL_SCALES_TABS: readonly { id: VaalScalesTab; icon: string; label: string }[] = [
  { id: "overquality", icon: "🜛", label: "アドニアの賭け" },
  { id: "gem-corrupt", icon: "🜏", label: "ジェムコラプトの賭け" },
  { id: "gem-watch", icon: "👁", label: "自動ジェム監視" },
  { id: "rare-craft", icon: "🜲", label: "規格外の賭け" },
];
/** ヴァールの天秤で開いているタブ。画面を離れても覚えている (keep-alive と同じ扱い) */
export const vaalScalesTab = ref<VaalScalesTab>("overquality");

/** ヴァールの天秤の指定のタブへ移動する */
export function openVaalScales(tab: VaalScalesTab): void {
  vaalScalesTab.value = tab;
  activeNav.value = "vaal-scales";
}

/** ジェムコラプトの賭けで開いてほしいジェム (英語名)。画面側が受け取ったら null に戻す */
export const pendingGemCorrupt = ref<string | null>(null);

/** ジェムコラプトの賭けへ移動し、そのジェムで計算を始めさせる */
export function openGemCorrupt(nameEn: string): void {
  pendingGemCorrupt.value = nameEn;
  openVaalScales("gem-corrupt");
}

// ---- クラフト計算機 (views/htc-craft/HtcCraftLab.vue) のタブ ----
export type HtcCraftTab = "lab" | "top-mods";
/** クラフト計算機で開いているタブ。lab = 計算機そのもの / top-mods = 上位プレイヤーの MOD (旧 craft-v2) */
export const htcCraftTab = ref<HtcCraftTab>("lab");

/** 上位プレイヤーの MOD (クラフト計算機の中のタブ) へ移動する。Ctrl+2 と履歴の導線から */
export function openTopMods(): void {
  htcCraftTab.value = "top-mods";
  activeNav.value = "htc-craft";
}

/**
 * クラフト計算機で開いてほしい中身 (ベース + 狙う MOD とティア)。計算機が受け取ったら null に戻す (2026-09-29)。
 * 上位プレイヤーの MOD の「クラフトへ」から。型は services/craft-v2/to-craft.ts の CraftPlan
 */
export const pendingCraft = ref<import("../services/craft-v2/to-craft").CraftPlan | null>(null);

/** クラフト計算機 (計算機のタブ) へ移動し、その中身で作り方を組ませる */
export function openCraftLab(plan: import("../services/craft-v2/to-craft").CraftPlan): void {
  pendingCraft.value = plan;
  htcCraftTab.value = "lab";
  activeNav.value = "htc-craft";
}
