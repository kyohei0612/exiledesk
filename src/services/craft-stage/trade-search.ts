/**
 * クラフトステージの MOD 群を取引所 (JP) で探す検索の組み立て (2026-10-07 オーナー「この MOD 群をそのまま検索にかけたい」
 * 「ステージでも同じエンジンで実装しておｋ」)。シミュレーションの「ここまでの MOD を取引所で検索」と、手で打つ画面の「今の MOD を取引所で検索」が使う。
 * 完成品の検索と同じくゆるく: どの MOD も 普通 / 固定済み / 冒涜 のどれでもいい (付け方で種類が変わるので)。
 * グループ (どれか N つ) は count、固有は入れない ([[trade-search-rules]])。素材は聖別を除く
 */
import { tradeFiltersFor } from "../htc/buy-or-craft";
import { buildSpecQuery } from "../trade2/query/spec";
import { hasStatKind, type StatKind } from "../trade2/stat-kinds";
import { openTradeQuery } from "../pob-check/trade-links";
import type { PatchData } from "../../vendor/poe2htc/engine/types";

export interface ModPick { modId: string; minTierIndex: number }
/** 1 つの条件: 候補 (picks) のうち count 個 (既定 1) */
export interface ModGroup { picks: readonly ModPick[]; count?: number }

const KINDS: StatKind[] = ["explicit", "fractured", "desecrated"];

/**
 * その MOD の取引所の条件 (普通 / 固定済み / 冒涜 のどれでも)。値の下限は入れない: 組み合わせだけで探す
 * (2026-10-07 オーナー「組み合わせだけの検索でおｋだから一旦数値は抜き」)
 */
export function statsOfMod(data: PatchData, t: ModPick, withMin = false): Array<{ id: string; min?: number }> {
  return tradeFiltersFor(data, [t]).filters.flatMap((f) => {
    const min = withMin && f.min != null ? { min: f.min } : {};
    if (!/^explicit\./.test(f.id)) return [{ id: f.id, ...min }];
    const key = f.id.replace(/^explicit\./, "");
    return KINDS.filter((k) => hasStatKind(key, k)).map((k) => ({ id: `${k}.${key}`, ...min }));
  });
}

/**
 * MOD のグループから取引所の検索を開く (開くだけ)。名前・ベース・種類・アイテムレベル・ソケットは入れない: MOD の組み合わせで種類も決まる
 * (2026-10-07 オーナー「検索する時は基本左側指定なしでおｋ、名前から何から」「MOD できてるから自動で指定しなくても入るでしょ」)
 */
export async function searchModGroups(
  data: PatchData,
  opts: { groups: readonly ModGroup[]; exact?: { baseType: string; ilvlMin: number; socketsMin: number } },
): Promise<void> {
  const stats: Array<{ id: string; min?: number }> = [];
  const anyOf: Array<{ filters: Array<{ id: string; min?: number }>; count?: number }> = [];
  for (const g of opts.groups) {
    // exact (手で打つ画面の今のアイテム): 段の下限の値も入れる
    const fs = g.picks.flatMap((p) => statsOfMod(data, p, !!opts.exact));
    const count = g.count ?? 1;
    if (fs.length === 1 && count <= 1) stats.push(fs[0]!);
    else if (fs.length) anyOf.push({ filters: fs, ...(count > 1 ? { count } : {}) });
  }
  const ex = opts.exact;
  await openTradeQuery(buildSpecQuery({ rarity: "nonunique", stats, anyOf, ...(ex ? { baseType: ex.baseType, ilvlMin: ex.ilvlMin, noSanctified: true, ...(ex.socketsMin > 0 ? { socketsMin: ex.socketsMin } : {}) } : {}) }));
}
