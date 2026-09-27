/**
 * クラフトステージ: 手順 JSON (POE2Tube → ExileDesk) を 1 手ずつ打って、結果 JSON を組む (2026-09-27、ADR-001)
 *
 * 受け渡しの形は POE2Tube の contracts が正 (contract.ts は自動生成)。決まり (contracts/README.md):
 *   - steps は plan.steps の times を展開した数と 1:1。steps[i].before == steps[i-1].after、final == 最後の after
 *   - 使えない手は飛ばさず applied:false + reason、before == after
 *   - 1 手ごとの seed は plan.seed + 手の番号 (1 から)。同じ手順 JSON なら結果 JSON も同じ
 *   - 費用は price_unit (ここでは高貴) の相場。キーは price-keys.json のカレンシー
 * 画面 (手で打つ) も同じ playStep を使うので、画面で打った手を手順 JSON にして流すと同じ結果になる。
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

export function outMod(m: StageMod): OutMod {
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
export function outItem(it: StageItem): OutItem {
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

/** 1 手の記録 (画面の履歴にも使う) と、打った後のアイテム */
export interface PlayedStep {
  out: OutStep;
  before: StageItem;
  after: StageItem;
  added: StageMod[];
  removed: StageMod[];
}

/**
 * 1 手打つ。seed はその手の種 (開始の seed + 手の番号)。each はカレンシー 1 個の値段 (高貴)、cumulative は前の手までの累計
 */
export function playStep(
  data: PatchData, item: StageItem, currency: string,
  o: { index: number; seed: number; each: number; cumulative: number; omen?: string | null },
): PlayedStep {
  const r = applyCurrency(data, item, currency, mulberry32(o.seed));
  // 使えない手は使っていない (費用も 0)
  const amount = r.applied ? 1 : 0;
  const cumulative = o.cumulative + o.each * amount;
  const out: OutStep = {
    index: o.index,
    currency,
    currency_ja: jaOfPriceKey(currency, item.cls) ?? currency,
    omen: o.omen ?? null,
    omen_ja: o.omen ? jaOfOmen(o.omen) : null,
    seed: o.seed,
    applied: r.applied,
    reason: r.reason ?? null,
    before: outItem(item),
    after: outItem(r.item),
    changed: { added: r.added.map(outMod), removed: r.removed.map(outMod), rarity_from: item.rarity, rarity_to: r.item.rarity },
    cost: { each: o.each, amount, subtotal: o.each * amount, cumulative },
  };
  return { out, before: item, after: r.item, added: r.added, removed: r.removed };
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

/** 手順を 1 手ずつ打って、全部の手の記録を返す (upTo まで。画面の再生モードの ?step=N) */
export function playPlan(data: PatchData, plan: CraftStagePlan, prices: Readonly<Record<string, number>>, upTo = Infinity): { steps: PlayedStep[]; final: StageItem } {
  if (plan.start_paste) throw new Error("途中からの開始 (start_paste) はまだ使えない (Phase 2)");
  let item = freshItem(data, plan.base, plan.item_level ?? 80, plan.start_rarity ?? "normal");
  const steps: PlayedStep[] = [];
  let cumulative = 0;
  let index = 0;
  for (const ps of plan.steps) {
    for (let k = 0; k < (ps.times ?? 1); k++) {
      if (index >= upTo) return { steps, final: item };
      index++;
      const p = playStep(data, item, ps.currency, { index, seed: plan.seed + index, each: prices[ps.currency] ?? 0, cumulative, omen: ps.omen ?? null });
      steps.push(p);
      item = p.after;
      cumulative = p.out.cost.cumulative;
    }
  }
  return { steps, final: item };
}

/** 結果 JSON に組む */
export function resultOf(plan: CraftStagePlan, steps: readonly PlayedStep[], final: StageItem, meta: RunMeta): CraftStageResult {
  return {
    schema: "craft-stage-result/1",
    generated_at: meta.generatedAt ?? new Date().toISOString(),
    exiledesk_version: meta.exiledeskVersion,
    patch: meta.patch,
    league: meta.league,
    price_unit: "exalted",
    plan,
    steps: steps.map((s) => s.out) as CraftStageResult["steps"],
    final: outItem(final),
    total_cost: steps.length ? steps[steps.length - 1]!.out.cost.cumulative : 0,
  };
}

/** 手順を打って結果 JSON まで (CLI 用) */
export function runPlan(data: PatchData, plan: CraftStagePlan, meta: RunMeta): CraftStageResult {
  const { steps, final } = playPlan(data, plan, meta.prices);
  return resultOf(plan, steps, final, meta);
}
