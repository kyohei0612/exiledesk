/**
 * tree-auto-essence.ts — 白のベースに 変成 → 普通のエッセンス で最初に付ける狙いを選ぶ (tree-auto.ts から分けた、2026-10-22。500 行の決まり、中身はそのまま)
 */
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { essenceLevelOf } from "../../vendor/poe2htc/optimizer/cost";
import { breachPlanned, type AutoTreeInput } from "./tree-auto-input";

/**
 * 変成 → 普通のエッセンス で最初に付けられる狙い (2026-10-03、防具・武器への拡張 その 2)。普通の MOD の狙いのうち、同じ系統のエッセンスの MOD
 * (レッサー / 無印 / グレーター) の段が狙いの段に届く物。届く中で一番安いエッセンス、狙いの中では出にくい物 (chance の小さい物) を先に。
 * 白のベース (開始の MOD が 0) で、ブリーチもエッセンスの狙いも無い時だけ (エッセンスの MOD は 1 つまで)。無ければ null
 */
export function magicEssenceFor(inp: AutoTreeInput, cls: { pools: { essence: { prefixes: readonly string[]; suffixes: readonly string[] } } }, itemLevel: number): { modId: string; key: string } | null {
  const d = inp.data, p = inp.prices;
  const fixed = new Set(inp.fixedIds);
  if ((inp.startCount?.prefix ?? 0) + (inp.startCount?.suffix ?? 0) > 0 || breachPlanned(inp)) return null;
  const ts = inp.targets.filter((t) => !fixed.has(t.modId) && d.mods.has(t.modId));
  if (ts.some((t) => CRAFTED_SOURCES.has(d.mods.get(t.modId)!.source))) return null;
  const ess = [...cls.pools.essence.prefixes, ...cls.pools.essence.suffixes].map((id) => d.mods.get(id)).filter((m): m is NonNullable<typeof m> => !!m && m.source === "essence");
  const found: Array<{ modId: string; key: string; price: number; chance: number }> = [];
  for (const t of ts) {
    const m = d.mods.get(t.modId)!;
    if (m.source !== "normal") continue;
    for (const e of ess.filter((x) => x.family === m.family && x.type === m.type)) {
      for (const tier of e.tiers) {
        if (tier.ilvl > itemLevel) continue;
        // エッセンスの段は普通の MOD の同じ MOD レベルの段に当たる (グレーターの体 = ライフ 85-99 = レベル 46 の段)
        const idx = m.tiers.findIndex((x) => x.ilvl === tier.ilvl);
        if (idx < 0 || idx < (t.minTierIndex ?? 0)) continue;
        const level = essenceLevelOf(String(tier.name ?? ""));
        const key = `essence:${level}:${e.id}`;
        const price = (p.currency[key] ?? Infinity) + (p.currency["transmute"] ?? 0);
        if (Number.isFinite(price)) found.push({ modId: t.modId, key, price, chance: inp.chance?.(t) ?? 1 });
      }
    }
  }
  found.sort((a, b) => a.chance - b.chance || a.price - b.price);
  return found[0] ? { modId: found[0].modId, key: found[0].key } : null;
}
