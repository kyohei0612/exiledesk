/**
 * poe2db-value-fixes.ts — 段の値の幅を poe2db に合わせる (2026-10-20 J5b、オーナー「poe2db とエンジンが食い違い写しで決まらない物は全部 poe2db に」)。
 *
 * audit-poe2db-mods.mjs (画面の単位で比べる) で残った値の違いのうち、poe2db の文の値に合わせる物。値は生の単位 (ms など) で持つ。
 *   兜の憤怒の固有効果の喪失の遅れ (ルーンで付く berserking、45 段目): poe2db「1 秒遅く」、エンジン 1000〜2000ms → 1000ms
 * patch.ts の最後で当てる
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/** MOD の id (正規表現)・段の必要レベル → 生の値の幅 */
const FIXES: ReadonlyArray<{ id: RegExp; ilvl: number; ranges: Array<[number, number]> }> = [
  { id: /^Helmets_[a-z_]+\/Rune_berserking_RageLossDelay$/, ilvl: 45, ranges: [[1000, 1000]] },
];

export function applyPoe2dbValueFixes(data: PatchData): PatchData {
  const mods = new Map(data.mods);
  for (const [id, m] of data.mods) {
    const fixes = FIXES.filter((f) => f.id.test(id));
    if (!fixes.length) continue;
    const tiers = m.tiers.map((t) => {
      const f = fixes.find((x) => x.ilvl === t.ilvl);
      return f ? { ...t, ranges: f.ranges } : t;
    });
    mods.set(id, { ...m, tiers } as Mod);
  }
  return { ...data, mods };
}
