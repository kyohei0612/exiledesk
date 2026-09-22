/**
 * lingering.ts — 「載せている間だけ効く物を、外しても残す」作り方 (2026-09-22)
 *
 * オーナーの説明:「ブリーチのエッセンスで 20% 品質を途中で上げた後そのMOD消すと品質は 40% のまま。
 * だから完成品に 40% ついてるけど品質最大値がついてない MOD とかは途中で消してるんだよ」
 *
 * ## 仕組み
 * 品質と「最大品質」は別物です。MOD が上げるのは**上限**だけで、品質そのものはアイテムの数値。
 * だから
 *   1. ブリーチのエッセンスで `+20% to Maximum Quality` を載せる (上限 20% → 40%)
 *   2. カタリストで品質を 40% まで上げる
 *   3. その MOD を消す (上限は 20% に戻るが、**品質は 40% のまま**)
 * が通ります。**プレフィックスの枠も空きます**。ここが本当の旨みで、40% 品質かつプレフィックス 3 本
 * 使い切った指輪が作れる。
 *
 * ルーンの「差す → 作る → 外す」([[rune-route.ts]]) と同じ形の話です。載せている間だけ効く物を
 * 使い切ってから外す。
 *
 * ## クライアントで裏を取った範囲 (2026-09-22)
 * - MOD は `EssenceBreach` (`+20% to Maximum [Quality]`、family `LocalMaximumQuality`、プレフィックス)
 * - 出どころは **Essence of the Breach** ただ 1 つ、対象は `AmuletRing` = **指輪とアミュレットだけ**
 *   (`Essences` / `EssenceMods` / `EssenceTargetItemCategories` を突き合わせて確認)
 * - `spawn_weights` は `default: 0` なので**自然には出ません**。エッセンスでしか載らない
 * - 同梱エンジン側も同じ 2 件を持っている (`Amulets/` と `Rings/PerfectEssence_LocalMaximumQuality`)
 *
 * ## 裏が取れていない部分
 * 「消しても品質が残る」こと自体はゲームのデータに書いてありません。**オーナーの実使用が根拠です。**
 * ルーンの裁定と同じ扱いにして、断り書きを必ず画面に出します。
 */
import type { ItemBase } from "../../vendor/poe2htc/engine/types";

/** 素の最大品質 (%) */
export const BASE_MAX_QUALITY = 20;

/** ブリーチのエッセンスが上げる最大品質 (%)。クライアントの `EssenceBreach` の文言そのまま */
export const BREACH_MAX_QUALITY_PLUS = 20;

/** 最大品質を上げる MOD の family (クライアントと同梱エンジンで同じ名前) */
export const MAX_QUALITY_FAMILY = "LocalMaximumQuality";

/** このやり方が使えるクラス。クライアントの `EssenceTargetItemCategories.AmuletRing` */
const MAX_QUALITY_CATEGORIES = ["Rings", "Amulets"];

/**
 * 「外しても残る」裁定。根拠は実使用の報告だけで、ゲームのデータには裏づけがありません。
 * 乗る道筋には必ず付けて、画面にそのまま出すこと。
 */
export const LINGERING_CAVEAT =
  "載せている間だけ効く物を使い切ってから消す、という作り方です。消しても結果が残ることはゲームのデータに書かれておらず、実使用の報告が根拠です。";

export interface MaxQualityRoute {
  /** 使うエッセンス (英名。値段はこの名前で引く) */
  essence: string;
  /** 載っている間の最大品質 (%) */
  maxQualityWhileOn: number;
  /** 消したあとに残る品質 (%) = 上と同じ */
  qualityKept: number;
  /** 載る MOD の family と側 */
  family: string;
  side: "prefix";
  /** 品質を上げる手段 */
  raisedBy: string;
  /** 消したあとに手に入る物 */
  keeps: readonly string[];
  caveats: readonly string[];
}

/**
 * そのベースで「最大品質を上げてから消す」が使えるか。使えないベースは null。
 *
 * 指輪とアミュレット以外で null になるのは実装の都合ではなく、**エッセンスの対象がそこだけ**
 * だからです (クライアントで確認済み)。
 */
export function maxQualityRoute(base: ItemBase): MaxQualityRoute | null {
  if (!MAX_QUALITY_CATEGORIES.includes(base.category)) return null;
  const max = BASE_MAX_QUALITY + BREACH_MAX_QUALITY_PLUS;
  return {
    essence: "Essence of the Breach",
    maxQualityWhileOn: max,
    qualityKept: max,
    family: MAX_QUALITY_FAMILY,
    side: "prefix",
    raisedBy: "カタリスト (指輪 / アミュレットの品質はカタリストで上げる)",
    keeps: [`品質 ${max}%`, "プレフィックスの枠 1 つ"],
    caveats: [LINGERING_CAVEAT],
  };
}

/**
 * もう 1 つの最大品質: **ルーン「Legacy of Serle's Grit」** (2026-09-22 にクライアントで発見)。
 *
 * `SoulCoreStats` で `local_maximum_quality_is_% = 40`、`IsSocketBound: false` (= 外せる)、
 * 必要レベル 65。差している間は最大品質が 40% になり、品質を上げてから差し替えれば品質だけ残る
 * ── エッセンスの話とまったく同じ形です。
 *
 * **上流 POE2HTC はこのルーンを持っていません** (`engine/runes.ts` の 12 本に入っていない)。
 *
 * 載るベースは未確認です。ルーンなので**ソケットのある装備**、つまり指輪とアミュレット以外、
 * という読みになりますが、クライアントに載せられるクラスの表が見つかっていません。
 * ここを断定しないため、`bases` は null のままにしてあります。
 */
export const QUALITY_RUNE = {
  name: "Legacy of Serle's Grit",
  maxQuality: 40,
  requiredLevel: 65,
  /** 載るベース。**未確認**なので null。分かったら埋める */
  bases: null as readonly string[] | null,
  caveats: [
    LINGERING_CAVEAT,
    "このルーンが載るベースはまだ確認できていません (クライアントに表が見つからない)。ソケットのある装備という読みです。",
  ] as const,
};

/** 文言が「最大品質」の MOD か。`+20% to Maximum Quality` / `Maximum Quality is 40%` の両方 */
export function isMaxQualityMod(text: string): boolean {
  return /maximum\s*(\[[^\]]*\]\s*)?quality/i.test(text) || /maximum\s*quality/i.test(text);
}

/** 見分けた結果 */
export interface QualityVerdict {
  /** この作り方をした跡があるか */
  lingering: boolean;
  /** 品質 (%)。読めなければ null */
  quality: number | null;
  /** 最大品質の MOD が残っているか */
  hasMaxQualityMod: boolean;
}

/**
 * 完成品を見て「途中で最大品質の MOD を消した跡」があるか。
 *
 * 判定は 1 つだけ: **素の上限を超える品質があるのに、最大品質の MOD が無い**。
 *
 * レアにしか使えません。ユニークは実装で上限を書き換える物があり (`Maximum Quality is 200%` 等)、
 * そちらは MOD ではなく実装の文言なので、この判定では拾えません。
 * コラプトの付与で上限が乗った場合も見分けられません (跡が残らないため)。
 */
export function judgeQuality(item: {
  quality?: number | null;
  explicitMods?: readonly string[];
}): QualityVerdict {
  const quality = item.quality ?? null;
  const hasMaxQualityMod = (item.explicitMods ?? []).some(isMaxQualityMod);
  return {
    lingering: quality != null && quality > BASE_MAX_QUALITY && !hasMaxQualityMod,
    quality,
    hasMaxQualityMod,
  };
}
