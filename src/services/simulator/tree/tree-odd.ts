/**
 * tree-odd.ts — 偶然付いた完成形の狙いの箱 (S-21b、スイッチ oddShapes。11-17 オーナー「止まりはA」)。
 * 狙い無しの手・☑ に無い狙いの手で完成形の狙いが段を満たして付いた人が、次の手の後に結果の箱 (外れ・打った後・外れが消えた) の代表と中身が違い、
 * 中身の同じ箱も木に無い (回すとそこで止まる) 時だけ、鍵に `o:<modId>/<段>` を足した別の箱 (未設定) へ入れる。
 * 付いた狙いは ☑ に数える (nextAimed)。箱を足すのは配置 (tree-frame) の ↩・ほかの形の枝を当てる所、人を入れるのは outBoxOf (付いた狙いを持つ人だけ)。
 * 例: バナナ (11-17) の 4 段目「打った後」(狙い無しの高貴) で受け流しが付いた人が、消去の後 5 段目「外れが消えた」(↩ 見本は外れ 2) と形が合わず止まった
 */
import type { PatchData, StageItem } from "../../craft-stage/engine";
import { aimHeldOn } from "./tree-aim";
import { joinKeys } from "./tree-whittle";
import type { Aim } from "./tree-model";

const ODD = "o:";
/** 偶然付いた狙いの鍵を持つ結果の種類 */
export const ODD_OUTS: ReadonlySet<string> = new Set(["any", "junk", "junkGone"]);
const partsOf = (key: string | undefined): string[] => key?.split(";").find((s) => s.startsWith(ODD))?.slice(ODD.length).split(",").filter(Boolean) ?? [];
/** 鍵の偶然付いた狙い (段つき、無ければ []) */
export const oddAimsOf = (key: string | undefined): Aim[] => partsOf(key).map((s) => { const i = s.lastIndexOf("/"); return { modId: s.slice(0, i), tier: Number(s.slice(i + 1)) }; });
/** 鍵の偶然付いた狙いの modId (無ければ []) */
export const oddOf = (key: string | undefined): string[] => oddAimsOf(key).map((a) => a.modId);
/** 鍵から o: を外した物 */
export const withoutOdd = (key: string | undefined): string | undefined => key?.split(";").filter((s) => !s.startsWith(ODD)).join(";") || undefined;
/** 鍵に偶然付いた狙いを足す */
export const withOddKey = (key: string | undefined, aims: readonly Aim[]): string | undefined => joinKeys(key, `${ODD}${aims.map((a) => `${a.modId}/${a.tier}`).sort().join(",")}`);
/** 鍵 o: の箱で、この人 (after) が付いた狙いを全部持つ物か */
export const oddFits = (data: PatchData, key: string | undefined, after: StageItem): boolean => { const a = oddAimsOf(key); return a.length > 0 && a.every((x) => aimHeldOn(data, after, x, { sameText: true })); };
