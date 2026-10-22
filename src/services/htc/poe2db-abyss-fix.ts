/**
 * poe2db-abyss-fix.ts — アビサルロードの紋章 (アビスのエッセンスの MOD、系統 EssenceAbyss) のサフィックスを置き場に足す (2026-10-20 J5c)。
 *
 * poe2db の部位のページの perfect_essence には、アビサルロードの紋章がプレフィックス (ModGenerationTypeID 1) とサフィックス (2) の
 * 両方ある。エンジンの行はプレフィックスだけだったので、同じ中身のサフィックスの MOD (id の末尾 _Suffix) を作って pools.essence に足す。
 * エッセンスを打った時にどちらの側に付くかは poe2db に書いていない。打つ処理はここでは変えず、付ける側は消した MOD の側
 * (spec/parts.ts の addEssence の removedSide。消していなければお告げの側か空いている側、SaVeQ 0.5.5 / poe2fun)。MOD の中身は
 * essenceTarget の先に見つかった方 (プレフィックスの行) を使い、側だけを付け替える。
 * このサフィックスの行は貼り付けの読み (サフィックスに付いた紋章) と MOD の一覧のための足し。patch.ts の最後で当てる
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";

const ABYSS = "EssenceAbyss";

export function applyAbyssSuffix(data: PatchData): PatchData {
  const mods = new Map(data.mods);
  const bases = new Map(data.bases);
  for (const [id, b] of data.bases) {
    const pool = b.pools?.essence;
    if (!pool) continue;
    const pre = pool.prefixes.map((x) => mods.get(x)).find((m): m is Mod => !!m && (m.families ?? [m.family]).includes(ABYSS));
    if (!pre || pool.suffixes.some((x) => (mods.get(x)?.families ?? [mods.get(x)?.family]).includes(ABYSS))) continue;
    const suffix: Mod = { ...pre, id: `${pre.id}_Suffix`, type: "suffix" };
    mods.set(suffix.id, suffix);
    bases.set(id, { ...b, pools: { ...b.pools, essence: { ...pool, suffixes: [...pool.suffixes, suffix.id] } } });
  }
  return { ...data, mods, bases };
}
