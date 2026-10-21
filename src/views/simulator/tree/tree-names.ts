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
import type { Hand, TreeBox } from "../../../services/simulator/tree/tree-model";
import { TREE_BASE, TREE_ILVL } from "./use-tree";
import { tr } from "../../../i18n/lang";

/** 名前を引く時のアイテム (ツリーのベース。骨・エッセンスの名前が部位で変わる) */
const baseItem = computed(() => (s.data.value ? freshItem(s.data.value, TREE_BASE, TREE_ILVL, "rare") : null));

/**
 * 結果ごとの名前・色・印 (10-22 見た目の作り直し、research/notes/2026-10-22-tree-ui-references.md の 2: ネオンの縁 + 印 + 題 + 副題)。
 * 色は線の色 (SimTreePage の LINE) と同じ系統: 進む = 金 / 外れ・消えた = 赤・紫・灰 / 始まり = 水色。箱 (TreeBox) とまとめた札 (TreeMergeLayer) で同じ
 */
export const OUT_LOOK: Record<TreeBox["out"], { ja: string; en: string; c: string; icon: string }> = {
  start: { ja: "始まり", en: "Start", c: "95,180,224", icon: "sparkles" },
  hit: { ja: "当たり", en: "Hit", c: "224,176,96", icon: "target" },
  junk: { ja: "外れ", en: "Miss", c: "224,112,122", icon: "x" },
  junkGone: { ja: "外れが消えた", en: "Miss removed", c: "154,167,184", icon: "check" },
  lost: { ja: "狙いが消えた", en: "Target lost", c: "165,139,224", icon: "rotate" },
  any: { ja: "打った後", en: "After", c: "200,184,150", icon: "plus" },
};

/** 箱の種類の名前 (始まり・当たり・外れ…。一覧・戻り先の札・まとめた札で同じ) */
export const outName = (out: TreeBox["out"]): string => tr(OUT_LOOK[out].ja, OUT_LOOK[out].en);

/** 値段のキー (カレンシー・お告げ・骨・エッセンス・カタリスト) → 画面の言語の名前 (クラフト台の棚と同じ) */
export const handName = (key: string): string => nameOfKey(key, baseItem.value);

/** 矢印に出す 1 行 (触媒の時は先にカタリスト → カレンシー + お告げ、繰り返しは「当たるまで」。10-22 オーナー「カタリストを打つルートが無い」で先に出す) */
export function handLabel(h: Hand): string {
  const cat = h.catalyst && h.omens.includes(CATALYSING)
    ? `${h.catalystCount ? tr(`${handName(h.catalyst)} ${h.quality}% (${h.catalystCount} 個)`, `${handName(h.catalyst)} ${h.quality}% (×${h.catalystCount})`) : `${handName(h.catalyst)} ${tr("最大まで", "to max")}`} → `
    : "";
  const label = cat + [handName(h.currency), ...h.omens.map(handName)].join(" + ") + (h.free ? tr(" (狙い無し)", " (no target)") : "");
  if (!h.repeat) return label;
  return h.repeat.max ? tr(`${label} (当たるまで、${h.repeat.max} 回まで)`, `${label} (until a hit, max ${h.repeat.max})`) : tr(`${label} (当たるまで)`, `${label} (until a hit)`);
}
