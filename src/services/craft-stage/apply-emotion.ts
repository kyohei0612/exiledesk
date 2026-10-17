/**
 * apply-emotion.ts — 液化した感情 (デリリウム) をジュエルに使う (2026-10-11 オーナー「デリリウム使うからね」)
 *
 * 効果の文 (poe2db): 「ランダムな MOD を 1 つ消して、レアの基本ジュエルに決まった『作った MOD』を 1 つ付ける」。
 * 古代の版は時を失ったジュエル用。どの感情で何が付くかはジュエルごとに違い、表は poe2db (jewel-bases.json の emotions)。
 *
 * 決まり (オーナーと決めた / 確かめていない所):
 *   - 消える候補は固定 (フラクチャー) 以外の全部。前の感情で付けた作った MOD も入る (2026-10-11 オーナー「おけ」)
 *   - MOD が 4 つ揃っていないレアにも使える。1 つ消してから付ける (2026-10-11 オーナー「つける」)
 *   - 作った MOD (前の感情で付いた物) が付いている間は使えない (2026-10-12 オーナー)
 *   - 消すのは固定以外から等しく。獰猛・侮蔑 (プレの版とサフィの版がある物) は、消した後に付けられる版から等しく 1 つ
 *     (2026-10-16 オーナー「感情系も説明文に合わせて、書いてなかったらランダム」。説明文に版の決め方は無い。前は消えた MOD の側の版)
 *   - 上限を超えている側 (侮蔑を外した後のサフィ 3 つ) が当たると弾かれる。片方の版しか無い物で、付ける側に空きが無い所が消えた時も弾かれる
 *
 * 鍵: `emotion:<英語名>` (例 emotion:Liquid Envy / emotion:Ancient Liquid Envy)。1 手として log に入る
 * 打つ処理は説明文の分解 (spec/other-specs.ts の EMOTION_SPEC、2026-10-17 ADR-004 の残りで移した)。ここは名前・部位の判定だけ
 */
import { inGroup } from "../mods/item-classes";
import { jewelEmotionsOf } from "../htc/patch";
import type { StageItem } from "./types";
import { tr } from "../../i18n/lang";

export const EMOTION_PREFIX = "emotion:";
export const isEmotion = (key: string): boolean => key.startsWith(EMOTION_PREFIX);
export const emotionNameOf = (key: string): string => key.slice(EMOTION_PREFIX.length);

/** その部位で使える感情 (poe2db の並び) */
export function emotionKeysFor(item: StageItem | null): string[] {
  if (!item) return [];
  return [...new Set(jewelEmotionsOf(item.cls.id).map((e) => EMOTION_PREFIX + e.item))];
}

/** その部位で使えない感情なら一言 (spec/run-spec.ts の resolveSpec が使う)。使えれば null */
export function emotionReason(item: StageItem, key: string): string | null {
  const name = emotionNameOf(key);
  if (jewelEmotionsOf(item.cls.id).some((e) => e.item === name)) return null;
  return name.startsWith("Ancient ") ? tr("古代の液化した感情は時を失ったジュエルにだけ使える", "Ancient Liquid Emotions: Time-Lost Jewels only")
    : inGroup(item.cls.category, "jewel") ? tr("このジュエルには使えない (古代の版は時を失ったジュエル用)", "Not usable on this jewel (Ancient versions are for Time-Lost Jewels)")
    : tr("ジュエルにだけ使える", "Jewels only");
}
