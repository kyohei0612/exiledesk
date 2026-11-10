/**
 * tree-whittle-scene.ts — 削減の場面を 1 か所で出す (S-27d の頭の 1 本・S-65c、11-10 オーナー「削減周り整理してくれ新旧ごっちゃになってると思う」→ 段 1 の表に「3つともおｋ」)。
 * 消える手は全部、この箱の品の乱数の外れを付きうる段に差し替えてエンジンで当てた結果で見る。削減の枠 (低い・同じ・高い) はその 1 つの場合で、特例にしない。
 * ここで決める物 (前は 5〜8 か所でばらばらに決めていた):
 *  - 兄弟の枠の組 (frameGroupKey): 種類・当たりの狙い・枠を外した鍵。枠を作る・窓の一行・枝の来ない枠の代表・回す人の行き先で同じ物
 *  - 枠の削減の手 (frameHandOf): 自分の箱の手が削減ならそれ、無ければ同じ組の兄弟の削減の手 (手の無い兄弟の枠でも残したい MOD と側が効く)
 *  - 比べの相手 (whittleCompare): ☑ の印から ☑ を外した残したい MOD を除いた札 (完成形の狙い・置き石)。差し替えで見る欲しい MOD も同じ札
 */
import type { PatchData } from "../../craft-stage/engine";
import { aimedList, missAims, type MissAims } from "./tree-miss";
import { aimKey, boxAims, type Aim, type Hand, type TreeBox, type TreeDoc } from "./tree-model";
import { handWhittleSide, isWhittleHand, stripLv, whittleAimed } from "./tree-whittle";
import type { StageItem, StageSide } from "../../craft-stage/engine";

/** 兄弟の枠の組の鍵: 種類・当たりの狙い (当たりは狙いごとに別の組)・枠 (l:) を外した鍵 */
export const frameGroupKey = (c: Pick<TreeBox, "out" | "aim" | "anyOf" | "junkKey">): string => `${c.out}|${c.out === "hit" ? boxAims(c).map(aimKey).join(",") : ""}|${stripLv(c.junkKey) ?? ""}`;

/** 箱 id と同じ親・同じ組の兄弟 (自分も入る、親の結果の並び順) */
export function frameSiblings(doc: TreeDoc, id: string): TreeBox[] {
  const b = doc.boxes[id], p = b?.parent ? doc.boxes[b.parent] : undefined;
  if (!b || !p) return b ? [b] : [];
  const k = frameGroupKey(b);
  return p.outs.map((o) => doc.boxes[o]).filter((x): x is TreeBox => !!x && frameGroupKey(x) === k);
}

/** 枠の削減の手: 自分の箱の手が削減ならそれ、無ければ同じ組の兄弟で最初の削減の手 (無ければ null) */
export function frameHandOf(doc: TreeDoc, id: string): Hand | null {
  const own = doc.boxes[id]?.hand;
  if (isWhittleHand(own)) return own!;
  return frameSiblings(doc, id).find((x) => isWhittleHand(x.hand))?.hand ?? null;
}

/** 削減の比べ: 消える側 (左右の抹消があればその側)・比べる相手と差し替えで見る欲しい MOD の札・外れの式 */
export interface WhittleCompare { side: StageSide | null; wanted: Aim[]; miss: MissAims }
/** h = 削減の手 (frameHandOf)、aimed = この品の ☑ の印 */
export function whittleCompare(data: PatchData, doc: TreeDoc, h: Hand | { omens: readonly string[]; keep?: readonly { modId: string }[] } | null | undefined, aimed: ReadonlySet<string> | null | undefined, item?: StageItem | null): WhittleCompare {
  // item = 比べる品 (この手で消えない狙いを残したい MOD に数える、whittleAimed)
  const wanted = aimedList(data, doc, whittleAimed(data, h, aimed, item));
  return { side: handWhittleSide(h), wanted, miss: missAims(data, wanted) };
}
