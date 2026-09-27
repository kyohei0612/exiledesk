/**
 * クラフトステージ: 手順 JSON (POE2Tube → ExileDesk) を 1 手ずつ打って、結果 JSON を組む (2026-09-27、ADR-001)
 *
 * 受け渡しの形は POE2Tube の contracts が正 (contract.ts は自動生成)。決まり (contracts/README.md):
 *   - steps は plan.steps の times を展開した数と 1:1。steps[i].before == steps[i-1].after、final == 最後の after
 *   - 使えない手は飛ばさず applied:false + reason、before == after
 *   - 1 手ごとの seed は plan.seed + 手の番号 (1 から)。同じ手順 JSON なら結果 JSON も同じ
 *   - 費用は price_unit (ここでは高貴) の相場。キーは price-keys.json のカレンシー
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { itemBaseFor } from "../htc/bridge";
import { jaOfOmen, jaOfPriceKey } from "../htc/labels";
import { mulberry32 } from "../htc/rng";
import { jaTypeName } from "../trade2/localize";
import { applyCurrency } from "./apply-currency";
import type { CraftStagePlan, CraftStageResult, StageItem as OutItem, StageMod as OutMod, StageStep as OutStep } from "./contract";
import type { StageItem, StageMod } from "./types";

/** 白 (か手順の開始のレアリティ) の新品 */
export function freshItem(data: PatchData, base: string, itemLevel: number, rarity: StageItem["rarity"] = "normal"): StageItem {
  const cls = itemBaseFor(data, base);
  if (!cls) throw new Error(`ベースが見つからない: ${base}`);
  return { base, baseJa: jaTypeName(base), cls, itemLevel, rarity, prefixes: [], suffixes: [], quality: 0, corrupted: false };
}

function outMod(m: StageMod): OutMod {
  return {
    mod_id: m.modId,
    family: m.family,
    side: m.side,
    tier_name: m.tierName,
    mod_level: m.modLevel,
    text_ja: m.textJa,
    text_en: m.textEn,
    values: m.values,
    ranges: m.ranges,
    ...(m.fractured ? { fractured: true } : {}),
    ...(m.desecrated ? { desecrated: true } : {}),
    ...(m.crafted ? { crafted: true } : {}),
    // 足したキー (POE2Tube は無視してよい): 段の添字と接頭 / 接尾語
    ...({ tier_index: m.tierIndex, affix: m.affix } as object),
  } as OutMod;
}
function outItem(it: StageItem): OutItem {
  return {
    name: it.baseJa,
    base: it.base,
    base_ja: it.baseJa,
    item_level: it.itemLevel,
    rarity: it.rarity,
    quality: it.quality,
    corrupted: it.corrupted,
    prefixes: it.prefixes.map(outMod) as OutItem["prefixes"],
    suffixes: it.suffixes.map(outMod) as OutItem["suffixes"],
  };
}

export interface RunMeta {
  /** カレンシー 1 個の値段 (高貴建て、price-keys のキー → 値)。無ければ 0 */
  prices: Readonly<Record<string, number>>;
  exiledeskVersion: string;
  patch: string;
  league: string | null;
  /** 書き出し時刻 (ISO)。検算で固定するため外から渡せる */
  generatedAt?: string;
}

/** 手順を 1 手ずつ打つ */
export function runPlan(data: PatchData, plan: CraftStagePlan, meta: RunMeta): CraftStageResult {
  if (plan.start_paste) throw new Error("途中からの開始 (start_paste) はまだ使えない (Phase 2)");
  let item = freshItem(data, plan.base, plan.item_level ?? 80, plan.start_rarity ?? "normal");
  const steps: OutStep[] = [];
  let cumulative = 0;
  let index = 0;
  for (const ps of plan.steps) {
    for (let k = 0; k < (ps.times ?? 1); k++) {
      index++;
      const seed = plan.seed + index;
      const before = item;
      const r = applyCurrency(data, item, ps.currency, mulberry32(seed));
      item = r.item;
      const each = meta.prices[ps.currency] ?? 0;
      // 使えない手は使っていない (費用も 0)
      const amount = r.applied ? 1 : 0;
      cumulative += each * amount;
      steps.push({
        index,
        currency: ps.currency,
        currency_ja: jaOfPriceKey(ps.currency, item.cls) ?? ps.currency,
        omen: ps.omen ?? null,
        omen_ja: ps.omen ? jaOfOmen(ps.omen) : null,
        seed,
        applied: r.applied,
        reason: r.reason ?? null,
        before: outItem(before),
        after: outItem(item),
        changed: { added: r.added.map(outMod), removed: r.removed.map(outMod), rarity_from: before.rarity, rarity_to: item.rarity },
        cost: { each, amount, subtotal: each * amount, cumulative },
      });
    }
  }
  return {
    schema: "craft-stage-result/1",
    generated_at: meta.generatedAt ?? new Date().toISOString(),
    exiledesk_version: meta.exiledeskVersion,
    patch: meta.patch,
    league: meta.league,
    price_unit: "exalted",
    plan,
    steps: steps as CraftStageResult["steps"],
    final: outItem(item),
    total_cost: cumulative,
  };
}
