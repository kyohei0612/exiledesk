/**
 * spell-tags.ts — MOD が品に足すタグで別の MOD が付かなくなる組を、エンジンの行に載せる (E-11i、2026-11-04 要望 9322033b)。
 *
 * 表 (spell-tags.json) は scripts/build-spell-tags-from-client.mjs がクライアントの Mods (adds_tags・spawn_weights) から作る。
 * 行の group (= クライアントの MOD の型) で引き、addsTags / blockedByTags を足すだけ。判定はエンジンの
 * occupiedFamiliesOf / excluded (pool.ts) の 1 か所で、ここは何も決めない。patch.ts の最後で当てる
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import table from "./spell-tags.json";

const TYPES = (table as { types: Record<string, { adds: string[]; blocked: string[] }> }).types;

export function applySpellTags(data: PatchData): PatchData {
  const mods = new Map<string, Mod>(data.mods);
  for (const [id, m] of data.mods) {
    const t = TYPES[(m as Mod & { group?: string }).group ?? id.split("/")[1] ?? ""];
    if (!t) continue;
    mods.set(id, { ...m, ...(t.adds.length ? { addsTags: t.adds } : {}), ...(t.blocked.length ? { blockedByTags: t.blocked } : {}) });
  }
  return { ...data, mods };
}
