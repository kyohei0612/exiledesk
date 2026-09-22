/**
 * quality.ts — 品質とカタリスト (2026-09-22)
 *
 * オーナー指示:「品質とカタリストも組み込んでね」。
 *
 * ## 何が起きているか
 * 装飾品の品質は**種類つき**です。ゲームの表示は「品質 (マナモッド): +20%」で、**その種類のタグを
 * 持つ MOD だけ**が `素の値 × (1 + 品質)` に押し上げられます。だから取引所や上位プレイヤーの装備に
 * 出ている数値は**素の抽選値ではありません**。
 *
 * オーナーの実物 (マナのカタリスト 20%) で検算済み:
 *   最大マナ +218 (T1 180-189)  mana タグあり → 182 × 1.2 = 218  ✓
 *   マナ 9%       (T1 7-8)      mana タグあり →   8 × 1.2 = 9.6 → 9  ✓
 *   スピリット +50 (T1 47-50)    mana タグ無し → 素のまま  ✓
 *   スペル +3 / クリダメ 36%      mana タグ無し → 素のまま  ✓
 *
 * ## 使いどころ
 *   - **検索するとき**は素の値を使う (底上げ済みの個体も必ず引っかかる)
 *   - **読むとき**は表示値を素に戻す (そうしないとティアを高く見積もる)
 *   - **作るとき**は「素で作って、あとからカタリストで乗せる」と分けて出す
 *
 * ## 上限
 * 素は 20%。ブリーチのエッセンスか `Legacy of Serle's Grit` で 40% まで上がる
 * ([[lingering.ts]])。どちらも**使い切ってから消せる**ので、完成品に MOD が残らないことがあります。
 *
 * ## 防具・武器は対象外 ── **クラスで弾く必要があります**
 * 防具の品質は **MOD の数値を動かしません**。素の防御値 (白いベースに元から付いている
 * アーマー / 回避 / ES) のほうを上げ、`%増加` の MOD と同じ枠に入るだけです。
 * 実物で確認済み (2026-09-22): 品質 20% の兜で `P1 [39-42]` の MOD が **42** と表示されていた。
 * 品質が乗るなら 42 × 1.2 = 50 と出るはずで、出ていない。
 *
 * **ここが罠で、タグだけ見ると弾けません。**`defences` も `life` もカタリストの種類であり、
 * 同時に防具の MOD が持つタグでもあります。だから**アイテムのクラスで弾きます**
 * (カタリストは指輪とアミュレットにしか存在しない)。
 */
import catalystData from "./catalysts.json";
import { htcModTags } from "./patch";
import type { Mod } from "../../vendor/poe2htc/engine/types";

/** 装飾品のカタリスト 1 種 */
export interface Catalyst {
  /** クライアントの `AlternateQualityTypes.Id` (`JewelleryQualityMana` 等) */
  id: string;
  /** 対象を決めるタグ。MOD 側の `implicit_tags` に入っていれば底上げされる */
  tag: string;
  en: string;
  /** ゲーム公式の日本語名 (「神経のカタリスト」) */
  ja: string;
  /** そのタグを持つ MOD の数 (目安) */
  mods: number;
}

export const CATALYSTS: readonly Catalyst[] = (catalystData as { catalysts: Catalyst[] }).catalysts;
const BY_TAG = new Map(CATALYSTS.map((c) => [c.tag, c]));

/** 素の最大品質 (%) */
export const BASE_MAX_QUALITY = 20;
/** ブリーチのエッセンス / Legacy of Serle's Grit で届く最大品質 (%) */
export const RAISED_MAX_QUALITY = 40;

/**
 * カタリストが存在するクラス。ゲームの文面が「指輪またはアミュレットに追加する」なので、
 * 防具や武器には**そもそも種類つきの品質が無い**。
 */
const CATALYST_CLASSES = ["Rings", "Amulets"];

/** その MOD のクラス (id の頭。`Amulets/IncreasedMana` → `Amulets`) */
const classOf = (mod: Mod): string => mod.id.split("/")[0] ?? "";

/** そのクラスにカタリストがあるか */
export function hasCatalysts(mod: Mod): boolean {
  return CATALYST_CLASSES.includes(classOf(mod));
}

/**
 * その MOD がこのカタリストで底上げされるか。
 *
 * **タグが合うだけでは不十分**です。`defences` や `life` は防具の MOD も持っているので、
 * クラスを見ないと兜の MOD を割り戻してしまいます。
 */
export function boostedBy(mod: Mod, catalystTag: string): boolean {
  if (!hasCatalysts(mod)) return false;
  return (htcModTags()[mod.family] ?? []).includes(catalystTag);
}

/** その MOD を底上げできるカタリスト (無ければ空)。防具・武器は常に空 */
export function catalystsFor(mod: Mod): Catalyst[] {
  if (!hasCatalysts(mod)) return [];
  return (htcModTags()[mod.family] ?? []).map((t) => BY_TAG.get(t)).filter((c): c is Catalyst => !!c);
}

/**
 * 素の値 → 画面に出る値。
 *
 * ゲームは切り捨てます (T1 上限 8 に 20% で 9.6 → 9。オーナーの実物で確認)。
 * 小数を持つ MOD もあるので、整数の時だけ切り捨てます。
 */
export function displayedValue(raw: number, qualityPct: number): number {
  const v = raw * (1 + qualityPct / 100);
  return Number.isInteger(raw) ? Math.floor(v + 1e-9) : v;
}

/**
 * 画面に出ている値 → 素の値。
 *
 * **切り捨てられた後なので完全には戻りません。**戻した値は「素はこれ以上」という下限です
 * (9 / 1.2 = 7.5 → 素は 8 だった)。ティア判定にはこれで足ります。
 */
export function rawValue(displayed: number, qualityPct: number): number {
  return qualityPct > 0 ? displayed / (1 + qualityPct / 100) : displayed;
}

/**
 * 装備の品質を踏まえて、その MOD の表示値を素に戻す。
 *
 * **そのカタリストの対象でない MOD は戻しません。**全部を割ると、底上げされていない MOD を
 * 実際より低く見積もります。`catalystTag` が分からない時 (品質はあるが種類が読めない時) は
 * `null` を渡してください ── その時は戻さず、「戻せなかった」ことが呼び出し側に分かります。
 */
export function rawValueOfMod(
  mod: Mod,
  displayed: number,
  qualityPct: number,
  catalystTag: string | null,
): { raw: number; adjusted: boolean } {
  if (!qualityPct || !catalystTag || !boostedBy(mod, catalystTag)) return { raw: displayed, adjusted: false };
  return { raw: rawValue(displayed, qualityPct), adjusted: true };
}

/** 「品質 (マナモッド): +20%」のような表示から種類のタグを当てる。当たらなければ null */
export function catalystTagFromLabel(label: string): string | null {
  for (const c of CATALYSTS) if (label.includes(c.ja) || label.includes(c.en)) return c.tag;
  return null;
}
