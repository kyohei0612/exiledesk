/**
 * tree-junk-tidy.ts — ハズレ整理の流れの状態 (S-190〜S-198、スイッチ junkTidy)。外れの箱は整理を押すまでグレーで、つなぎも回さない。
 * 状態は木から決める (箱の tidied の印 = 整理で見た箱)。保存しない: 開いた時は組み直しが整理まで済ませる (S-196)
 */
import { flag } from "../../../web/release-flags";
import { VIEW_ONLY_MAX } from "../../../utils/use-phone";
import type { OutKind, TreeBox, TreeDoc } from "./tree-model";

/** 狙いを持って打って狙い通りにいかなかった結果だけ (狙い無しの結果・消去で外れが消えた箱は狙い通りなのでグレーにしない、S-191) */
const JUNK: ReadonlySet<OutKind | "start"> = new Set(["junk", "lost"]);
/** 見るだけの幅の外 = ツリーを組める幅だけ (S-197・S-94g) */
export const tidyOn = (): boolean => flag("junkTidy") && !(typeof window !== "undefined" && window.innerWidth < VIEW_ONLY_MAX);
const open = (b: TreeBox): boolean => !b.hand && !b.back && !b.done && !b.split;
/** 組む間は触れない外れの箱 (S-191)。人が × で外した箱は決めた箱 */
export const isGrayBox = (b: TreeBox): boolean => tidyOn() && JUNK.has(b.out) && open(b) && !b.tidied && !b.noAutoBack;
/** 整理の後に残った、人が決める箱 (S-192 ③)。上の段から */
export const unsetBoxes = (d: TreeDoc): string[] => Object.values(d.boxes).filter((b) => open(b) && !isGrayBox(b)).sort((a, z) => a.y - z.y || a.x - z.x).map((b) => b.id);
/** ボタンの状態 (S-192): tidy = 「ハズレ整理」、unset = 未設定 n つ (押す物が無い)、check = 最終チェック */
export type TidyStep = "tidy" | "unset" | "check";
export function tidyStep(d: TreeDoc): TidyStep {
  // 整理は 1 度押した後は最終チェックの時だけ。手を足しても ① へ戻らない (S-192)
  if (!d.tidyRan && Object.values(d.boxes).some((b) => open(b) && !b.tidied && !b.noAutoBack)) return "tidy";
  return unsetBoxes(d).length ? "unset" : "check";
}
/** 開いた木の決めの無い外れの箱は整理を押すまでグレー (S-196)。整理で見た印を付けない箱か */
export const staysGray = (b: TreeBox): boolean => JUNK.has(b.out) && open(b);
/** 完成を押した後・整理を押した後は全部グレーにして、次に押す物だけ光らせる。合格まで保つ (S-198)。開いただけの木は出さない (S-196) */
export const guideOn = (d: TreeDoc): boolean => tidyOn() && Object.values(d.boxes).some((b) => b.done === "main" && b.doneNow);
