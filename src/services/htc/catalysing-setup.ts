/** catalysing.ts から切り出し (2026-09-26): 自動クラフト (MDP) に差し込む口 (カタリストの数・最大品質・catalysingSetup) */
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";
import type { CatalysingSetup } from "../../vendor/poe2htc/optimizer/markovActions";
import { BASE_MAX_QUALITY, boostedBy, catalystsFor } from "./quality";
import { catalysingMultiplier } from "./catalysing-multiplier";

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
