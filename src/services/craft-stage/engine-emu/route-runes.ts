/**
 * route-runes.ts — スパムシミュレーターで嵌めて打つルーン (2026-10-19 オーナー「ルーン入れてたら MOD 数増えるけど加味してるか？
 * ルーン入れたままスパムする時と確率違うぞ。ルーン嵌めた状態でスパムシミュレーターやらないと。2 種類あるならチェックその分増やして、手袋が良い例」)。
 *
 * 確率が変わるルーンは 2 種類 (services/htc/sockets.ts の表):
 *   - セールの凱旋: サフィックスの枠 +1 (付く数が変わる)
 *   - 特殊 MOD のルーン (コルの狩り・カトラの陰鬱など、部位ごと): そのタグの MOD が普通の抽選に混ざる (分母が変わる、狙いにもできる)
 * 白のベースをソケットいっぱい (規格外) にして、選んだルーンを順に嵌めてから打つ (嵌める費用は入れない。打つ前の下ごしらえ)。
 * 嵌めるのはステージと同じ applyCurrency の `rune:<英語名>` の手
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { RUNE_BY_ID } from "../../../vendor/poe2htc/engine/runes";
import { SERLE_RUNE, socketRunesFor } from "../../htc/sockets";
import { applyCurrency } from "../apply-currency";
import { baseSocketsOf, isRune, RUNE_PREFIX } from "../stage-runes";
import { mulberry32 } from "../../htc/rng";
import type { StageItem } from "../types";

interface RouteRune { id: string; ja: string; /** 特殊 MOD を足すルーン (false = セールの凱旋) */ pool: boolean }

/** その部位で確率が変わるルーン (セールの凱旋 + 差せる特殊 MOD のルーン)。ソケットが付かない部位は無し */
export function routeRunesFor(item: StageItem | null): RouteRune[] {
  if (!item || baseSocketsOf(item.base, item.cls.category) <= 0) return [];
  return socketRunesFor(item.cls.category).filter((r) => r.pool || r.id === SERLE_RUNE).map((r) => ({ id: r.id, ja: r.ja, pool: r.pool }));
}
/** 嵌められる数 (規格外のソケットの数) */
export const routeSocketsOf = (item: StageItem | null): number => (item ? baseSocketsOf(item.base, item.cls.category) : 0);

/** エンジンの id → ステージの手のキー (名前の ’ と ' はステージの表に合う方) */
function runeKeyOf(id: string): string | null {
  const name = RUNE_BY_ID.get(id)?.name;
  if (!name) return null;
  for (const en of [name, name.replace(/’/g, "'"), name.replace(/'/g, "’")]) if (isRune(`${RUNE_PREFIX}${en}`)) return `${RUNE_PREFIX}${en}`;
  return null;
}

/** 始めのアイテムの下ごしらえ: ソケットを規格外まで開けて、選んだルーンを嵌める (route-race.ts の prep) */
export function runePrep(data: PatchData, ids: readonly string[]): ((it: StageItem) => StageItem) | undefined {
  if (!ids.length) return undefined;
  return (it) => {
    let out: StageItem = { ...it, sockets: Math.max(it.sockets ?? 0, baseSocketsOf(it.base, it.cls.category)) };
    for (const id of ids) {
      const key = runeKeyOf(id);
      if (!key) continue;
      const res = applyCurrency(data, out, key, mulberry32(1), []);
      if (res.applied) out = res.item;
    }
    return out;
  };
}
