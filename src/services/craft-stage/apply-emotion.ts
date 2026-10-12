/**
 * apply-emotion.ts — 液化した感情 (デリリウム) をジュエルに使う (2026-10-11 オーナー「デリリウム使うからね」)
 *
 * 効果の文 (poe2db): 「ランダムな MOD を 1 つ消して、レアの基本ジュエルに決まった『作った MOD』を 1 つ付ける」。
 * 古代の版は時を失ったジュエル用。どの感情で何が付くかはジュエルごとに違い、表は poe2db (jewel-bases.json の emotions)。
 *
 * 決まり (オーナーと決めた / 確かめていない所):
 *   - 消える候補は固定 (フラクチャー) 以外の全部。前の感情で付けた作った MOD も入る (2026-10-11 オーナー「おけ」)
 *   - MOD が 4 つ揃っていないレアにも使える。1 つ消してから付ける (2026-10-11 オーナー「つける」)
 *   - 作った MOD は 1 つまで: 消えずに残った作った MOD があれば、新しい物と入れ替える (確かめていない)
 *   - 消すのは固定以外から等しく。獰猛・侮蔑 (プレの版とサフィの版がある物) は、消えた MOD の側の版が付く
 *     (2026-10-11 オーナーの参考動画 2 本: 侮蔑は 2/2 で 50/50、サフィが上限を超えている時はプレしか当たらない)
 *   - 上限を超えている側 (侮蔑を外した後のサフィ 3 つ) が当たると弾かれる。片方の版しか無い物で、付ける側に空きが無い所が消えた時も弾かれる
 *
 * 鍵: `emotion:<英語名>` (例 emotion:Liquid Envy / emotion:Ancient Liquid Envy)。1 手として log に入る
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { jewelEmotionsOf } from "../htc/patch";
import { allMods, limitOf, listOf, makeStageMod, overLimit, skip, skipRandom, withMod, without } from "./stage-core";
import type { StageApply, StageItem, StageMod, StageSide } from "./types";
import { tr } from "../../i18n/lang";

export const EMOTION_PREFIX = "emotion:";
export const isEmotion = (key: string): boolean => key.startsWith(EMOTION_PREFIX);
export const emotionNameOf = (key: string): string => key.slice(EMOTION_PREFIX.length);

/** その部位で使える感情 (poe2db の並び) */
export function emotionKeysFor(item: StageItem | null): string[] {
  if (!item) return [];
  return [...new Set(jewelEmotionsOf(item.cls.id).map((e) => EMOTION_PREFIX + e.item))];
}

export function applyEmotion(data: PatchData, item: StageItem, key: string, rng: () => number): StageApply {
  const name = emotionNameOf(key);
  const entries = jewelEmotionsOf(item.cls.id).filter((e) => e.item === name);
  if (!entries.length) {
    const ancient = name.startsWith("Ancient ");
    return skip(item, ancient ? tr("古代の液化した感情は時を失ったジュエルにだけ使える", "Ancient Liquid Emotions: Time-Lost Jewels only")
      : item.cls.category === "Jewels" ? tr("このジュエルには使えない (古代の版は時を失ったジュエル用)", "Not usable on this jewel (Ancient versions are for Time-Lost Jewels)")
      : tr("ジュエルにだけ使える", "Jewels only"));
  }
  if (item.rarity !== "rare") return skip(item, tr("レアのジュエルにだけ使える", "Rare jewels only"));
  if (item.corrupted) return skip(item, tr("コラプトしたアイテムには使えない", "Can't be used on a Corrupted item"));
  // 消す: 固定以外から等しく
  const pool = allMods(item).filter((m) => !m.fractured);
  if (!pool.length) return skip(item, tr("消せる MOD が無い (固定だけ)", "No mod can be removed (only fractured ones)"));
  const gone = pool[Math.floor(rng() * pool.length)]!;
  if (overLimit(item, gone.side)) return skipRandom(item, tr("上限を超えている側に当たったので追加できない (もう一度)", "Hit the side that is over its limit, so nothing can be added (try again)"));
  // 2 つの版がある物 (獰猛・侮蔑) は消えた側の版、1 つの物はその版
  const e = entries.length > 1 ? entries.find((x) => x.side === gone.side) ?? entries[0]! : entries[0]!;
  const mod = data.mods.get(e.modId);
  if (!mod) return skip(item, tr("感情の MOD のデータが無い", "No data for this emotion's mod"));
  const side = e.side as StageSide;
  let it = without(item, gone);
  const removed: StageMod[] = [gone];
  // 作った MOD は 1 つまで: 残っている作った MOD は入れ替える
  for (const c of allMods(it).filter((m) => m.crafted && !m.fractured)) { it = without(it, c); removed.push(c); }
  if (listOf(it, side).length >= limitOf(it, side)) return skipRandom(item, tr("付ける側に空きが無い所が消えたので追加できない (もう一度)", "The removed mod was on the other side and this side is full, so nothing can be added (try again)"));
  const added: StageMod = { ...makeStageMod(mod, side, 0, rng), crafted: true };
  return { applied: true, item: withMod(it, added), added: [added], removed };
}
