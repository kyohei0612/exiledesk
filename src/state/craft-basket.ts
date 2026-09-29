/**
 * 上位プレイヤー MOD 一覧の「クラフトへ →」(2026-09-29)
 *
 * チェックした MOD (段つき) とベースを計算機に渡して作り方を組む。
 * 最初は「クラフトに追加」で貯めてから渡す形だったが、オーナー「キャンセルとクラフトへだけで」でチェックをそのまま渡す形に。
 */
import { reactive } from "vue";
import { craftPlanFor, type ChosenMod } from "../services/craft-v2/to-craft";
import { openCraftLab } from "./app-nav";

export const craftGo = reactive<{ busy: boolean; note: string }>({ busy: false, note: "" });

/** 計算機へ (選んだ MOD で作り方を組む)。渡せたら true */
export async function goCraft(baseType: string, chosen: readonly ChosenMod[]): Promise<boolean> {
  if (!baseType || !chosen.length || craftGo.busy) return false;
  craftGo.busy = true;
  craftGo.note = "";
  try {
    openCraftLab(await craftPlanFor(baseType, chosen));
    return true;
  } catch (e) {
    craftGo.note = `計算機に渡せませんでした: ${e instanceof Error ? e.message : String(e)}`;
    return false;
  } finally {
    craftGo.busy = false;
  }
}
