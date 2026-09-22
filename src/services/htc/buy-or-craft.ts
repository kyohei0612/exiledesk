/**
 * buy-or-craft.ts — 「作るのと買うの、どっちが安いか」(2026-09-22)
 *
 * オーナー指示:「作る MOD 群で同じものを検索した時にその値段を予算として、期待値で計算後、
 * 完成品買ったほうがいいのかクラフトの方が良いか出せるとベスト」。
 *
 * **ここが HTC に無い部分です。**あちらは「作れるか / いくらかかるか」まで。こちらは同じ MOD 構成の
 * 完成品を取引所で引いて、**作成費と並べて判定**します。
 *
 * ## 検索は「素の値」で出す ── ここを間違えると全部ずれる
 * 取引所に並んでいる数値は**品質・カタリスト・ルーンで底上げされた表示値**です。一方こちらが持って
 * いるのは**素の抽選値** (ティア表の範囲)。底上げ後の値で検索すると、素で同じ物を作っても届かない
 * 個体ばかりが並び、値段が高く出ます。
 *
 * だからここは**ティアの下限 (素の値) をそのまま下限にします**。素の値で検索すれば、底上げ済みの
 * 個体も必ず引っかかる (向こうのほうが大きいので) ── オーナーの言う「底上げ前の値で検索したら
 * 必ずヒットする」がこれです。
 *
 * アノイント (パラゴン等) は装備してから乗せる物なので**勘定に入れません** (オーナー 2026-09-22)。
 *
 * ## 金額の出し方はアプリ共通の作法に合わせる
 * 中の計算は全部**高貴建て**。画面に出す時は `displayCurrency.money()` を通すので、
 * 選んでいる通貨で 1 を切ったら 1 つ下の通貨に落ちます (0.02 神 → 8.5 カオス)。
 * ジェムコラプトや捌き速度と同じ見え方になります (オーナー指示 2026-09-19 / 2026-09-22)。
 *
 * 作成費はこちらが計算した額なので、選んでいる通貨に換算して**切り上げ**ます。
 *
 * **出品価格は取引所の表記のまま出します** (オーナー指示 2026-09-22:「12 カオスとか表示されてても
 * 別に神にわざわざトレードの値段をなおさなくて良き」)。売り手が付けた通貨がそのまま情報なので、
 * 換算すると丸め誤差が乗るうえ、取引所と見比べた時に数字が違って見えます。
 * 比率の計算にだけ高貴建てを使います。
 *
 * ## 値段は呼び出し側から渡す
 * このファイルは**取引所を叩きません**。問い合わせの中身を組み立てて返すだけで、実際の取得と
 * レート制限 ([[trade2-rate-limit-testing]]) は呼び出し側の役目です。
 */
import { buildSpecQuery } from "../trade2/query";
import { currencyJa, displayCurrency } from "../../state/display-currency";
import statMapping from "../../i18n/trade2-stat-mapping.json";
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";

const STAT_MAP = statMapping as Record<string, string>;

/**
 * エンジンのクラス -> 取引所のカテゴリ。
 *
 * **実物で確認できた 6 つだけ**載せています。残り (帯 / 盾 / 武器 / タリスマン) は取引所の
 * 内部値を確認できていないので、当てずっぽうを書かずに落とします。間違ったカテゴリで引くと
 * **黙って違う値段が返る**ので、出さないほうが安全です。
 */
const TRADE_CATEGORY: Record<string, string> = {
  Amulets: "accessory.amulet",
  Rings: "accessory.ring",
  Helmets: "armour.helmet",
  Gloves: "armour.gloves",
  Boots: "armour.boots",
  Body_Armours: "armour.chest",
};

/** そのクラスを取引所で引けるか。引けなければ null (理由は `tradeCategoryNote`) */
export function tradeCategoryOf(cls: ItemBase): string | null {
  return TRADE_CATEGORY[cls.category] ?? null;
}
export const tradeCategoryNote = (cls: ItemBase): string =>
  `「${cls.category}」は取引所のカテゴリが未確認です。間違った値段を出さないよう、検索を組みません。`;

/** 取引所の条件 1 本 */
export interface TradeStatFilter {
  /** trade2 の stat id (`explicit.stat_...`) */
  id: string;
  /** 下限。**素の抽選値** (ティアの下限) */
  min: number;
  /** どの MOD から来たか (画面の説明用) */
  modId: string;
  /** 元のゲーム内 stat id */
  statId: string;
}

/** 狙う MOD のティア。`minTierIndex` 未指定なら最上位 (T1) を狙う扱い */
function tierOf(mod: Mod, t: TierTarget) {
  const i = t.minTierIndex ?? mod.tiers.length - 1;
  return mod.tiers[Math.max(0, Math.min(mod.tiers.length - 1, i))];
}

/**
 * 狙う MOD → 取引所の条件。
 *
 * 引けない MOD は `unmatched` に落とします。**黙って外さない**のが大事で、条件が 1 本抜けた検索は
 * 「もっと安い似た物」を拾ってしまい、買ったほうが得に見えます。
 */
export function tradeFiltersFor(
  data: PatchData,
  targets: readonly TierTarget[],
): { filters: TradeStatFilter[]; unmatched: string[] } {
  const filters: TradeStatFilter[] = [];
  const unmatched: string[] = [];
  for (const t of targets) {
    const mod = data.mods.get(t.modId);
    if (!mod) {
      unmatched.push(`${t.modId} (エンジンに無い)`);
      continue;
    }
    const tier = tierOf(mod, t);
    const statIds = ((tier as { stats?: readonly string[] }).stats ?? []).filter(Boolean);
    if (statIds.length === 0) {
      // 冒涜 / エッセンス由来の MOD は同梱データに stat を持っていない (上流の既知の穴)
      unmatched.push(`${t.modId} (stat を持っていない)`);
      continue;
    }
    statIds.forEach((statId, i) => {
      const id = STAT_MAP[statId];
      if (!id) {
        unmatched.push(`${t.modId} の ${statId} (取引所の stat が不明)`);
        return;
      }
      // 範囲は stat と同じ並び。素の下限をそのまま使う
      const range = tier.ranges[i] ?? tier.ranges[0];
      const min = Array.isArray(range) ? Number(range[0]) : 0;
      filters.push({ id, min: Number.isFinite(min) ? min : 0, modId: t.modId, statId });
    });
  }
  return { filters, unmatched };
}

/** 完成品を引く検索。カテゴリが未確認のクラスは null */
export function buildFinishedQuery(
  data: PatchData,
  cls: ItemBase,
  targets: readonly TierTarget[],
  opts: { ilvlMin?: number } = {},
): { query: ReturnType<typeof buildSpecQuery>; filters: TradeStatFilter[]; unmatched: string[] } | null {
  const category = tradeCategoryOf(cls);
  if (!category) return null;
  const { filters, unmatched } = tradeFiltersFor(data, targets);
  const query = buildSpecQuery({
    category,
    rarity: "nonunique",
    ...(opts.ilvlMin != null ? { ilvlMin: opts.ilvlMin } : {}),
    stats: filters.map((f) => ({ id: f.id, min: f.min })),
  });
  return { query, filters, unmatched };
}

/** 判定 */
export type BuyOrCraftVerdict = "buy" | "craft" | "unknown";

export interface BuyOrCraftResult {
  verdict: BuyOrCraftVerdict;
  /** 作成費 ÷ 出品価格。1 より大きければ買ったほうが安い */
  ratio: number | null;
  /** 作成費 (選んでいる通貨、切り上げ)。出せなければ "—" */
  craftText: string;
  /** 出品価格。取引所の表記のまま (「600 神」「12 カオス」)。出せなければ "—" */
  listingText: string;
  /** 画面にそのまま出す 1 行 */
  note: string;
}

/**
 * 作成費と出品価格を並べて判定する。どちらも**高貴建て**。
 *
 * `unmatched` が 1 本でもあれば判定しません。条件が抜けた検索の値段は、狙っている物より
 * 安い個体の値段だからです。
 */
export function buyOrCraft(o: {
  /** ソルバの期待費用 (ex) */
  craftExpected: number | null;
  /** 取引所の最安を**高貴建てに直した額** (比率の計算用)。出品が無ければ null */
  listingPrice: number | null;
  /**
   * 取引所が出している**そのままの**値段 (`{ amount: 12, currency: "chaos" }`)。
   * 画面にはこれを出す。省くと高貴建てから換算して出す。
   */
  listingRaw?: { amount: number; currency: string } | null;
  /** 取引所の条件にできなかった MOD */
  unmatched?: readonly string[];
}): BuyOrCraftResult {
  // 作成費はこちらの計算なので換算して切り上げ。出品価格は取引所の表記のまま
  const craftText = displayCurrency.money(o.craftExpected, { round: "up" });
  const listingText = o.listingRaw
    ? `${o.listingRaw.amount} ${currencyJa(o.listingRaw.currency)}`
    : displayCurrency.money(o.listingPrice, { round: "up" });
  const base = { craftText, listingText };
  if (o.unmatched?.length) {
    return { ...base, verdict: "unknown", ratio: null, note: `条件にできなかった MOD が ${o.unmatched.length} 件あるので、値段は比べられません。` };
  }
  if (o.craftExpected == null || !Number.isFinite(o.craftExpected)) {
    return { ...base, verdict: "buy", ratio: null, note: "この構成は作れない (または費用が出ない) ので、買うしかありません。" };
  }
  if (o.listingPrice == null) {
    return { ...base, verdict: "craft", ratio: null, note: "同じ構成の出品がありません。作るか、条件を緩めて探し直してください。" };
  }
  const ratio = o.listingPrice > 0 ? o.craftExpected / o.listingPrice : null;
  if (ratio == null) return { ...base, verdict: "unknown", ratio: null, note: "出品価格が読めません。" };
  return ratio > 1
    ? { ...base, verdict: "buy", ratio, note: `買うほうが安い。作ると ${craftText} / 出品は ${listingText} (${ratio.toFixed(1)} 倍)。` }
    : {
        ...base,
        verdict: "craft",
        ratio,
        // 1% を切ると四捨五入で「0%」になって何も言っていないのと同じになる
        note: `作るほうが安い。作ると ${craftText} / 出品は ${listingText} (出品の ${ratio < 0.01 ? "1% 未満" : `${(ratio * 100).toFixed(0)}%`})。`,
      };
}
