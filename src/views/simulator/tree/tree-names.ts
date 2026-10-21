/**
 * tree-names.ts — ツリーの打つ手の名前 (2026-10-23 オーナー「表示は全部エンジンを軸にして参照させて」)。
 * 名前はクラフト台の棚と同じ nameOfKey (state/emulator/craft-stage-shelf.ts。骨の名前は部位で変わるので、ツリーのベースのアイテムを渡す)。
 * 前は price-keys.json を自前で引いていた (tree-hands.ts の nameOfKey、消した)
 */
import { computed } from "vue";
import { nameOfKey } from "../../../state/emulator/craft-stage-shelf";
import { craftStage as s } from "../../../state/craft-stage";
import { freshItem } from "../../../services/craft-stage/engine";
import { CATALYSING } from "../../../services/simulator/tree/tree-hands";
import type { Hand } from "../../../services/simulator/tree/tree-model";
import { TREE_BASE, TREE_ILVL } from "./use-tree";
import { tr } from "../../../i18n/lang";

/** 名前を引く時のアイテム (ツリーのベース。骨・エッセンスの名前が部位で変わる) */
const baseItem = computed(() => (s.data.value ? freshItem(s.data.value, TREE_BASE, TREE_ILVL, "rare") : null));

/** 値段のキー (カレンシー・お告げ・骨・エッセンス・カタリスト) → 画面の言語の名前 (クラフト台の棚と同じ) */
export const handName = (key: string): string => nameOfKey(key, baseItem.value);

/** 矢印に出す 1 行 (カレンシー + お告げ + カタリストの品質、繰り返しは「当たるまで」) */
export function handLabel(h: Hand): string {
  const parts = [handName(h.currency), ...h.omens.map(handName)];
  if (h.catalyst && h.omens.includes(CATALYSING)) parts.push(h.catalystCount ? tr(`${handName(h.catalyst)} ${h.quality}% (${h.catalystCount} 個)`, `${handName(h.catalyst)} ${h.quality}% (×${h.catalystCount})`) : `${handName(h.catalyst)} ${tr("最大まで", "to max")}`);
  const label = parts.join(" + ") + (h.free ? tr(" (狙い無し)", " (no target)") : "");
  if (!h.repeat) return label;
  return h.repeat.max ? tr(`${label} (当たるまで、${h.repeat.max} 回まで)`, `${label} (until a hit, max ${h.repeat.max})`) : tr(`${label} (当たるまで)`, `${label} (until a hit)`);
}
