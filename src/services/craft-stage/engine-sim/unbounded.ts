/**
 * unbounded.ts — シミュのツリーで打つ時の「規格外」(2026-10-26 ジン部長 10 本目。オーナー 10-26「ルーン嵌めるタイミングは2個目のクラフトモッド使う時や
 * 特殊ルーンをツリーで選んだ時に自動で付けるような形にしようか」、シミュ部長 29 本目の頼み)。
 * ① ルーンの手 (rune:<英語名>) は、空きソケットが無ければ 1 つ足してから嵌める (ソケットは要るだけある扱い)
 * ② クラフト MOD を付ける手 (エッセンス・完全エッセンス・合金) で、アイテムのクラフト MOD がもう上限なら、打つ直前にアストリッドの創造性を嵌める
 * 嵌める手・上限の数え方 (craftedLimitOf)・打った結果は全部エンジンのまま (ここは打つ前のアイテムを整えるだけ)。一度嵌まったルーンはアイテムに残る。
 * 結果の箱の割合 (outcomeOdds・stepOutcomes・heldOdds) は unboundedBefore を通した形を渡せば、同じルーン込みの答えになる
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { applyCurrency, kindOf } from "../apply-currency";
import { craftedLimitOf } from "../apply-essence";
import { RUNE_PREFIX } from "../stage-runes";
import type { StageApply, StageItem } from "../types";

/** クラフト MOD の上限を +1 するルーン (英語名) */
const ASTRID = "Astrid's Creativity";
const empty = (item: StageItem): number => (item.sockets ?? 0) - (item.augments ?? []).length;
const craftedOn = (item: StageItem): number => [...item.prefixes, ...item.suffixes].filter((m) => m.crafted).length;

/** ルーンを嵌める (英語名の並び)。空きソケットが無ければ足す (規格外)。もう嵌まっている名前は嵌めない。嵌められなかった物は飛ばす */
export function socketRunes(data: PatchData, item: StageItem, runes: readonly string[], rng: () => number): StageItem {
  let it = item;
  for (const en of runes) {
    if ((it.augments ?? []).some((a) => a.en === en)) continue;
    const r = applyCurrency(data, empty(it) > 0 ? it : { ...it, sockets: (it.sockets ?? 0) + 1 }, `${RUNE_PREFIX}${en}`, rng);
    if (r.applied) it = r.item;
  }
  return it;
}

/** 規格外で打つ前のアイテム (ルーンの手ならソケットを足す、クラフト MOD が上限ならアストリッドの創造性を嵌める)。要らなければそのまま */
export function unboundedBefore(data: PatchData, item: StageItem, key: string, rng: () => number): StageItem {
  if (key.startsWith(RUNE_PREFIX)) return empty(item) > 0 ? item : { ...item, sockets: (item.sockets ?? 0) + 1 };
  if (kindOf(key).startsWith("essence") && craftedOn(item) >= craftedLimitOf(item)) return socketRunes(data, item, [ASTRID], rng);
  return item;
}

/** 規格外で 1 手打つ (unboundedBefore を通してからエンジンの applyCurrency) */
export function applyUnbounded(data: PatchData, item: StageItem, key: string, rng: () => number, omens: readonly string[] = []): StageApply {
  return applyCurrency(data, unboundedBefore(data, item, key, rng), key, rng, omens);
}
