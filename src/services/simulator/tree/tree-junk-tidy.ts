/**
 * tree-junk-tidy.ts — ハズレ整理の流れの状態 (S-190〜S-198、スイッチ junkTidy)。外れの箱は整理を押すまでグレーで、つなぎも回さない。
 * 状態は木から決める (箱の tidied の印 = 整理で見た箱)。保存しない: 開いた時は組み直しが整理まで済ませる (S-196)
 */
import { flag } from "../../../web/release-flags";
import { isPhoneWidth } from "../../../utils/use-phone";
import type { OutKind, TreeBox, TreeDoc } from "./tree-model";

/** 狙いを持って打って狙い通りにいかなかった結果だけ (狙い無しの結果・消去で外れが消えた箱は狙い通りなのでグレーにしない、S-191) */
const JUNK: ReadonlySet<OutKind | "start"> = new Set(["junk", "lost"]);
/** スマホは見るだけなので PC だけ (S-197) */
export const tidyOn = (): boolean => flag("junkTidy") && !isPhoneWidth();
const open = (b: TreeBox): boolean => !b.hand && !b.back && !b.done && !b.split;
/** 組む間は触れない外れの箱 (S-191)。人が × で外した箱は決めた箱 */
export const isGrayBox = (b: TreeBox): boolean => tidyOn() && JUNK.has(b.out) && open(b) && !b.tidied && !b.noAutoBack;
/** 整理の後に残った、人が決める箱 (S-192 ③)。上の段から */
export const unsetBoxes = (d: TreeDoc): string[] => Object.values(d.boxes).filter((b) => open(b) && !isGrayBox(b)).sort((a, z) => a.y - z.y || a.x - z.x).map((b) => b.id);
/** ボタンの状態 (S-192): tidy = 「ハズレ整理」、unset = 「ハズレ整理 (未設定 n)」、check = 今の穴チェック */
export type TidyStep = "tidy" | "unset" | "check";
export function tidyStep(d: TreeDoc): TidyStep {
  // まだ整理で見ていない決めの無い箱があれば整理から (手を足した後の「打った後」の箱も、S-192)
  if (Object.values(d.boxes).some((b) => open(b) && !b.tidied && !b.noAutoBack)) return "tidy";
  return unsetBoxes(d).length ? "unset" : "check";
}
/** 完成を押した後は全部グレーにして、次に押す物だけ光らせる (S-198) */
export const guideOn = (d: TreeDoc): boolean => tidyOn() && Object.values(d.boxes).some((b) => b.done === "main") && tidyStep(d) !== "check";
