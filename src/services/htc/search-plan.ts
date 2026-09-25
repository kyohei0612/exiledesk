/**
 * search-plan.ts — トレードに「何回投げるか」を先に決める (2026-09-23)
 *
 * オーナー指示:「トレード制限かからんように仕組化してからトレードでテストしよう。
 * テスト指示までトレードは使わんように。なんこ信号送らないといけないのか整理しなきゃ」。
 *
 * ## 制限 (実測済み、`services/trade2/pricing.ts`)
 *   - 検索は **10.5 秒間隔**
 *   - **5 分で 30 回**。超えると **30 分の罰則**
 * つまり素直に並べると **1 回 = 10.5 秒**、30 回で 5 分を使い切ります。**何を捨てるかが設計**です。
 *
 * ## 何から投げるか — ベースが律速
 * オーナー方針:「ベースに一番時間かけんとあかん」。作るのは速く、**始める物を見つけるのが遅い**。
 * だから投げる順は:
 *   1. **一番つきにくい MOD の固定済み** … これが 1 神で見つかれば桁が変わる
 *      (実測: 素から 2,015 神 → 固定済みから 231 神)
 *   2. 一番つきにくい MOD の**普通の出品** … 固定済みが無い / 高い時の代わり
 *   3. **狙いが何個か乗っている出品** … 「そこから作ったほうが速い」物を拾う
 *   4. 残りの MOD の固定済み … ここまで来たら優先度は低い
 *
 * ## 作れない MOD は**検索条件にも出来ません**
 * 創生の樹から落ちた指輪の MOD のように**クラフトでは付かない**物が狙いに入っていると、
 * 付いた物を買うしか道がありません。ところが**エンジンが知らない MOD なので、こちらからは
 * 検索条件を組めません** (stat が引けない)。だから:
 *   - 計画には**出しません** (組めない検索を出すと、投げても 0 件で枠を捨てるだけ)
 *   - 代わりに `mustBuySearchable: false` を返し、**手で探す必要がある**と画面で断ります
 * 「その MOD が乗ったベースを手で探す → 見つけたら貼り直す」が正しい順で、
 * そこからは**固定済みかどうかに関係なく**、乗っている MOD のぶん道が短くなります。
 *
 * ## 固定済みを探す価値が無いなら、その検索は出しません
 * オーナー指摘:「安全に決定論クラフトなら完成品ができる場合もあるだろうから、その場合は別に
 * フラクチャー品探さなくていいよね」。**固定して半分以下にならないなら外します**
 * ([[fracture-value.ts]])。検索 1 回は 10.5 秒で、枠は 5 分で 30 回しかありません。
 *
 * 実測 2026-09-23 (Rage Grip / 5 目標): キャストスピードを固定すると **1%** まで下がるが、
 * 全元素耐性や知性は **60% 止まり**。探す価値があるのは 1 つだけ。
 *
 * ## ここは投げません
 * 組み立てるだけです。実際に投げるのは呼び出し側で、**オーナーの指示があるまで投げないこと**
 * ([[api-probing-policy]])。
 */
import { fracturedBuyQuery } from "./fracture-route";
import { buildFinishedQuery } from "./buy-or-craft";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";

/** 検索の並び間隔 (門番 gate.rs の min_spacing_ms と同じ値。10 秒に 4 本の burst の中の間隔、2026-09-26 に 10.5 → 2.6) */
export const SEARCH_INTERVAL_SEC = 2.6;
/** 5 分で送れる上限 (門番はこの 8 割 = 24 で止める)。超えると 30 分の罰則 */
export const SEARCH_BUDGET_PER_5MIN = 30;

/** 投げる 1 本 */
export interface PlannedSearch {
  /** 画面に出す名前 */
  label: string;
  /** なぜ投げるか */
  why: string;
  /** 上から順に価値が高い */
  rank: number;
  /** 固定済みを探す検索か */
  fractured: boolean;
  /** 狙っている MOD (複数なら「まとめ買い」) */
  modIds: string[];
  query: unknown;
}

export interface SearchPlan {
  searches: PlannedSearch[];
  /**
   * 買うしかない MOD のうち、**こちらから検索条件を組めた数 / 全部**。
   * 組めない物は手で探すしかありません (エンジンが知らない MOD なので stat が引けない)。
   */
  mustBuy: { total: number; searchable: number };
  /** 全部投げた時にかかる秒数 (間隔だけ。罰則は考えない) */
  seconds: number;
  /** 5 分の枠を超えるか */
  overBudget: boolean;
  /** 画面にそのまま出す 1 行 */
  note: string;
}

/**
 * 投げる順に並べた計画を返す。**投げません。**
 *
 * @param order 一番つきにくい順に並べた目標 (`soloCosts` の戻りをそのまま使える)
 * @param mustBuy クラフトでは付かない MOD の文面。あると 1 番の優先度が「前提」に上がる
 * @param opts.max 投げる本数の上限 (既定 6。5 分の枠を使い切らない数)
 */
export function searchPlan(
  data: PatchData,
  cls: ItemBase,
  order: readonly TierTarget[],
  opts: {
    baseType?: string; ilvlMin?: number; max?: number; mustBuy?: readonly string[];
    /**
     * 固定済みを探す価値がある MOD の id。**渡すとここに無い MOD の固定済み検索を外します**
     * ([[fracture-value.ts]] の `worth`)。省くと今まで通り全部出します。
     */
    fractureWorth?: readonly string[];
  } = {},
): SearchPlan {
  const max = Math.max(1, opts.max ?? 6);
  const q = { ...(opts.ilvlMin != null ? { ilvlMin: opts.ilvlMin } : {}), ...(opts.baseType ? { baseType: opts.baseType } : {}) };
  // 買うしかない MOD。**こちらからは検索条件を組めません** (エンジンが知らないので stat が無い)
  const mustBuyTotal = (opts.mustBuy ?? []).length;
  const out: PlannedSearch[] = [];
  let rank = 0;

  // 渡されていれば、その中の物だけ固定済みを探す
  const worth = opts.fractureWorth ? new Set(opts.fractureWorth) : null;
  const wantFractured = (t: TierTarget): boolean => !worth || worth.has(t.modId);

  const hardest = order[0];
  if (hardest) {
    const fx = wantFractured(hardest) ? fracturedBuyQuery(data, cls, hardest, q) : null;
    if (fx) {
      out.push({
        label: "一番つきにくい MOD の固定済み",
        why: "固定された MOD は消去でも消えません。ここが 1 神で見つかれば桁が変わります",
        rank: rank++, fractured: true, modIds: [hardest.modId], query: fx.query,
      });
    }
    const plain = buildFinishedQuery(data, cls, [hardest], { ...q, rarity: "rare" });
    if (plain) {
      out.push({
        label: "一番つきにくい MOD (固定なし)",
        why: "固定済みが無い / 高い時の代わり。自作費と比べて安ければ買う",
        rank: rank++, fractured: false, modIds: [hardest.modId], query: plain.query,
      });
    }
  }

  // 狙いが何個か乗っている出品。**上から 3 個ずつ**にする (多いほど当たらないが、当たれば一番速い)
  for (const n of [3, 2]) {
    if (order.length < n) continue;
    const some = order.slice(0, n);
    const built = buildFinishedQuery(data, cls, some, { ...q, rarity: "rare" });
    if (!built || built.unmatched.length) continue;
    out.push({
      label: `狙いが ${n} 個乗っている出品`,
      why: "「そこから作ったほうが速い」物を拾う。当たれば残りは 1〜2 個",
      rank: rank++, fractured: false, modIds: some.map((t) => t.modId), query: built.query,
    });
  }

  // 残りの MOD の固定済み。ここまで来たら優先度は低い
  for (const t of order.slice(1)) {
    if (out.length >= max) break;
    if (!wantFractured(t)) continue;
    const fx = fracturedBuyQuery(data, cls, t, q);
    if (!fx) continue;
    out.push({
      label: "次につきにくい MOD の固定済み",
      why: "1 番が見つからなかった時の次の手",
      rank: rank++, fractured: true, modIds: [t.modId], query: fx.query,
    });
  }

  const searches = out.slice(0, max);
  const seconds = Math.max(0, (searches.length - 1) * SEARCH_INTERVAL_SEC);
  const overBudget = searches.length > SEARCH_BUDGET_PER_5MIN;
  const base = overBudget
    ? `${searches.length} 回は 5 分の枠 (${SEARCH_BUDGET_PER_5MIN} 回) を超えます。**30 分の罰則**を食らうので減らしてください。`
    : `${searches.length} 回 = 約 ${Math.ceil(seconds)} 秒 (10.5 秒間隔)。5 分の枠 ${SEARCH_BUDGET_PER_5MIN} 回のうち ${searches.length} 回を使います。`;
  const note = mustBuyTotal > 0
    ? `${base} ただし**買うしかない MOD が ${mustBuyTotal} 件あり、こちらからは検索条件を組めません** `
      + "(エンジンが知らない MOD なので stat が引けない)。**その MOD が乗ったベースを手で探して、"
      + "見つけたら貼り直してください。**上の検索はその後の話です。"
    : base;
  return { searches, seconds, overBudget, mustBuy: { total: mustBuyTotal, searchable: 0 }, note };
}
