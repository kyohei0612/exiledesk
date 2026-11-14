/**
 * any-ele.ts — 「いずれかの元素耐性」に数える MOD (E-80、11-15 オーナー「おｋ その形で作って」)。
 * 一般の火・冷気・雷耐性だけ (全ての元素耐性・2 元素・混沌・冒涜・エッセンスの耐性は数えない)。当たりの式 (aim-odds の hits)・MOD の一覧 (mod-list) が使う
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";

/** 数える系統 (並びは火・冷気・雷) */
export const ANY_ELE_FAMILIES: readonly string[] = ["FireResistance", "ColdResistance", "LightningResistance"];

/** その modId が数える MOD (出どころ normal で系統が ANY_ELE_FAMILIES) か */
export function anyEleMod(data: PatchData, modId: string): boolean {
  const m = data.mods.get(modId);
  return !!m && m.source === "normal" && ANY_ELE_FAMILIES.includes(m.family);
}

/** 同じ部位 (modId の「/」の前が同じ) の数える MOD の modId を火・冷気・雷の順で。数える MOD でなければ空 */
export function anyEleIds(data: PatchData, modId: string): string[] {
  if (!anyEleMod(data, modId)) return [];
  const head = modId.slice(0, modId.indexOf("/") + 1);
  const byFam = new Map<string, string>();
  for (const [id, m] of data.mods) if (id.startsWith(head) && !byFam.has(m.family) && anyEleMod(data, id)) byFam.set(m.family, id);
  return ANY_ELE_FAMILIES.map((f) => byFam.get(f)).filter((id): id is string => !!id);
}
