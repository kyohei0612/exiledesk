/**
 * stage-sim.ts — クラフトステージのシミュレーション (2026-10-05、実験)
 *
 * オーナー「クラフト計算機で何をしたいかってのはシミュレーションなんだよね、この MOD 群をクラフトした場合にいくらかかるのか。
 * その動きが結構しづらい。ステージでタブ切り替えでエミュレーター作ってよくね (Craft of Exile 的な)」「計算機は今のままで、
 * ステージにもう 1 個タブ作ってやってみるか」。
 *
 * 計算機の作る見込み ([[craft-estimate.ts]] の runAuto) と同じ道: 自動のツリーの候補を組んで短く回し、安い方を採り
 * ([[auto-pick.ts]] pickAutoTree)、それを多めに回して平均・成功率・分位を出す ([[sim-route-run.ts]])。
 * 計算機の画面の状態 (useHtcCraft) を使わず、ステージのベース・アイテムレベル・狙いから入力を組む。白のベースから始める
 * (開始の指輪が空 = 変成・増強 → 王者 / 変成 → エッセンス の形を比べる)。費用は高貴建て
 */
import { simulateTreeChunked, type SimCtx, type SimNode, type SimResult, type SimState } from "../../services/htc/sim-route";
import { buildHtcPrices } from "../../services/htc/prices";
import { maxQualityForBase } from "../../services/htc/catalysing";
import { tierWeight } from "../../services/htc/step-odds";
import { fillHashes, jaOfMod } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { indexPrices, pricesForBase } from "../../vendor/poe2htc/optimizer/cost";
import { limitsOf } from "../../vendor/poe2htc/engine/item";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";
import { marketStore } from "../../state/market-store";
import { catalystOk } from "../htc-craft/sim-setup";
import { chaosSideFor, type AutoTreeInput } from "../htc-craft/tree-auto";
import { pickAutoTree } from "../htc-craft/auto-pick";

export interface SimTarget { modId: string; minTierIndex: number }

export interface StageSimResult {
  nodes: SimNode[];
  /** 採った組み方の名前 (計算機の候補の名前) */
  route: string;
  result: SimResult;
  /** 1 個できるまでの費用の平均 (高貴建て、失敗した回の分も込み) */
  perDone: number;
}

/** 相場の取り直しの目安 (計算機と同じく 10 分) */
const PRICE_MAX_AGE_MS = 10 * 60 * 1000;

/** その狙い (段以上) がその側に 1 回付いた時に出る確率 (計算機の spawnChance と同じ数え方) */
function spawnChance(data: PatchData, cls: ItemBase, itemLevel: number, t: TierTarget): number | null {
  const m = data.mods.get(t.modId);
  if (!m || m.source !== "normal") return null;
  const w = (id: string, minIdx: number): number => {
    const x = data.mods.get(id);
    return x ? tierWeight(x, minIdx, itemLevel) : 0;
  };
  const pool = (cls.pools.normal[m.type === "prefix" ? "prefixes" : "suffixes"] ?? []).reduce((a, id) => a + w(id, 0), 0);
  return pool > 0 ? w(t.modId, t.minTierIndex ?? 0) / pool : null;
}

/**
 * 白のベースから狙いを全部付けるまでを回す。runs = 本番の回数 (候補を選ぶ所は計算機と同じ 150 回ずつ)。
 * onProgress は本番の回した数。shouldStop が true を返したら途中で止める (null を返す)
 */
export async function simulateStage(o: {
  data: PatchData;
  cls: ItemBase;
  baseEn: string;
  itemLevel: number;
  targets: readonly SimTarget[];
  runs?: number;
  onPhase?: (phase: "prices" | "pick" | "run") => void;
  onProgress?: (done: number, total: number) => void;
}): Promise<StageSimResult | null> {
  o.onPhase?.("prices");
  await marketStore.ensureMarket(PRICE_MAX_AGE_MS);
  const prices = pricesForBase(indexPrices(buildHtcPrices().file), o.cls);
  const lim = limitsOf(o.cls);
  const limits = { prefix: lim.prefixes, suffix: lim.suffixes };
  const ctx: SimCtx = {
    data: o.data, cls: o.cls, prices, itemLevel: o.itemLevel, limits,
    catalystOk: catalystOk(prices),
    baseQuality: maxQualityForBase(o.baseEn),
    craftedLimit: lim.crafted ?? 1,
    socketCost: 0,
  };
  const start: SimState = { slots: [], breach: false };
  const targets: TierTarget[] = o.targets.map((t) => ({ modId: t.modId, minTierIndex: t.minTierIndex }));
  const inp: AutoTreeInput = {
    data: o.data, prices, targets, fixedIds: [],
    qualityTag: null, qualityPct: null,
    baseQuality: ctx.baseQuality,
    chaosOk: true,
    protectedSides: [],
    desecratedTaken: false,
    chaosSide: chaosSideFor(start, limits),
    chance: (t) => spawnChance(o.data, o.cls, o.itemLevel, t),
    limits,
    craftedLimit: ctx.craftedLimit ?? 1,
    fixedSides: [],
    startCount: { prefix: 0, suffix: 0 },
    startLoose: { prefix: 0, suffix: 0 },
    startKeep: { prefix: 0, suffix: 0 },
  };
  o.onPhase?.("pick");
  const pick = await pickAutoTree(inp, ctx, start);
  if (!pick.nodes.length) return null;
  o.onPhase?.("run");
  const runs = o.runs ?? 1000;
  const result = await simulateTreeChunked({ ctx, start, nodes: pick.nodes, runs }, o.onProgress);
  // 候補の名前の内部の区別 (偉大なる高貴の使い方 catalyst / all) は画面では外す
  const route = pick.greater.replace(/・(catalyst|all)(?=・|$)/g, "");
  return { nodes: pick.nodes, route, result, perDone: result.perDone };
}

/** 手の種類の日本語 (計算機の作り方のツリーと同じ名前 + 白から始める手) */
const KIND: Record<string, string> = {
  chaos: "カオス", exalt: "高貴", annul: "消去", essence: "エッセンス", desecrate: "冒涜", light: "光 + 消去",
  breach: "ブリーチ", whittle: "削減", quality: "品質", check: "確認", abyss: "深淵の印",
  magicEssence: "変成 → エッセンス", transmute: "変成", augment: "増強", regal: "王者", fracture: "フラクチャー", socket: "ソケットに差す",
};

/** 手 1 つの文 (「高貴 → 最大ライフ」) */
export function nodeLabel(data: PatchData, n: SimNode): string {
  if (!n.action) return "打つ物まだ";
  const a = n.action as { kind: string; modId?: string };
  // 狙いは段の値で (「最大ライフ (85-99) (T2 以上)」)。エッセンスは付く物そのもの
  const aims = a.kind === "essence" && a.modId ? [{ modId: a.modId, minTier: -1 }] : n.targets;
  const aim = aims.map((t) => {
    const m = data.mods.get(t.modId);
    if (!m) return t.modId;
    const tier = t.minTier >= 0 ? m.tiers[t.minTier] : undefined;
    const text = fillHashes(jaOfMod(m), tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ");
    return tier ? `${text} (T${m.tiers.length - t.minTier} 以上)` : text.replace(/\s*#%?/g, "");
  });
  return [KIND[a.kind] ?? a.kind, aim.join(" / ")].filter(Boolean).join(" → ");
}
