/**
 * poe2db-implicit-fixes.ts — ベースの暗黙を poe2db に合わせる (2026-10-20 J5a、オーナー「確認は poe2db」)。
 *
 * 直しの中身は scripts/audit-poe2db-implicits.mjs --write が作る poe2db-implicit-fixes.json (ベースごとに)。
 *   implicits = poe2db の暗黙 (ベルトのチャームスロット・減少の幅の向きなど)
 *   variants  = 同じ名前の別物 (2 ストーンリング・ルーンマスター品など、poe2db に同じ名前のカードが 2 枚以上)。暗黙は今の物か 1 枚目
 *   stats     = 新しい並び → implicit-stats.json の元の並び (引き継げない行は null = stat 無し)
 * patch.ts の applyExtras が baseInfo に当て、implicitStatsOf が stats で並びを引き直す。
 */
import fixesJson from "./poe2db-implicit-fixes.json";
import type { BaseInfo } from "./patch-types";

type Implicit = { en: string; ja: string };
interface Fix { implicits?: Implicit[]; variants?: Implicit[][]; stats?: Array<number | null> }

const FIXES = (fixesJson as unknown as { bases: Record<string, Fix> }).bases;

/** baseInfo に直しを当てた物 (元は変えない) */
export function applyPoe2dbImplicitFixes(info: Record<string, BaseInfo>): Record<string, BaseInfo> {
  const out = { ...info };
  for (const [base, f] of Object.entries(FIXES)) {
    const cur = out[base];
    if (!cur) continue;
    out[base] = {
      ...cur,
      ...(f.implicits ? { implicits: f.implicits } : {}),
      ...(f.variants ? { implicitVariants: f.variants } : {}),
    };
  }
  return out;
}

/** 直しで並びが変わったベースの、新しい並び → 元の stat の並び (変わっていなければ null) */
export function implicitStatOrder(base: string): ReadonlyArray<number | null> | null {
  return FIXES[base]?.implicits ? FIXES[base]!.stats ?? null : null;
}
