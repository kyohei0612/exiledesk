/**
 * シミュレーターの入口 (2026-10-22 オーナー、設計 docs/org/simulator/notes/2026-10-22-entry-design.md)。
 * ① 完成品を作る: 開いている間はクラフト台の棚の代わりに MOD 一覧と完成品の欄 (SimBuildPanel.vue) を出す。アイテム・エンジンはクラフト台のまま。
 * ② 始め方を決める: ① の完成品から、フラクチャーの MOD ごとのパターン (タブ「<MOD> スタート」) に、始めのアイテムの MOD と何でもよい MOD の数を持つ
 */
import { ref } from "vue";

export const simBuild = ref(false);
/** 今の段 (① 完成品 / ② 始め方) */
export const buildStage = ref<"build" | "start">("build");

/** 付いている MOD 1 つ (クラフト台の addStartMod で組み直せる形。tier = T の数、1 が一番良い) */
export interface BuildMod { modId: string; tierName: string; tier: number; side: "prefix" | "suffix"; textJa: string; textEn: string; fractured?: true; desecrated?: true }
/** ① で作った完成品 (② へ進んだ時に写す。← で戻る時はこれで組み直す) */
export const finished = ref<BuildMod[]>([]);
/** ② のパターン 1 つ: 始めのアイテムの MOD (✦ を 1 つ含む) と何でもよい MOD の数 */
export interface StartPattern { mods: BuildMod[]; random: number }
export const patterns = ref<StartPattern[]>([]);
export const activePattern = ref(0);
