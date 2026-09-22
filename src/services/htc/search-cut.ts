/**
 * search-cut.ts — 投げる前に削る (2026-09-23)
 *
 * オーナー指示:「どうやったら試算と信号を減らせるかな。結局無駄に資産を減らしたくないって話」。
 *
 * ## 素直にやると破綻する
 * 狙いが 5 個なら、「どれを買ってどれを作るか」の組み合わせは 2 個買い 10 + 3 個買い 10 +
 * 4 個買い 5 = **25 通り**。全部投げると 25 x 10.5 秒 = **4 分半**で、5 分 30 回の枠をほぼ使い切ります。
 * 試算のほうも 25 回 MDP を解くので分単位。**両方とも持ちません**。
 *
 * ## 一番効く削り — 上位集合はタダで付いてくる
 * 取引所の条件は「**この stat を持っている物**」であって「これだけ持っている物」ではありません。
 * つまり `{キャストスピード}` で投げると、**キャストスピード + ライフ + 耐性**の物も返ります。
 *
 * したがって投げる価値があるのは、残した組み合わせのうち**極小のものだけ**。上位集合は
 * 1 本も投げずに、同じ検索の結果から拾えます。実測 (Rage Grip / 5 目標):
 *
 *   全部投げる          25 回 = 262 秒
 *   極小だけ投げる       5 回 =  53 秒   ← 同じ物が見つかる
 *
 * ## 次に効く削り — 高い MOD が乗っていない組は投げない
 * 費用は 1 個に偏ります (実測: キャストスピード 4,189 神 / 他は 7〜43 神、**全体の 46%**)。
 * 高いほうが乗っていない組を買っても、**一番高い所が残ったまま**なので値段はほとんど下がりません。
 * `soloCosts` は既に出ているので、この足切りは**タダ**です (MDP を解き直しません)。
 *
 * ## 試算を減らすのも同じ理屈
 * 組み合わせごとに先に解くのをやめ、**返ってきた出品の実際の構成だけ**解きます。
 * 5 件見るなら 5 回。25 回の総当たりは要りません。
 *
 * ## ここは投げません
 * 組み立てて数えるだけです ([[api-probing-policy]])。
 */
import { SEARCH_INTERVAL_SEC, SEARCH_BUDGET_PER_5MIN } from "./search-plan";
import type { SoloCost } from "./solo-cost";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";

/** 投げると決めた 1 本 */
export interface CutSearch {
  /** 買う対象の MOD */
  bought: readonly TierTarget[];
  /** 上から順に価値が高い */
  rank: number;
  /** この検索が肩代わりする組み合わせの数 (自分を含む) */
  covers: number;
  /** その組の `soloCosts` の合計 (高貴建て)。並べ替えの物差し */
  worth: number;
}

/** 投げないと決めた 1 本 */
export interface CutDrop {
  bought: readonly TierTarget[];
  /** なぜ投げないか */
  why: string;
  /** 肩代わりしてくれる検索 (上位集合の時だけ) */
  coveredBy?: readonly TierTarget[];
}

export interface SearchCut {
  fire: CutSearch[];
  dropped: CutDrop[];
  /** 投げる回数 */
  signals: number;
  /** かかる秒数 (10.5 秒間隔) */
  seconds: number;
  /** 5 分 30 回の枠に収まるか */
  withinBudget: boolean;
  /** 削る前の組み合わせ数 */
  before: number;
}

export interface SearchCutOptions {
  /**
   * 「高い MOD」の線引き。費用の高い順に足していって、この割合を超えるまでを高いとみなす。
   * 既定 0.7 = **上位で 7 割を占める MOD**まで。
   */
  dominantShare?: number;
  /** 投げる上限。既定は 5 分の枠の半分 (残りを固定済み探しに残す) */
  maxSignals?: number;
}

const keyOf = (ts: readonly TierTarget[]): string => ts.map((t) => t.modId).sort().join("|");
const idsOf = (ts: readonly TierTarget[]): Set<string> => new Set(ts.map((t) => t.modId));
const isSubset = (a: Set<string>, b: Set<string>): boolean => {
  for (const x of a) if (!b.has(x)) return false;
  return true;
};

/**
 * 「どれを買うか」の候補から、**実際に投げる本数**まで削ります。
 *
 * `combos` は `partialStarts` が出す組み合わせ (買う対象の並び)。`solo` は ③ の 1 個ずつの費用で、
 * **既に出ているものを使い回すだけ**です ── ここで MDP は 1 回も解きません。
 */
export function searchCut(
  combos: readonly (readonly TierTarget[])[],
  solo: readonly SoloCost[],
  opts: SearchCutOptions = {},
): SearchCut {
  const cost = new Map(solo.map((s) => [s.modId, s.expectedCost]));
  const worthOf = (ts: readonly TierTarget[]): number =>
    ts.reduce((sum, t) => sum + (cost.get(t.modId) ?? 0), 0);

  // ---- 1. 高い MOD を決める (費用の高い順に、割合が閾値を超えるまで) ----
  const ranked = [...solo].sort((a, b) => b.expectedCost - a.expectedCost);
  const total = ranked.reduce((s, r) => s + r.expectedCost, 0);
  const share = opts.dominantShare ?? 0.7;
  const dominant = new Set<string>();
  let acc = 0;
  for (const r of ranked) {
    dominant.add(r.modId);
    acc += r.expectedCost;
    if (total > 0 && acc / total >= share) break;
  }

  const dropped: CutDrop[] = [];
  // ---- 2. 高い MOD が 1 つも乗っていない組は落とす ----
  const kept = combos.filter((ts) => {
    if (ts.some((t) => dominant.has(t.modId))) return true;
    dropped.push({ bought: ts, why: "一番高い MOD が乗っていないので、買っても値段がほとんど下がりません" });
    return false;
  });

  // ---- 3. 上位集合を畳む (極小元だけ投げる) ----
  const sets = kept.map((ts) => ({ ts, ids: idsOf(ts) }));
  const minimal = sets.filter((a) => !sets.some((b) => b !== a && b.ids.size < a.ids.size && isSubset(b.ids, a.ids)));
  const minimalKeys = new Set(minimal.map((m) => keyOf(m.ts)));
  for (const a of sets) {
    if (minimalKeys.has(keyOf(a.ts))) continue;
    const by = minimal.find((m) => isSubset(m.ids, a.ids));
    dropped.push({
      bought: a.ts,
      why: "条件を満たす出品は上の検索でも返るので、投げ直す必要がありません",
      ...(by ? { coveredBy: by.ts } : {}),
    });
  }

  // ---- 4. 価値の高い順に、枠まで ----
  const cap = opts.maxSignals ?? Math.floor(SEARCH_BUDGET_PER_5MIN / 2);
  const sorted = minimal
    .map((m) => ({
      bought: m.ts,
      worth: worthOf(m.ts),
      covers: sets.filter((a) => isSubset(m.ids, a.ids)).length,
    }))
    .sort((a, b) => b.worth - a.worth);
  const fire: CutSearch[] = sorted.slice(0, cap).map((x, i) => ({ ...x, rank: i + 1 }));
  for (const x of sorted.slice(cap)) {
    dropped.push({ bought: x.bought, why: `1 回の枠 (${cap} 本) に入りませんでした` });
  }

  const signals = fire.length;
  return {
    fire,
    dropped,
    signals,
    seconds: Math.round(signals * SEARCH_INTERVAL_SEC),
    withinBudget: signals <= SEARCH_BUDGET_PER_5MIN,
    before: combos.length,
  };
}
