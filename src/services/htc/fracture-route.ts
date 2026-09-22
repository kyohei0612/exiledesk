/**
 * fracture-route.ts — フラクチャーオーブで MOD を固定してから作る (2026-09-22)
 *
 * オーナー指示:「フラクチャー入れて」。実在のレシピ (Absent Amulet の +5 スキルアミュレット) が
 * フラクチャー前提で組まれていたので入れる。
 *
 * ## 何をする物か (クライアントの説明そのまま)
 *   「4 個以上のモッドを持つレアアイテム上の**ランダムなモッド 1 個**をフラクチャーし固定する」
 *
 * 固定された MOD は**消去のオーブで消えません**。だから「いい MOD を固定して、残りを冒涜と消去で
 * 回す」ができます。狙って固定はできず、**その時点の MOD 数ぶんの 1** で当たります。
 * 4 個ちょうどで打つのが一番当たる (1/4 = 25%)。
 *
 * ## 上流との分担
 * 同梱エンジンは**固定された状態は正しく扱います** (`probability.ts` が除去の候補から外す)。
 * ですが「ここで固定する」という**手は持っていません**。だからここが足します。
 * 上流の `data/` にもコードにも手は入れず、**固定済みの状態から解かせる**ことで実現しています
 * ([[partial-start.ts]] が「買った物から解く」のと同じやり方)。
 *
 * ## 出す数字の切り分け
 * **確率と「固定後の費用」は engine の答えそのもの**で、ここの創作は入っていません。
 * 一方「固定するまでにいくらかかるか」は、外した時にどうするか次第です
 * (別の MOD が固定された物は、この道筋では使えません)。そこは**部品を出して呼び出し側に任せます**。
 */
import { markovFromItem } from "../../vendor/poe2htc/optimizer/markovFromItem";
import { jaOfPriceKey } from "./labels";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { ItemBase, ItemState, PatchData, PlacedMod } from "../../vendor/poe2htc/engine/types";

/** フラクチャーオーブが要求する最低の MOD 数 (クライアントの説明) */
export const FRACTURE_MIN_MODS = 4;

/** 値段表のキー。`price-keys.json` の `currency.fracture` */
const FRACTURE_KEY = "fracture";

export interface FractureOption {
  /** 固定する MOD */
  lockedModId: string;
  /** 打つ時の MOD 数。少ないほど当たりやすいので既定は 4 */
  modsWhenFracturing: number;
  /** 狙いの MOD に当たる確率 (= 1 / MOD 数) */
  hitChance: number;
  /** 当てるまでに要るオーブの本数 (期待値) */
  expectedOrbs: number;
  /** オーブ代の合計 (高貴建て)。値段が無ければ null */
  orbCost: number | null;
  /** **固定できた後**、残りを作る期待費用 (高貴建て)。engine の答え */
  finishCost: number | null;
  /** 固定せずに最後まで作る期待費用 (比較の基準) */
  plainCost: number | null;
  /** 固定したことで費用が何分の 1 になるか。1 より大きいほど得 */
  timesCheaper: number | null;
  /** 収束したか。false の時 `finishCost` は目安 */
  converged: boolean;
}

export interface FractureResult {
  /** 固定せずに作る場合 */
  plainCost: number | null;
  /** 得な順 */
  options: FractureOption[];
  /** フラクチャーオーブの日本語名 */
  orbJa: string;
  ms: number;
}

/** その MOD を固定した状態のレアを作る */
function fracturedItem(data: PatchData, cls: ItemBase, level: number, t: TierTarget): ItemState | null {
  const mod = data.mods.get(t.modId);
  if (!mod) return null;
  const i = Math.max(0, Math.min(mod.tiers.length - 1, t.minTierIndex ?? mod.tiers.length - 1));
  const tier = mod.tiers[i];
  if (!tier) return null;
  const placed: PlacedMod = {
    modId: mod.id,
    tierName: tier.name,
    // ここが肝。固定された MOD は消去の候補から外れる
    fractured: true,
    ...(mod.source === "desecrated" ? { desecrated: true } : {}),
  };
  const isPrefix = mod.type === "prefix";
  return {
    base: cls,
    level,
    rarity: "rare",
    prefixes: isPrefix ? [placed] : [],
    suffixes: isPrefix ? [] : [placed],
    ...(mod.source === "desecrated" ? { desecrated: true } : {}),
  };
}

/**
 * 「どの MOD を固定すると、どれくらい楽になるか」を並べる。
 *
 * @param targets 狙う MOD 全部
 * @param opts.modsWhenFracturing 何 MOD の状態で打つか (既定 4 = 一番当たる)
 */
export function fractureOptions(
  data: PatchData,
  prices: Prices,
  cls: ItemBase,
  targets: readonly TierTarget[],
  opts: { level?: number; modsWhenFracturing?: number; plainCost?: number | null } = {},
): FractureResult {
  const t0 = Date.now();
  const level = opts.level ?? 82;
  const mods = Math.max(FRACTURE_MIN_MODS, opts.modsWhenFracturing ?? FRACTURE_MIN_MODS);
  const hitChance = 1 / mods;
  const orbPrice = prices.currency[FRACTURE_KEY] ?? null;
  const orbJa = jaOfPriceKey(FRACTURE_KEY) ?? "フラクチャーオーブ";

  const options: FractureOption[] = [];
  for (const t of targets) {
    const start = fracturedItem(data, cls, level, t);
    if (!start) continue;
    // 固定した 1 個は済んでいるので、残りだけを目標にする
    const rest = targets.filter((x) => x.modId !== t.modId);
    if (rest.length === 0) continue;
    const res = markovFromItem(data, prices, start, rest, {});
    const finishCost = res.feasible && Number.isFinite(res.expectedCost) ? res.expectedCost : null;
    const expectedOrbs = 1 / hitChance;
    options.push({
      lockedModId: t.modId,
      modsWhenFracturing: mods,
      hitChance,
      expectedOrbs,
      orbCost: orbPrice != null ? orbPrice * expectedOrbs : null,
      finishCost,
      plainCost: opts.plainCost ?? null,
      timesCheaper:
        opts.plainCost != null && finishCost != null && finishCost > 0 ? opts.plainCost / finishCost : null,
      converged: res.converged,
    });
  }
  options.sort((a, b) => (a.finishCost ?? Infinity) - (b.finishCost ?? Infinity));
  return { plainCost: opts.plainCost ?? null, options, orbJa, ms: Date.now() - t0 };
}
