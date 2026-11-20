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
import { handWhittleSide, isWhittleHand, lvPart, stripLv, whittleAimed } from "./tree-whittle";
import type { StageItem, StageSide } from "../../craft-stage/engine";
import { flag, type Flag } from "../../../web/release-flags";

/** 削減の 2 パターン (S-65c7、スイッチ whittleTwoWays) が効いているか */
export const twoWays = (): boolean => flag("whittleTwoWays" as Flag);

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
  // (S-65c7) 帯の比べる相手は帯で 1 つ: 組の兄弟の削減の手のうち側のお告げの無い先頭の手 (枠ごとに置いた手の側でずらさない)。
  // 側のお告げの手しか無い帯 (パターン 1 = 帯に割らない。前の作りで割れた帯を開いた時だけ) は前どおり
  if (twoWays()) { const hs = frameSiblings(doc, id).map((x) => x.hand).filter((h): h is Hand => isWhittleHand(h)); const head = hs.find((h) => !handWhittleSide(h)); if (head) return head; }
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

/**
 * 帯の枠の箱 id で、その箱の削減の手の枝を帯の組で絞る時の比べ (S-65c7、スイッチ whittleTwoWays)。帯の比べる手 (frameHandOf) の外れの式と側。
 * スイッチが閉じている・帯の枠でない箱は null (= 前どおり、その箱の手の側で絞る)
 */
export function bandCompare(data: PatchData, doc: TreeDoc, id: string, aimed: ReadonlySet<string> | null | undefined, item?: StageItem | null): WhittleCompare | null {
  if (!twoWays() || !lvPart(doc.boxes[id]?.junkKey)) return null;
  return whittleCompare(data, doc, frameHandOf(doc, id), aimed, item);
}
/** 帯の枠の箱 id の比べる側 (bandCompare の側だけ。帯でなければ undefined) */
export const bandSideOf = (doc: TreeDoc, id: string): StageSide | null | undefined => (twoWays() && lvPart(doc.boxes[id]?.junkKey) ? handWhittleSide(frameHandOf(doc, id)) : undefined);
