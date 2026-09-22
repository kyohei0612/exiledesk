/**
 * listing-value.ts — 出品 1 件を「その値段で買う価値があるか」に直す (2026-09-23)
 *
 * オーナー指示:「右側、左側の消去のお告げが有効。ただしこれはフラクチャーしてた MOD で
 * 検索の仕方がめっちゃ多い。例えばフラクチャーマナコストとして、プレフィックスにゴミ 1 MOD、
 * サフィに欲しい MOD 2 MOD とかで売ってたら、左側消去 + 消去で確定で消せたりする。
 * その額と売値比べてどっちがお得かみたいな検索の仕方でいける」。
 *
 * ## 固定済みが効く理由
 * **固定された MOD は消去の抽選から外れます。**だから「その側に残っている消せる MOD が
 * 全部ゴミ」になれば、側のお告げ付きの消去は**確率 1 で当たり**ます。運ではなく手順になる。
 *
 * ## エンジンの穴を 1 つ埋めている
 * 上流は「**目標でない固定済み MOD は、ただの消せるゴミとして扱う**」と明記しています
 * (markovFromItem の DOCUMENTED APPROXIMATIONS)。創生の樹の MOD のように**エンジンが
 * 知らない**物が固定されて乗っている時、これだと「消さないといけないゴミ」に見えて、
 * 実際には要らない消去を 1 回多く見積もります。
 *
 * ここでは**枠を 1 つ潰す物**として扱います (消えないので、永久にその枠に居座るのが正しい)。
 * 実測 (指輪 / サフィックス 2 個が既に乗った状態、プレフィックスに固定済み 1 + ゴミ 1):
 *   ゴミ扱い (上流のまま)   5,990.6 高貴
 *   枠扱い (ここ)           5,263.8 高貴   ← **727 高貴 (12%) 安い**
 *
 * ## 側のお告げは「効く」が「使うとは限らない」
 * 確定で消せることと、そうすべきことは別です。手元の相場だと**左側の消去のお告げは
 * 7,599 高貴**で、上の craft 丸ごとより高い。ソルバは確率 1/3 の素の消去を選びます。
 * だから**確定かどうかと値段を両方返します** ── どちらを打つかは値段が決めることで、
 * 「確定だから偉い」ではありません。
 */
import { markovFromItem } from "../../vendor/poe2htc/optimizer/markovFromItem";
import { withEssenceAlternatives } from "./essence-route";
import { withCatalysing } from "./catalysing";
import { budgetForBuy } from "./partial-start";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { ItemBase, ItemState, PatchData, PlacedMod } from "../../vendor/poe2htc/engine/types";

/** 出品に乗っている 1 行 */
export interface ListingMod {
  /** エンジンが知っている MOD の id。知らない行 (創生の樹など) は null */
  modId: string | null;
  side: "prefix" | "suffix";
  /** 固定済みか */
  fractured?: boolean;
  /**
   * **消してはいけない**が、狙いにも入っていない MOD。
   *
   * 創生の樹からしか出ない MOD がこれです。狙いの一部ではないのに、**一度消すと二度と
   * 付けられない**ので、ゴミとして扱って消しに行くと出品ごと死にます。枠を潰す物として
   * 扱い、固定されていなければ「飛ぶ危険がある」と別に数えます。
   */
  keep?: boolean;
  /** 乗っている段 (`mod.tiers` の添字)。分からなければ省略 */
  tierIndex?: number;
}

export interface SideVerdict {
  side: "prefix" | "suffix";
  /** その側の、消せる (固定されていない) ゴミの数 */
  junk: number;
  /** その側の、消せる狙いの MOD の数。0 ならお告げ付き消去は確定 */
  riskyTargets: number;
  /** 側のお告げ付きの消去で、狙いを飛ばさずに消せるか */
  deterministic: boolean;
  /** その側のお告げの値段 (高貴建て)。相場に無ければ null */
  omenPrice: number | null;
}

export interface ListingValue {
  /** ここから仕上げる期待費用 (高貴建て) */
  finish: number;
  /** 完成品の売値を渡した時、この出品に出せる上限。出せなければ null */
  budget: number | null;
  /** 解けたか */
  feasible: boolean;
  reason?: string;
  /** 固定済みで永久に潰れている枠 */
  locked: { prefixes: number; suffixes: number };
  /** 消さないといけないゴミ */
  junk: { prefixes: number; suffixes: number };
  /** 既に乗っている狙いの数 (段が足りている物だけ) */
  held: number;
  /**
   * **固定済みなのに段が足りない狙い。**固定された MOD は外せないので、この出品では
   * その狙いに**永久に届きません**。1 件でもあれば、いくら安くても買ってはいけない。
   */
  dead: { modId: string; has: string; need: string }[];
  /**
   * **消してはいけないのに固定されていない MOD。**枠として数えて解いているので、この分は
   * 費用に出てきません。カオスや消去を打つ手順なら、実際には飛ぶ危険があります。
   * 空でなければ「先に分裂で固定する」か「飛ばさない手順で行く」かの判断が要ります。
   */
  atRisk: { side: "prefix" | "suffix"; modId: string | null }[];
  sides: SideVerdict[];
}

const OMEN_OF_SIDE: Record<"prefix" | "suffix", string> = {
  prefix: "OmenofSinistralAnnulment",
  suffix: "OmenofDextralAnnulment",
};

/**
 * 出品 1 件を評価します。**取引所は叩きません** ── 既に手元にある出品の中身を渡してください。
 *
 * `listingPrice` を渡すと「売値 − 仕上げ費用」から買値の上限も返します。
 */
export function listingValue(
  data: PatchData,
  prices: Prices,
  cls: ItemBase,
  targets: readonly TierTarget[],
  mods: readonly ListingMod[],
  opts: { level?: number; listingDivineAsExalted?: number } = {},
): ListingValue {
  const level = opts.level ?? 82;
  const wanted = new Map(targets.map((t) => [t.modId, t]));

  // ---- 1. 乗っている物を 3 つに仕分ける ----
  const locked = { prefixes: 0, suffixes: 0 };
  /** 固定済みなのに段が足りず、**永久に直せない**狙い */
  const dead: { modId: string; has: string; need: string }[] = [];
  /** 消してはいけないのに固定されていない = 手順の途中で飛びうる物 */
  const atRisk: { side: "prefix" | "suffix"; modId: string | null }[] = [];
  const junk = { prefixes: 0, suffixes: 0 };
  const placed: { prefix: PlacedMod[]; suffix: PlacedMod[] } = { prefix: [], suffix: [] };
  const heldIds = new Set<string>();
  for (const m of mods) {
    const key = m.side === "prefix" ? "prefixes" : "suffixes";
    const target = m.modId ? wanted.get(m.modId) : undefined;
    if (target && m.modId) {
      // 狙いと同じ MOD。固定済みならそのまま印を付けて置く (上流が消去の抽選から外してくれる)
      const mod = data.mods.get(m.modId)!;
      const need = target.minTierIndex ?? 0;
      const ti = m.tierIndex ?? mod.tiers.length - 1;
      placed[m.side].push({
        modId: m.modId,
        tierName: String(mod.tiers[ti]?.name ?? ""),
        ...(m.fractured ? { fractured: true } : {}),
      });
      // **段が足りているかを見ること。**乗ってはいるが段が下だと、それは「済み」ではなく
      // **その family を塞いでいる**状態で、外してから引き直す必要があります。
      // ここを見ずに済み扱いにすると、直さないといけない物を数えないまま安い答えを出します。
      if (ti >= need) heldIds.add(m.modId);
      else if (m.fractured) {
        // 固定されていて段が下 = **二度と外せない**。この狙いは永久に達成できません。
        dead.push({ modId: m.modId, has: String(mod.tiers[ti]?.name ?? ""), need: String(mod.tiers[need]?.name ?? "") });
      }
      continue;
    }
    if (m.fractured || m.keep) {
      // **狙いでない固定済み / 消してはいけない物は枠を潰す物**。消えない (消さない) ので、
      // ゴミとして数えると要らない消去を 1 回余計に見積もります (ファイル先頭の実測)
      locked[key]++;
      // 固定されていない「消してはいけない物」は、カオスでも消去でも**飛びます**。
      // 枠として扱うと解は安く出るので、危ないことは別に数えて必ず画面に出す
      if (m.keep && !m.fractured) atRisk.push({ side: m.side, modId: m.modId });
      continue;
    }
    junk[key]++;
  }

  // ---- 2. 潰れた枠をベースから引く ----
  const baseLimits = cls.limits ?? { prefixes: 3, suffixes: 3, crafted: 1 };
  const solving: ItemBase = {
    ...cls,
    limits: {
      ...baseLimits,
      prefixes: Math.max(0, baseLimits.prefixes - locked.prefixes),
      suffixes: Math.max(0, baseLimits.suffixes - locked.suffixes),
    },
  };

  // ---- 3. ゴミは実体を置く (jp/js に数えてもらうため) ----
  const junkFiller = (side: "prefix" | "suffix", used: Set<string>): PlacedMod | null => {
    const pool = side === "prefix" ? solving.pools.normal.prefixes : solving.pools.normal.suffixes;
    for (const id of pool) {
      if (used.has(id) || wanted.has(id)) continue;
      const mod = data.mods.get(id);
      if (!mod) continue;
      used.add(id);
      return { modId: id, tierName: String(mod.tiers[0]?.name ?? "") };
    }
    return null;
  };
  const used = new Set<string>(heldIds);
  for (let i = 0; i < junk.prefixes; i++) {
    const f = junkFiller("prefix", used);
    if (f) placed.prefix.push(f);
  }
  for (let i = 0; i < junk.suffixes; i++) {
    const f = junkFiller("suffix", used);
    if (f) placed.suffix.push(f);
  }

  const start: ItemState = {
    base: solving,
    level,
    rarity: "rare",
    prefixes: placed.prefix,
    suffixes: placed.suffix,
  };

  // ---- 4. 側ごとの見立て ----
  const sides: SideVerdict[] = (["prefix", "suffix"] as const).map((side) => {
    const key = side === "prefix" ? "prefixes" : "suffixes";
    const riskyTargets = placed[side].filter((pm) => wanted.has(pm.modId) && !pm.fractured).length;
    const j = junk[key];
    return {
      side,
      junk: j,
      riskyTargets,
      deterministic: j > 0 && riskyTargets === 0,
      omenPrice: prices.omens[OMEN_OF_SIDE[side]] ?? null,
    };
  });

  // ---- 5. 残りを解く ----
  if (dead.length > 0) {
    return {
      finish: Infinity, budget: null, feasible: false,
      reason: `固定済みの段が足りません (${dead.map((d) => `${d.modId} は ${d.has}、${d.need} 以上が要る`).join(" / ")})。`
        + "固定された MOD は外せないので、この出品からは永久に届きません。",
      locked, junk, held: heldIds.size, dead, atRisk, sides,
    };
  }
  const rest = targets.filter((t) => !heldIds.has(t.modId));
  if (rest.length === 0 && junk.prefixes === 0 && junk.suffixes === 0) {
    return {
      finish: 0, budget: opts.listingDivineAsExalted ?? null, feasible: true,
      locked, junk, held: heldIds.size, dead, atRisk, sides,
    };
  }
  const r = markovFromItem(data, prices, start, withEssenceAlternatives(data, solving, rest, level), {
    ...withCatalysing(data, solving, rest),
  });
  return {
    finish: r.expectedCost,
    budget: opts.listingDivineAsExalted != null && r.feasible
      ? budgetForBuy(opts.listingDivineAsExalted, r.expectedCost)
      : null,
    feasible: r.feasible,
    ...(r.reason ? { reason: r.reason } : {}),
    locked, junk, held: heldIds.size, dead, atRisk, sides,
  };
}
