/**
 * tree-hand-block.ts — 「この品にこの手は打てない」の 1 本の判定 (S-190d・S-60f、11-17)。
 * 手の窓・棚の灰色と同じ断りを、兄弟枠の写し・自動の ↩ の候補と幹 (playsAt)・整理 (dropUnplayable)・まとめ・組み直しでも使う。
 * 見る順: 棚の灰色 (錯乱のエッセンス・フラクチャー無しの木・木のフラクチャーは 1 回・予見で見た手・変えられる耐性 MOD が無い) →
 * 前に足すカタリストが入らない → 触媒のお告げで品質が無い → 手そのもの (handProblem = お告げ 1 枚ずつ・発現の手・エンジンの断り) → 確定フラクチャーで固定する ✦ の MOD が無い (sureFracWhy)。
 * 品を受け取るだけで判定 (tree-judge) を読まない (tree-judge からも呼ぶので)。箱の見本で見るのは tree-copy-block の handBlockAt
 */
import { ESSENCE_KEYS, useReason, type PatchData, type StageItem } from "../../craft-stage/engine";
import { catalystFull } from "../sim-engine";
import { fluxBlock } from "./tree-flux";
import { foreseeBlock } from "./tree-foresee";
import { CATALYSING } from "./tree-hands";
import { fracOnceBlock, handProblem } from "./tree-sample";
import { sureFracWhy, sureFracWhyText } from "./tree-sure-frac";
import type { Hand, TreeDoc } from "./tree-model";
import { tr } from "../../../i18n/lang";

/** 錯乱のエッセンス (付くノータブルがランダム) はシミュでは選べない (10-27 オーナー) */
const deliriumBlock = (k: string): string | null => (ESSENCE_KEYS[k]?.en === "Essence of Delirium" ? tr("シミュでは使えない", "Not usable in the simulator") : null);
/** フラクチャー無しで始めた木 (印 noFracOrb、デイリー) ではフラクチャーのオーブを打たせない (S-13b) */
const noFracBlock = (doc: TreeDoc, k: string): string | null => (k === "fracture" && doc.start?.noFracOrb ? tr("フラクチャー無しで始めたツリーでは使えない", "Not usable in a tree started without a fracture") : null);

/**
 * 棚の灰色の訳 (手の棚 TreeHandShelf と同じ)。id = 手を置く (打つ) 箱、named = その箱で名前の付く狙い (フラックスの見方)。打てるなら null
 */
export function shelfBlock(data: PatchData | null | undefined, doc: TreeDoc, id: string, item: StageItem | null | undefined, key: string, named?: ReadonlySet<string> | null): string | null {
  return deliriumBlock(key) ?? noFracBlock(doc, key) ?? (item ? fracOnceBlock(item, key) : null) ?? foreseeBlock(doc, id, key) ?? (data && item ? fluxBlock(data, doc, item, key, named) : null);
}

/** この品 (箱 id で打つ) にこの手 (と前に足すカタリスト pre) を打てない訳。打てるなら null */
export function handBlockOn(data: PatchData, doc: TreeDoc, id: string, item: StageItem, h: Hand, pre: string | null = null, named?: ReadonlySet<string> | null): string | null {
  const shelf = shelfBlock(data, doc, id, item, h.currency, named);
  if (shelf) return shelf;
  if (pre && useReason(data, item, pre, []) && !catalystFull(item, pre)) return tr("前に足すカタリストが入らない", "The catalyst before this can't be used");
  if (!pre && h.omens.includes(CATALYSING) && !(item.quality > 0)) return tr("品質が要る", "Needs quality");
  const why = handProblem(data, item, h);
  if (why) return why;
  const sf = sureFracWhy(data, doc, item, h);
  return sf ? sureFracWhyText(sf) : null;
}
