/**
 * 上位プレイヤー MOD 一覧の「クラフトに追加」で貯める MOD (2026-09-29)
 *
 * チェックした MOD (段つき) を「クラフトに追加」で貯め、「クラフトへ」で計算機に渡して作り方を組む。
 * 1 つのアイテムの話なのでベースは 1 つ。別のベースで足したら入れ直す (別のベースでは付く MOD が違う)。
 * プレフィックス・サフィックスは 3 個ずつまで、同じ系統は後から足した方に置き換える (一覧のチェックと同じ決まり)。
 */
import { reactive } from "vue";
import type { ModEntry } from "../services/craft-v2/types";
import { craftPlanFor, type ChosenMod } from "../services/craft-v2/to-craft";
import { MAX_AFFIX_PER_ITEM } from "../views/craft-v2/helpers";
import { openCraftLab } from "./app-nav";

export const craftBasket = reactive<{ baseType: string | null; baseJa: string; mods: ChosenMod[]; busy: boolean; note: string }>({
  baseType: null,
  baseJa: "",
  mods: [],
  busy: false,
  note: "",
});

const sameGroup = (a: ModEntry, b: ModEntry): boolean => (a.groupIds ?? []).some((g) => (b.groupIds ?? []).includes(g));

/** 貯める。戻り値は画面に出す一言 */
export function addToBasket(baseType: string, baseJa: string, chosen: readonly ChosenMod[]): string {
  if (craftBasket.baseType !== baseType) {
    const had = craftBasket.mods.length;
    craftBasket.baseType = baseType;
    craftBasket.baseJa = baseJa;
    craftBasket.mods = [];
    if (had) craftBasket.note = `ベースが変わったので入れ直しました (${baseJa})`;
  }
  let dropped = 0;
  for (const c of chosen) {
    const rest = craftBasket.mods.filter((x) => x.mod.rawTemplate !== c.mod.rawTemplate && !sameGroup(x.mod, c.mod));
    if (rest.filter((x) => x.mod.affix === c.mod.affix).length >= MAX_AFFIX_PER_ITEM) {
      dropped++;
      continue;
    }
    craftBasket.mods = [...rest, c];
  }
  craftBasket.note = dropped ? `${dropped} 個は枠 (${MAX_AFFIX_PER_ITEM} 個) が埋まっていて入りませんでした` : "";
  return craftBasket.note;
}

export function removeFromBasket(rawTemplate: string): void {
  craftBasket.mods = craftBasket.mods.filter((x) => x.mod.rawTemplate !== rawTemplate);
}
export function clearBasket(): void {
  craftBasket.mods = [];
  craftBasket.note = "";
}

/** 計算機へ (貯めた MOD で作り方を組む) */
export async function goCraft(): Promise<void> {
  if (!craftBasket.baseType || !craftBasket.mods.length || craftBasket.busy) return;
  craftBasket.busy = true;
  try {
    openCraftLab(await craftPlanFor(craftBasket.baseType, craftBasket.mods));
  } catch (e) {
    craftBasket.note = `計算機に渡せませんでした: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    craftBasket.busy = false;
  }
}
