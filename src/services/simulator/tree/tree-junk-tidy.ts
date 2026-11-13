/**
 * tree-junk-tidy.ts — ハズレ整理の流れの状態 (S-190〜S-198)。外れの箱は整理を押すまでグレーで、つなぎも回さない。
 * 状態は木から決める (箱の tidied の印 = 整理で見た箱)。保存しない: 開いた時は組み直しが整理まで済ませる (S-196)
 */
import { VIEW_ONLY_MAX } from "../../../utils/use-phone";
import { idealGray } from "./tree-ideal-first";
import type { OutKind, TreeBox, TreeDoc } from "./tree-model";

/** 外れの道 = 狙いを持って打って狙い通りにいかなかった結果 (外れ・狙いが消えた)。狙い無しの結果 (打った後・消去の外れが消えた) はグレーにしない (S-191・S-190b。消去もほかの手と同じ、11-04) */
const JUNK: ReadonlySet<OutKind | "start"> = new Set(["junk", "lost"]);
/** 外れの道の箱 = 自動の ↩ を付けない箱 (人が手を決める・同じ枠探しでだけつながる、S-190b) */
export const junkPath = (b: TreeBox): boolean => JUNK.has(b.out);
/** 見るだけの幅の外 = ツリーを組める幅だけ (S-197・S-94g)。画面の案内 (整理の流れ・光らせ) だけが見る。木の中身 (整理・グレーの判定・開く時の組み直し) は幅を見ない (11-09、同じ木は幅で変わらない。前は 390 で外れの整理が走らず、自動の戻り先が PC と別の段になった) */
export const tidyOn = (): boolean => !(typeof window !== "undefined" && window.innerWidth < VIEW_ONLY_MAX);
const open = (b: TreeBox): boolean => !b.hand && !b.back && !b.done && !b.split;
/** 組む間は触れない外れの箱 (S-191)。人が × で外した箱は決めた箱 */
export const isGrayBox = (b: TreeBox): boolean => JUNK.has(b.out) && open(b) && !b.tidied && !b.noAutoBack;
/** 整理の後に残った、人が決める箱 (S-192 ③)。上の段から。完成を押すまでの灰色 (S-142i) は数えない (最終チェックが灰色の箱へ寄って止まった、11-13 レビュー) */
export const unsetBoxes = (d: TreeDoc): string[] => Object.values(d.boxes).filter((b) => open(b) && !isGrayBox(b) && !idealGray(d, b.id)).sort((a, z) => a.y - z.y || a.x - z.x).map((b) => b.id);
/** ボタンの状態 (S-192): unset = 未設定 n つ (押す物が無い)、check = 最終チェック。整理は木を変えるたびに走るので「ハズレ整理」の状態は無い (S-201 ①) */
export type TidyStep = "tidy" | "unset" | "check";
export function tidyStep(d: TreeDoc): TidyStep {
  return unsetBoxes(d).length ? "unset" : "check";
}
/** 開いた木の決めの無い外れの箱は整理を押すまでグレー (S-196)。整理で見た印を付けない箱か */
export const staysGray = (b: TreeBox): boolean => JUNK.has(b.out) && open(b);
/** 完成を押した後・整理を押した後は全部グレーにして、次に押す物だけ光らせる。合格まで保つ (S-198)。開いただけの木は出さない (S-196) */
export const guideOn = (d: TreeDoc): boolean => tidyOn() && Object.values(d.boxes).some((b) => b.done === "main" && b.doneNow);
