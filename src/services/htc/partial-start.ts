/**
 * partial-start.ts — 「途中まで出来ている物を買って、そこから仕上げる」(2026-09-22)
 *
 * オーナー指示:「基本白から始めることはなさそうだね。ベース買おうか、それもマジックなら
 * 2 MOD もしくは 1 MOD で金額みてどっちから行くか決めたらいい。そもそもベースがあれば
 * 3 MOD でも 4 MOD でも安いなら買うべきで」。
 *
 * ## なぜ要るか
 * 白から 6 個そろえるのは 1 / 7776 万で、現実の手順ではありません。実際は**途中まで出来た物を
 * 買って**残りを足します。比べるべきは確率ではなく **買値 + 残りの作成費** の合計です。
 *
 * ここは目標の**部分集合**を全部並べて、それぞれについて
 *   - 買う物のレアリティと枠の内訳
 *   - その物を取引所で引く条件 (買値は呼び出し側が取る。ここは叩きません)
 *   - 残りを仕上げる期待費用 ([[budget.ts]] と同じ MDP)
 * を出します。
 *
 * ## 列挙は即時、費用は頼まれてから
 * 列挙と検索条件は一瞬で出ます。費用のほうは MDP なので**残りの個数で桁が変わります**
 * (実測 2026-09-22、イージスクォータースタッフ: 残り 6 個 643 秒 / 4 個 13 秒)。
 * だから [[plan.ts]] と同じ 2 段構えにして、`solveFinish` は選ばれた 1 件にだけ回します。
 *
 * ## マジックは 1 プレフィックス + 1 サフィックスまで
 * 2 MOD でも**両方プレフィックスならマジックでは組めません** (レアになる)。買える形かどうかは
 * ここで弾きます。逆に 2 MOD のレアは市場にほぼ出ません (レアは 3 個以上で湧くため)ので、
 * 1〜2 MOD はマジックで探すのが素直です。
 *
 * ## 余計な MOD は検索では弾けない
 * 取引所は「この stat を持つ」でしか絞れず、**MOD の総数では絞れません**。4 MOD 狙いで引いた物が
 * 5〜6 MOD 持っていることは普通にあり、枠が埋まっていれば消去のオーブが要ります。
 * ここが出す費用は**狙いの MOD だけが乗っている**前提です。実物は目で見てください。
 */
import { buildFinishedQuery } from "./buy-or-craft";
import { markovFromItem } from "../../vendor/poe2htc/optimizer/markovFromItem";
import { limitsOf } from "../../vendor/poe2htc/engine/item";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { ItemBase, ItemState, PatchData, PlacedMod, Rarity } from "../../vendor/poe2htc/engine/types";

/** 買い方 1 通り */
export interface PartialStart {
  /** 買う物に既に乗っている目標 */
  bought: readonly TierTarget[];
  /** 残りの目標 (これを作る) */
  rest: readonly TierTarget[];
  /** 買う物のレアリティ。マジックで組めない形はレア */
  rarity: Extract<Rarity, "magic" | "rare">;
  /** 枠の内訳 (画面の説明用) */
  prefixes: number;
  suffixes: number;
  /** 開始アイテム。`solveFinish` にそのまま渡す */
  start: ItemState;
  /** その物を取引所で引く条件。カテゴリが未確認のクラスは null */
  buyQuery: ReturnType<typeof buildFinishedQuery>;
}

/** 目標のティア (未指定なら最上位) */
function tierIndexOf(data: PatchData, t: TierTarget): number {
  const mod = data.mods.get(t.modId);
  if (!mod) return 0;
  return Math.max(0, Math.min(mod.tiers.length - 1, t.minTierIndex ?? mod.tiers.length - 1));
}

/** 部分集合を開始アイテムに組む。枠に入らなければ null */
function startFor(data: PatchData, cls: ItemBase, level: number, bought: readonly TierTarget[]): ItemState | null {
  const prefixes: PlacedMod[] = [];
  const suffixes: PlacedMod[] = [];
  let desecrated = false;
  for (const t of bought) {
    const mod = data.mods.get(t.modId);
    if (!mod) return null;
    const tier = mod.tiers[tierIndexOf(data, t)];
    if (!tier) return null;
    if (mod.source === "desecrated") desecrated = true;
    const placed: PlacedMod = {
      modId: mod.id,
      tierName: tier.name,
      ...(mod.source === "desecrated" ? { desecrated: true } : {}),
    };
    (mod.type === "prefix" ? prefixes : suffixes).push(placed);
  }
  const lim = limitsOf(cls);
  if (prefixes.length > lim.prefixes || suffixes.length > lim.suffixes) return null;
  // マジックは片側 1 個まで。それを超えたらレアでしか持てない
  const rarity: Rarity = prefixes.length <= 1 && suffixes.length <= 1 ? "magic" : "rare";
  return { base: cls, level, rarity, prefixes, suffixes, ...(desecrated ? { desecrated: true } : {}) };
}

/** `k` 個の部分集合を全部返す */
function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > items.length) return [];
  const out: T[][] = [];
  const walk = (i: number, acc: T[]): void => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let j = i; j < items.length; j++) {
      acc.push(items[j]!);
      walk(j + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

/**
 * 買える形を全部並べる。**解きません** (一瞬で返ります)。
 *
 * @param maxBought 買う物に乗っている MOD の上限。既定 4 (残り 2 個は必ず自分で足す)
 */
export function partialStarts(
  data: PatchData,
  cls: ItemBase,
  targets: readonly TierTarget[],
  opts: { level?: number; maxBought?: number; baseType?: string } = {},
): PartialStart[] {
  const level = opts.level ?? 82;
  // 全部買うのは「完成品を買う」なので、最低 1 個は残す
  const cap = Math.min(opts.maxBought ?? 4, Math.max(0, targets.length - 1));
  const out: PartialStart[] = [];
  for (let k = 1; k <= cap; k++) {
    for (const bought of combinations(targets, k)) {
      const start = startFor(data, cls, level, bought);
      if (!start) continue;
      const ids = new Set(bought.map((t) => t.modId));
      out.push({
        bought,
        rest: targets.filter((t) => !ids.has(t.modId)),
        rarity: start.rarity as "magic" | "rare",
        prefixes: start.prefixes.length,
        suffixes: start.suffixes.length,
        start,
        buyQuery: buildFinishedQuery(data, cls, bought, {
          ilvlMin: level,
          rarity: start.rarity,
          ...(opts.baseType ? { baseType: opts.baseType } : {}),
        }),
      });
    }
  }
  return out;
}

/** 残りを仕上げる期待費用 (高貴建て)。作れなければ Infinity */
export function solveFinish(
  data: PatchData,
  prices: Prices,
  o: PartialStart,
): { expectedCost: number; feasible: boolean; reason?: string; ms: number } {
  const t0 = Date.now();
  const r = markovFromItem(data, prices, o.start, o.rest, {});
  return {
    expectedCost: r.expectedCost,
    feasible: r.feasible,
    ...(r.reason ? { reason: r.reason } : {}),
    ms: Date.now() - t0,
  };
}

/**
 * **その買い方に出せる上限** (高貴建て)。
 *
 * 完成品の出品価格を予算に置いて、残りの作成費を引いた残りです。「レア 4 個乗った物が
 * 222 神までなら、買って仕上げたほうが完成品を買うより安い」という読み方をします。
 * 作成費だけで予算を食い切る買い方は null (どう安く買っても完成品に勝てない)。
 */
export function budgetForBuy(listingPrice: number, finishCost: number): number | null {
  if (!Number.isFinite(listingPrice) || !Number.isFinite(finishCost)) return null;
  const left = listingPrice - finishCost;
  return left > 0 ? left : null;
}
