/**
 * シミュレーターの入口 ① 完成品を作る (2026-10-22 オーナー「エミュのエンジンをフル稼働で、カレンシーで付けずに MOD を選んでもらう」)。
 * 開いている間はクラフト台の棚の代わりに MOD 一覧と完成品の欄 (SimBuildPanel.vue) を出す。アイテム・エンジンはクラフト台のまま
 */
import { ref } from "vue";

export const simBuild = ref(false);
