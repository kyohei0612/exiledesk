/**
 * 集計カウンタ: 1 キャラの items[] を読んでスロット別 MOD / ベース / ユニークを積む
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 * カウンタ → UI 公開形式への変換は finalize.ts。
 *
 * 2026-09-26: カウンタ型 / スロットへの積み上げ / スキル集計は ingest/ 以下に分割 (ここから再 export)。
 */

import type { CharacterItems } from "./types";
import { classifyEquipItem, classifyUniqueItem, isPoeNinjaItem } from "./ninja-item";
import { emptySlotSets, type AscendancyCounter } from "./ingest/counters";
import { addBaseToSlot, addModToSlot, addUniqueToAscendancy } from "./ingest/slot";
import { ingestCharacterSkills } from "./ingest/skills";

export type {
  AggregatedModBucket,
  BaseBucket,
  SkillBucket,
  SlotCounter,
  UniqueBucket,
  AscendancySlotCounters,
  SkillBucket2,
  AscendancyCounter,
} from "./ingest/counters";
export { emptyAscendancyCounter } from "./ingest/counters";

/**
 * 1 character の items[] を見て:
 *   - レア装備 (frameType=2): スロット別に MOD 集計 + ベース集計
 *   - ユニーク装備 (frameType=3): キャラ単位 de-dup でユニーク使用率に加算
 */
export function ingestCharacterItems(asc: AscendancyCounter, charItems: CharacterItems, isMeta: (nameEn: string) => boolean = () => false): void {
  ingestCharacterSkills(asc, charItems.skills, isMeta);
  if (!Array.isArray(charItems.items)) return;

  const seenPerSlot = emptySlotSets();
  const seenBasesPerSlot = emptySlotSets();
  const seenUniques = new Set<string>();
  const seenUniquesPerSlot = emptySlotSets();

  for (const raw of charItems.items) {
    if (!isPoeNinjaItem(raw)) continue;

    const rareSlot = classifyEquipItem(raw);
    if (rareSlot) {
      const mods = Array.isArray(raw.itemData?.explicitMods) ? raw.itemData!.explicitMods! : [];
      const seen = seenPerSlot[rareSlot];
      const slotCounter = asc.slots[rareSlot];
      for (const modText of mods) {
        addModToSlot(slotCounter, modText, seen);
      }
      addBaseToSlot(slotCounter, raw, seenBasesPerSlot[rareSlot]);
      continue;
    }

    const uniqueSlot = classifyUniqueItem(raw);
    if (uniqueSlot) {
      addUniqueToAscendancy(asc, raw, uniqueSlot, seenUniques, seenUniquesPerSlot[uniqueSlot]);
    }
  }
}
