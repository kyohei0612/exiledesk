/**
 * tree-copy-block.ts — 箱の見本で見る「この箱でこの手は打てない」(S-190d、11-17)。中身は tree-hand-block の handBlockOn (手の窓・棚と同じ 1 本)。
 * 兄弟枠で手を写す前 (tree-junk-same の ① 手を置いた時・③ 後からの写し) と棚の灰色が使う。
 * 見本はその箱の代表の品 (sampleOf = 配置の代表、箱の印 cantHandOf と同じ品)。見本が作れない箱は打てない扱い (写さない)
 */
import type { PatchData, StageItem } from "../../craft-stage/engine";
import { aimedOfCard } from "./tree-judge";
import { handBlockOn, shelfBlock as shelfOn } from "./tree-hand-block";
import { sampleOf } from "./tree-sample";
import type { Hand, TreeDoc } from "./tree-model";
import { tr } from "../../../i18n/lang";

/** 棚の灰色の訳 (手の棚 TreeHandShelf)。名前の付く狙いはその箱のカードと同じ (aimedOfCard)。打てるなら null */
export function shelfBlock(data: PatchData | null | undefined, doc: TreeDoc, id: string, item: StageItem | null | undefined, key: string): string | null {
  return shelfOn(data, doc, id, item, key, data && item ? aimedOfCard(data, doc, id, item) : null);
}

/** この箱の見本にこの手 (と前に足すカタリスト pre) を打てない訳。打てるなら null (写す前の判定、S-190d ①・③) */
export function handBlockAt(data: PatchData, doc: TreeDoc, id: string, h: Hand, pre: string | null): string | null {
  let it: StageItem | null = null;
  try { it = sampleOf(data, doc, id, 1)?.item ?? null; } catch { it = null; }
  if (!it) return tr("この箱の見本が作れない", "This box has no sample item");
  return handBlockOn(data, doc, id, it, h, pre, aimedOfCard(data, doc, id, it));
}
