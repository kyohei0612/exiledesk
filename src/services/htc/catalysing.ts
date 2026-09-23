/**
 * catalysing.ts — 触媒の高貴のお告げ (Omen of Catalysing Exaltation) の効き目 (2026-09-23)
 *
 * オーナー指摘:「触媒の品質、生贄の高貴とかの確率とかあるから、それ期待値だせそうだよね。
 * 品質上げた際の触媒成功率も加味したいんだよな」
 *
 * ## ゲーム内の文面には数字が無い
 * 「次回使用する高貴なオーブはカタリストの品質を全て消費し、対応するモッドを追加する確率を
 * 上げる」— **どれだけ上がるかはどこにも書かれていません**。クライアントのテーブルにも
 * 該当する数値は無く (schema.min.json の 1,535 テーブルを全数検索、候補ゼロ)、poe2db も
 * ゲーム内文をそのまま載せているだけです。つまり**実測しか無い**。
 *
 * ## 採用した実測 — Reddit (hiby753, 200 リング)
 * ilvl 75-78、プレフィックス満杯、サフィックスは 1 つ (元素耐性 or ライフ再生) のリングを 200 個
 * 買い、Adaptive カタリスト (属性タグ) を撒いてから**通常の**高貴 + このお告げ。
 *
 *   craft of exile の素の期待  属性 30.5 / 非属性 69.5
 *   品質 1-2% の 100 個         属性 42   / 非属性 58
 *   品質 40%  の 100 個         属性 77   / 非属性 23
 *
 * 「タグ付き MOD の**重み**に倍率 M が掛かる」と置くと、M = p/(1-p) x (69.5/30.5) なので
 *
 *   品質 1-2%  →  M = 1.65   (95% 区間 1.09 - 2.44)
 *   品質 40%   →  M = 7.63   (95% 区間 5.01 - 13.17)
 *
 * ## 拾ってはいけない数字が 2 つある
 * 1. スレのコメント (LordAlfrey) の結論「重み +60% - +130%」。**本人の計算ミス**です。本人が
 *    出した中間値 (重み 30.5 → 232.5) をそのまま使えば 7.6 倍 = +663% で、+131% にはならない。
 *    1 点目 (1.65 倍) だけは合っているので、そこだけ一致を確認に使っています。
 * 2. Google の AI 要約が出す「20% で 5 倍 / 40% で 7.5 倍」。あれは出典ではなく合成で、
 *    しかも本人が "estimated" と断っています。
 *
 * ## 品質に対する当てはめ — 直線
 * 2 点しか無いので直線と指数の両方が引けますが、直線だと 20% で 4.5 倍になり、**独立に書かれた
 * POE2FUN の作成ガイド 2 本が言う「500%」とほぼ一致します**。指数だと 20% で 3.4 倍になって
 * 合いません。別々の情報源が同じ所に来る直線を採ります。
 *
 * ## 信用してはいけない所 (画面に必ず出すこと)
 * - n=100 ずつなので 40% 側の幅が広い (5 - 13 倍)。`catalysingBand` がこの幅を返します。
 * - **2 群のベースが同じとは書かれていない**。40% 側は「ブリーチリング 100 個」、1-2% 側は
 *   「残りのリング」。ベースが違えば MOD プールごと違うので、**品質 0 の切片 (1.4 倍) は特に
 *   当てにならない**。倍率の向きと桁は堅い、切片は堅くない、という扱いをします。
 * - 実験は 1 年前の版。仕組みは変わっていないと見ていますが、重みは変わり得ます。
 */
import { limitsOf } from "../../vendor/poe2htc/engine/item";
import { excluded, familyAvailable, itemFamilies, modTierWeight, resolveMod } from "../../vendor/poe2htc/engine/pool";
import { CURRENCY_FLOOR } from "../../vendor/poe2htc/engine/types";
import type { CurrencyTier, ItemBase, ItemState, PatchData } from "../../vendor/poe2htc/engine/types";
import type { CatalysingSetup } from "../../vendor/poe2htc/optimizer/markovActions";
import { ABSOLUTE_MAX_QUALITY, BASE_MAX_QUALITY, boostedBy, catalystsFor } from "./quality";

/** 実測 1 点。`quality` は %、`multiplier` はタグ付き MOD の重みに掛かる倍率。 */
export interface CatalysingSample {
  readonly quality: number;
  readonly multiplier: number;
  /** 二項の 95% 区間 (n=100) を倍率に直したもの */
  readonly lo: number;
  readonly hi: number;
  readonly hits: string;
}

/** 出典: reddit /r/PathOfExile2 "Omen of Catalysing Exaltation seem to scale on Quality amount" */
export const CATALYSING_SAMPLES: readonly CatalysingSample[] = [
  { quality: 1.5, multiplier: 1.65, lo: 1.09, hi: 2.44, hits: "42/100" },
  { quality: 40, multiplier: 7.63, lo: 5.01, hi: 13.17, hits: "77/100" },
];

/** 画面に出す但し書き。`LINGERING_CAVEAT` と同じ扱いで、必ず倍率と一緒に見せる。 */
export const CATALYSING_CAVEAT =
  "触媒の高貴のお告げの倍率はゲーム内にもクライアントにも数字が無く、" +
  "コミュニティの実測 200 個 (各 100 個) から引いた推定です。" +
  "40% 側の 95% 区間は 5 - 13 倍と広く、2 群のベースが同じとは書かれていないため " +
  "品質が低い側ほど当てになりません。";

/** 2 点を通る直線。`q` は % 。 */
function lineThrough(loSample: number, hiSample: number): (q: number) => number {
  const [a, b] = CATALYSING_SAMPLES as readonly [CatalysingSample, CatalysingSample];
  const slope = (hiSample - loSample) / (b.quality - a.quality);
  const intercept = loSample - slope * a.quality;
  return (q) => intercept + slope * q;
}

const CENTRAL = lineThrough(CATALYSING_SAMPLES[0]!.multiplier, CATALYSING_SAMPLES[1]!.multiplier);
const LOWER = lineThrough(CATALYSING_SAMPLES[0]!.lo, CATALYSING_SAMPLES[1]!.lo);
const UPPER = lineThrough(CATALYSING_SAMPLES[0]!.hi, CATALYSING_SAMPLES[1]!.hi);

/** 品質 (%) → タグ付き MOD の重みに掛かる倍率。品質 0 ではお告げを使う意味が無いので 1。 */
export function catalysingMultiplier(qualityPct: number): number {
  if (!(qualityPct > 0)) return 1;
  return Math.max(1, CENTRAL(Math.min(qualityPct, ABSOLUTE_MAX_QUALITY)));
}

/** 同じ品質での 95% 区間。画面には幅ごと出す。 */
export function catalysingBand(qualityPct: number): { lo: number; hi: number } {
  if (!(qualityPct > 0)) return { lo: 1, hi: 1 };
  const q = Math.min(qualityPct, ABSOLUTE_MAX_QUALITY);
  return { lo: Math.max(1, LOWER(q)), hi: Math.max(1, UPPER(q)) };
}

export interface CatalysingOptions {
  /** オーブの強さ (ilvl 下限)。既定 'base'。 */
  currencyTier?: CurrencyTier;
  /** 狙う段位以上だけ数える。既定 0 (どの段位でも)。 */
  minTierIndex?: number;
  /** 倍率を直接指定する (検算用)。省略時は `catalysingMultiplier(qualityPct)`。 */
  multiplier?: number;
}

export interface CatalysingOdds {
  /** 素の高貴 1 回でその MOD が付く確率 */
  readonly plain: number;
  /** お告げ + 品質を乗せた高貴 1 回で付く確率 */
  readonly omened: number;
  /** 使った倍率 */
  readonly multiplier: number;
  /** 引くプールのうち、そのカタリストのタグが付いている重みの割合 */
  readonly taggedShare: number;
  /** 狙う MOD 自身がそのタグを持っているか。false なら**お告げは逆効果**になる。 */
  readonly boosted: boolean;
}

/**
 * 高貴なオーブ 1 回で `desiredModId` が付く確率を、お告げ有り / 無しで並べて返します。
 *
 * ベンダーの `addNormalAffixProbability` (exalt) と同じ分岐をなぞっています。違うのは重みだけで、
 * タグ付き MOD の重みが M 倍になるので
 *
 *   素     P = w / W
 *   お告げ P = M w / (M Wt + (W - Wt))      ← 狙う MOD がタグ付きの時
 *              w  / (M Wt + (W - Wt))      ← タグ**無し**の時 (周りだけ太るので下がる)
 *
 * 分岐が本家と一致していることは check-htc-catalysing.mjs が M=1 で突き合わせて担保します。
 */
export function catalysingOdds(
  data: PatchData,
  item: ItemState,
  desiredModId: string,
  catalystTag: string,
  qualityPct: number,
  opts: CatalysingOptions = {},
): CatalysingOdds {
  const multiplier = opts.multiplier ?? catalysingMultiplier(qualityPct);
  const nil: CatalysingOdds = { plain: 0, omened: 0, multiplier, taggedShare: 0, boosted: false };

  // ---- 本家 addNormalAffixProbability の門番 (exalt = レアに 1 枠足す) ----
  if (item.rarity !== "rare") return nil;
  const mod = data.mods.get(desiredModId);
  if (!mod || mod.source !== "normal") return nil;
  const pools = item.base.pools.normal;
  if (!pools.prefixes.includes(desiredModId) && !pools.suffixes.includes(desiredModId)) return nil;
  if (!familyAvailable(data, item, mod)) return nil;

  const limits = limitsOf(item.base);
  const pf = item.prefixes.length;
  const sf = item.suffixes.length;
  if (mod.type === "prefix" && pf >= limits.prefixes) return nil;
  if (mod.type === "suffix" && sf >= limits.suffixes) return nil;

  // ---- 本家 addAffixProbabilityFromPools の重み計算 (タグで 2 つに割る) ----
  const floor = CURRENCY_FLOOR.exalt[opts.currencyTier ?? "base"];
  const cap = item.level;
  const exclude = itemFamilies(data, item);

  const w = modTierWeight(mod, floor, cap, opts.minTierIndex ?? 0);
  if (w === 0) return nil;

  const sideWeight = (ids: readonly string[]): { total: number; tagged: number } => {
    let total = 0;
    let tagged = 0;
    for (const id of ids) {
      const m = resolveMod(data, id);
      if (excluded(m, exclude)) continue;
      const mw = modTierWeight(m, floor, cap);
      total += mw;
      if (boostedBy(m, catalystTag)) tagged += mw;
    }
    return { total, tagged };
  };
  const p = sideWeight(pools.prefixes);
  const s = sideWeight(pools.suffixes);

  let total = 0;
  let tagged = 0;
  if (pf < limits.prefixes && sf < limits.suffixes && p.total > 0 && s.total > 0) {
    total = p.total + s.total;
    tagged = p.tagged + s.tagged;
  } else if (mod.type === "prefix" && pf < limits.prefixes && p.total > 0 && (sf >= limits.suffixes || s.total === 0)) {
    total = p.total;
    tagged = p.tagged;
  } else if (mod.type === "suffix" && sf < limits.suffixes && s.total > 0 && (pf >= limits.prefixes || p.total === 0)) {
    total = s.total;
    tagged = s.tagged;
  } else {
    return nil;
  }

  const boosted = boostedBy(mod, catalystTag);
  const denom = multiplier * tagged + (total - tagged);
  return {
    plain: w / total,
    omened: denom > 0 ? (boosted ? multiplier * w : w) / denom : 0,
    multiplier,
    taggedShare: total > 0 ? tagged / total : 0,
    boosted,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 自動クラフト (MDP) に差し込む口
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * カタリスト 1 個で上がる品質 (%)。
 *
 * **クライアントから取れません** (品質の増分を持つテーブルが抽出対象に無い)。実測スレの
 * 「カタリストを 1 個だけ使ったら品質 1-2%」だけが根拠なので、中間の 1.5 を採ります。
 * 数を多めに見れば費用も多めに出るので、**迷ったら 1.0 側に寄せるのが安全側**です。
 * Craft of Exile (PoE2 beta) は 1 個 +2% で数えているが、オーナー判断で平均の 1.5 のまま
 * (2026-09-23:「基本 1% ずつだっけ、平均なら 1.5% で」)。
 * ここを変えると自動クラフトがカタリストを使う頻度が直に動くので、定数 1 つにしてあります。
 */
export const QUALITY_PER_CATALYST = 1.5;

/** その品質にするのに要るカタリストの数 */
export function catalystCountFor(qualityPct: number): number {
  return Math.ceil(Math.max(0, qualityPct) / QUALITY_PER_CATALYST);
}

/**
 * そのベースで届く最大品質 (%)。ブリーチリングだけが上限を持ち上げます
 * (「最大品質」を +20 / +25 する implicit を持つため)。神殿のインフューザーによる超過は
 * **1 回の消耗品**で、自動クラフトのように毎回品質を盛り直す前提とは噛み合わないので入れません。
 */
export function maxQualityForBase(baseNameEn: string): number {
  if (baseNameEn === "Refined Breach Ring") return BASE_MAX_QUALITY + 25;
  if (baseNameEn === "Breach Ring") return BASE_MAX_QUALITY + 20;
  return BASE_MAX_QUALITY;
}

/** エンジンの価格表で使うカタリストのキー */
export function catalystPriceKey(tag: string): string {
  return `catalyst_${tag}`;
}

export interface CatalysingSetupOptions {
  /** 提示する品質の段 (%)。省略時はベースの最大品質 1 段だけ。 */
  qualities?: readonly number[];
}

/**
 * `markovFromItem` に渡す設定を作ります。**指輪と首飾り以外では `undefined`** を返すので、
 * 呼ぶ側がベースの種類を気にする必要はありません。
 *
 * 段を増やすほど行動が増えて解くのが遅くなるので、既定は**そのベースの最大品質 1 段だけ**です。
 * 「20% で上限の半分まで来て、その先は伸びが鈍る」という性質があるため、段を刻みたい時は
 * 呼ぶ側が `qualities` に明示します (check-htc-catalysing.mjs が解く時間を測っています)。
 *
 * ## 状態に品質を持たせていない理由
 * お告げは品質を**全部**食うので、使った後は必ず品質 0 に戻ります。そして品質は運ではなく
 * カタリストを買えばいつでも作れるので、「今いくつ品質があるか」は状態ではなく**手順の値段**に
 * 畳めます。1 回の「カタリスト + 触媒の高貴のお告げ」の値段に「お告げ + カタリスト N 個」を丸ごと入れてあるのはそのためで、
 * これで状態空間を 1 ビットも増やさずに済んでいます。
 *
 * 取りこぼすのは「最初から品質が付いたアイテムを買った」場合の得だけで、こちらは**安全側**
 * (実際より高く見積もる) に外れます。完成品の品質が 0 になる (implicit の値が落ちる) 点は
 * この模型の外なので、画面で断る必要があります。
 */
export function catalysingSetup(
  base: ItemBase,
  targetModIds: readonly string[],
  data: PatchData,
  opts: CatalysingSetupOptions = {},
): CatalysingSetup | undefined {
  // 目標 MOD が持っているカタリストタグだけを出す。無関係なタグを出すと行動が増えるだけ。
  const tags = new Set<string>();
  for (const id of targetModIds) {
    const mod = data.mods.get(id);
    if (!mod) continue;
    for (const c of catalystsFor(mod)) tags.add(c.tag);
  }
  if (tags.size === 0) return undefined;

  const max = maxQualityForBase(base.name);
  const qualities = (opts.qualities ?? [max]).filter((q) => q > 0 && q <= max);
  if (qualities.length === 0) return undefined;

  return {
    tags: [...tags],
    qualities,
    boosted: (mod, tag) => boostedBy(mod, tag),
    multiplier: catalysingMultiplier,
    catalystCount: catalystCountFor,
  };
}

/**
 * `markovFromItem` の options に混ぜるだけの薄い包み。**指輪と首飾り以外では空** を返すので、
 * 呼ぶ側は `{ ...withCatalysing(data, base, targets), spare }` と書けば足ります。
 *
 * 呼ぶ側ごとに「このベースはカタリストが使えるか」を判定させると、必ずどこかで食い違います。
 * 判定はここ 1 箇所。
 */
export function withCatalysing(
  data: PatchData,
  base: ItemBase,
  targets: readonly { readonly modId: string }[],
  opts: CatalysingSetupOptions = {},
): { catalysing?: CatalysingSetup } {
  const setup = catalysingSetup(base, targets.map((t) => t.modId), data, opts);
  return setup ? { catalysing: setup } : {};
}
