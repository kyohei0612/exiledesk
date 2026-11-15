/**
 * daily-quality-item.ts — お題の完成形のカードの品にお題の品質 (D-03d) を載せる。載せるのはエンジンの品質の欄の手
 * (上限 qcap → 品質 qset、エミュの品質の帯と同じ口)。画面の側で品を書き換えない。DailyAimCard・DailyFracPick が同じここを呼ぶ
 */
import { applyCurrency, qualityCapOf, type PatchData, type StageItem } from "../../services/craft-stage/engine";
import { qualityCapKey } from "../../services/craft-stage/apply-currency";
import { SET_PREFIX } from "../../services/craft-stage/key";
import type { TopicQuality } from "./daily-quality";

export function withTopicQuality(data: PatchData, item: StageItem, q: TopicQuality | null | undefined): StageItem {
  if (!q) return item;
  const capped = applyCurrency(data, item, qualityCapKey(Math.max(q.value, qualityCapOf(item))), () => 0.5).item;
  return applyCurrency(data, capped, `${SET_PREFIX.quality}${q.value}:${q.tag}`, () => 0.5).item;
}
