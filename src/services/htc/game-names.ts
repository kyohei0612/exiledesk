/**
 * game-names.ts — カレンシー・骨・エッセンス・お告げのゲーム内の日本語名 (エンジンの側。2026-10-20 手 2 で labels.ts から分けた)
 *
 * **訳さない。**名前はクライアントの日本語テーブルから取った物 (`price-keys.json` / `essence-keys.json` の `ja`) をそのまま出す
 * (訳して「黒血のお告げ」と書いた事故がある。ゲームの表記は「ブラックブラッドのお告げ」、オーナー指摘 2026-09-22)。
 * 値段の計算機の手の 1 行は labels.ts (開発部の境目)。
 */
import { desecrationBoneFor } from "../../vendor/poe2htc/engine/probability";
import type { ItemBase } from "../../vendor/poe2htc/engine/types";
import keys from "./price-keys.json";
import { ESSENCE_KEYS as ESSENCE_TABLE } from "./essence-key-table";
import type { GameName } from "./prices";

interface PriceKeys {
  currency: Record<string, GameName>;
  bones: Record<string, GameName>;
  omens: Record<string, GameName>;
}
const KEYS = keys as PriceKeys;
const ESSENCE_KEYS: Readonly<Record<string, GameName>> = ESSENCE_TABLE;

/**
 * 値段のキー → ゲーム内の日本語名。引けなければ null (キーのまま出さない)。
 *
 * 冒涜 (`desecrate` / `desecrate_ancient`) は**どの骨を食うかが装備の種別で決まる**ので
 * (武器 = 顎の骨 / 防具 = 肋骨 / 装飾品 = 鎖骨)、クラスが分かる時だけ骨の名前に解決する。
 * 上流の `pricesForBase` が値段に対してやっているのと同じ対応。
 */
export function jaOfPriceKey(key: string, cls?: ItemBase): string | null {
  // ブリーチのエッセンスは essence-keys に無く、カレンシーの表にだけある (要望 ㉝ の 8: 手順の名前が "essence:breach" のままだった)
  if (key.startsWith("essence:")) return ESSENCE_KEYS[key]?.ja ?? KEYS.currency[key]?.ja ?? null;
  const boneMatch = /^desecrate(?:_(ancient|altered|gnawed))?$/.exec(key);
  if (cls && boneMatch) {
    const bone = desecrationBoneFor(cls.category);
    const boneKey = boneMatch[1] ? `${bone}_${boneMatch[1]}` : bone;
    return KEYS.bones[boneKey]?.ja ?? null;
  }
  return KEYS.currency[key]?.ja ?? KEYS.bones[key]?.ja ?? null;
}

/** お告げの id → ゲーム内の日本語名 */
export function jaOfOmen(omenId: string): string | null {
  return KEYS.omens[omenId]?.ja ?? null;
}
