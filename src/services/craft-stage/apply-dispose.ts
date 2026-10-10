/**
 * apply-dispose.ts — 解呪とサルベージ (2026-09-29、POE2Tube 要望 ⑰-5「資源の章」)
 *
 * 名前はクライアントの文言表 (ClientStrings): SellWindowTitle「Disenchant / 解呪」、AdvancedCraftingBenchSalvageButton「Salvage / サルベージ」。
 * どちらもアイテムは無くなる (解呪の説明「これによりアイテムは破壊されます」)。
 *   - 解呪: 出る物は攻略の定番の説明 (マジック → 変成のシャード、レア → 王者のシャード、ユニーク → 可能性のシャード)。ノーマルは解呪できない扱い。
 *     **個数の出典なし (未確定)**。クライアントに解呪の表は書き出していないので 1 個と置く (DISPOSE_COUNT_CONFIRMED = false)
 *   - サルベージ: クライアントの説明文「品質またはソケットを持つ装備アイテムをサルベージし、品質カレンシーまたは熟練工のシャードにします」
 *     「アイテムは品質またはソケットを持っている必要があります」。ソケット → 熟練工のシャード、品質 → その装備の品質カレンシー
 *     (砥石 = マーシャル武器 / 彫刻針 = ワンド・スタッフ・セプター / 端材 = 防具)。**個数の出典なし (未確定)**、それぞれ 1 個と置く
 * シャードは棚の個数 (item.shards、10 個でオーブ = collectShard) に積む。品質カレンシーは item.gained に積む。
 */
import type { StageApply, StageItem } from "./types";
import { skip } from "./stage-core";
import { ARMOUR, CASTER, collectShard, MARTIAL } from "./apply-act";
import { isFlask, isGem } from "./stage-bases";
import { tr } from "../../i18n/lang";

export const DISPOSE_KEYS = ["disenchant", "salvage"] as const;
export const isDispose = (key: string): boolean => (DISPOSE_KEYS as readonly string[]).includes(key);
export const DISPOSE_JA: Record<string, string> = { disenchant: "解呪", salvage: "サルベージ" };
/** 1 回で出る数 (出典なし、仮に 1) */
export const DISPOSE_COUNT = 1;
export const DISPOSE_COUNT_CONFIRMED = false;

/** 解呪で出るシャード (レアリティごと) */
const DISENCHANT_TO: Record<string, string> = { magic: "transmute_shard", rare: "regal_shard", unique: "chance_shard" };
/** サルベージで出る品質カレンシー (装備の種類ごと) */
function qualityCurrencyOf(category: string): string | null {
  if (MARTIAL.includes(category)) return "whetstone";
  if (CASTER.includes(category)) return "etcher";
  if (ARMOUR.includes(category)) return "scrap";
  return null;
}

/** シャードを n 個積む (10 個でオーブ。collectShard を n 回) */
function addShards(item: StageItem, key: string, n: number): StageItem {
  let cur = item;
  for (let i = 0; i < n; i++) cur = collectShard(cur, key).item;
  return cur;
}

export function applyDispose(item: StageItem, key: string): StageApply {
  if (isGem(item.cls.category) || isFlask(item.cls.category)) return skip(item, tr(`装備アイテムにだけ使える (${DISPOSE_JA[key]})`, `Equipment only (${key === "disenchant" ? "Disenchant" : "Salvage"})`));
  if (key === "disenchant") {
    const shard = DISENCHANT_TO[item.rarity];
    if (!shard) return skip(item, tr("ノーマルのアイテムは解呪できない", "Normal items can't be disenchanted"));
    return { applied: true, item: { ...addShards(item, shard, DISPOSE_COUNT), disposed: "disenchant" }, added: [], removed: [] };
  }
  const q = item.quality > 0 ? qualityCurrencyOf(item.cls.category) : null;
  const s = (item.sockets ?? 0) > 0;
  if (!q && !s) return skip(item, tr("品質かソケットを持っている装備にだけ使える", "Only equipment with quality or sockets"));
  let cur = s ? addShards(item, "artificer_shard", DISPOSE_COUNT) : item;
  if (q) cur = { ...cur, gained: { ...cur.gained, [q]: (cur.gained?.[q] ?? 0) + DISPOSE_COUNT } };
  return { applied: true, item: { ...cur, disposed: "salvage" }, added: [], removed: [] };
}
