/**
 * start-from.ts — 「どの MOD が付いた物を買って、そこから作るのが一番いいか」(2026-09-22)
 *
 * オーナー指示:「ベースをどれにしたら一番確率が高いかも出して欲しい。ベースで買った方が
 * 絶対に安く済むでしょ」「たとえば一番つきにくいスキルレベル+を買って、そこからクラフトなのか
 * みたいなところ」。
 *
 * ## 考え方
 * 白から 6 個そろえる確率は 1 / 57 億。でも**一番付きにくい 1 個が既に付いた物**を買えば、
 * 残りを作るだけで済みます。実際のクラフトはほぼこれです。
 *
 * ここは目標 1 個ずつについて「**それが付いた物を買った場合**、残りを作るのがどれくらいか」を
 * 出して並べます。併せて「その 1 個だけ付いた物」を取引所で引く条件も返すので、
 * **買値 + 残りの作成費**で比べられます。
 *
 * ## 出てくる数字の読み方
 * 確率は**線形** (外したら作り直す) の 1 回あたりです。手順を見て比べるための物で、
 * 予算には MDP の数字を使ってください ([[budget.ts]])。
 * 買値のほうは呼び出し側が取引所から取ります (ここは叩きません)。
 */
import { planPreview, type PlanOption } from "./plan";
import { buildFinishedQuery } from "./buy-or-craft";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { ItemBase, ItemState, PatchData, PlacedMod } from "../../vendor/poe2htc/engine/types";

/** 1 つの「これが付いた物を買う」案 */
export interface StartFromOption {
  /** 買う物に既に付いている MOD */
  boughtModId: string;
  /** その MOD のティア名 (「of the Sorcerer」) */
  tierName: string;
  /** 残りを作る手順 (当たりやすい順)。空なら作れない */
  plans: PlanOption[];
  /** 残りを 1 回で作り切る確率 (0-1)。作れなければ 0 */
  probability: number;
  /** 白から全部作る場合と比べて何倍当たりやすくなるか */
  timesBetter: number | null;
  /**
   * 「その MOD だけ付いた物」を取引所で引く条件。カテゴリが未確認のクラスは null。
   * 買値はこれで引いて、残りの作成費と足す。
   */
  buyQuery: ReturnType<typeof buildFinishedQuery>;
}

export interface StartFromResult {
  /** 白から全部作る場合の確率 (比較の基準) */
  fromWhite: number;
  /** 当たりやすい順 */
  options: StartFromOption[];
  ms: number;
}

/** 目標のティア (未指定なら最上位) */
function tierIndexOf(data: PatchData, t: TierTarget): number {
  const mod = data.mods.get(t.modId);
  if (!mod) return 0;
  return Math.max(0, Math.min(mod.tiers.length - 1, t.minTierIndex ?? mod.tiers.length - 1));
}

/** その MOD が既に付いたレアを作る (買った物の代わり) */
function itemWith(data: PatchData, cls: ItemBase, level: number, t: TierTarget): ItemState | null {
  const mod = data.mods.get(t.modId);
  if (!mod) return null;
  const tier = mod.tiers[tierIndexOf(data, t)];
  if (!tier) return null;
  const placed: PlacedMod = {
    modId: mod.id,
    tierName: tier.name,
    ...(mod.source === "desecrated" ? { desecrated: true } : {}),
  };
  const isPrefix = mod.type === "prefix";
  return {
    base: cls,
    level,
    // 1 つ付いた状態はマジック。残りはそこから足していく
    rarity: "magic",
    prefixes: isPrefix ? [placed] : [],
    suffixes: isPrefix ? [] : [placed],
    ...(mod.source === "desecrated" ? { desecrated: true } : {}),
  };
}

/**
 * 「どれが付いた物を買うのが一番いいか」を並べる。
 *
 * @param targets 狙う MOD 全部
 */
export function startFromOptions(
  data: PatchData,
  prices: Prices,
  cls: ItemBase,
  targets: readonly TierTarget[],
  opts: { level?: number } = {},
): StartFromResult {
  const t0 = Date.now();
  const level = opts.level ?? 82;
  const whole = planPreview(data, prices, cls, targets, { level });
  const fromWhite = whole.options[0]?.probability ?? 0;

  const options: StartFromOption[] = [];
  for (const t of targets) {
    const mod = data.mods.get(t.modId);
    if (!mod) continue;
    const rest = targets.filter((x) => x.modId !== t.modId);
    if (rest.length === 0) continue;
    const start = itemWith(data, cls, level, t);
    if (!start) continue;
    // 残りを作る手順。**買った 1 個は既に乗っているので目標から外す**
    const pv = planPreview(data, prices, cls, rest, { level });
    const p = pv.options[0]?.probability ?? 0;
    options.push({
      boughtModId: t.modId,
      tierName: mod.tiers[tierIndexOf(data, t)]?.name ?? "",
      plans: pv.options,
      probability: p,
      timesBetter: fromWhite > 0 && p > 0 ? p / fromWhite : null,
      buyQuery: buildFinishedQuery(data, cls, [t], { ilvlMin: level }),
    });
  }
  options.sort((a, b) => b.probability - a.probability);
  return { fromWhite, options, ms: Date.now() - t0 };
}
