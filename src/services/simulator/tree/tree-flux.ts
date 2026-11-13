/**
 * tree-flux.ts — 木の耐性のフラックス (S-31h、スイッチ treeFlux)。11-13 オーナー「ハズレモッドには打っても見えないでしょ打てるかもわからんのに。普通に狙いモッドに打つんでしょ、
 * 枝でないかな失敗とかないだろうし。エッセンスみたいなもんやなこれ」: 木の外れの MOD は中身が見えないので数えない。打てるのは狙いの耐性の MOD が付いている時だけ、
 * 結果はカタリストの手と同じ「打った後」の 1 箱 (11-13 オーナー「カタリストは枠出るやろ下に」、tree-outcome)。変え方はエンジン (useReason) のまま、ここは狙いだけの品で打てるかを見るだけ
 */
import { aimHits, useReason, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";
import { isFluxHand } from "./tree-hands";
import type { Aim, TreeDoc } from "./tree-model";
import { aimsOf } from "./tree-sample";
import { sameAimMod } from "./tree-hand-core";

export const fluxOn = (key: string | null | undefined): boolean => !!key && isFluxHand(key) && flag("treeFlux");

/** 打てるかを見る狙い = 木の当たりの箱の狙い + 完成形の狙い */
export function fluxAims(data: PatchData, doc: TreeDoc): Aim[] {
  const tree = aimsOf(data, doc);
  return [...tree, ...(doc.memoAims ?? []).filter((a) => !tree.some((x) => sameAimMod(data, x, a)))];
}
/**
 * 狙いの MOD だけを残した品 (外れの MOD は木では中身が見えないので数えない。遊びごとの上書き E-107)。
 * 狙いの MOD かはエンジンの aimHits (段は問わない = 下限 0、同じ系統で文も同じ物も)
 */
export function aimOnly(data: PatchData, item: StageItem, aims: readonly Aim[]): StageItem {
  const keep = (m: StageMod): boolean => aims.some((a) => aimHits(m, { modId: a.modId, minTierIndex: 0 }, { data, sameText: true }));
  return { ...item, prefixes: item.prefixes.filter(keep), suffixes: item.suffixes.filter(keep) };
}
/**
 * フラックスの後の ☑ (名前の印): 狙いの MOD を変えた先も狙いのまま (カードで「外れ MOD」と出さない)。打つ前の品に無く後に付いている完成形の狙いの MOD を足す。
 * 印の付いていた MOD が 1 つも変わっていなければ足さない (外れが変わっただけ = 見ない)
 */
export function fluxAimed(data: PatchData, doc: TreeDoc, prev: ReadonlySet<string>, before: StageItem | null | undefined, item: StageItem): string[] {
  if (!before) return [];
  const on = (it: StageItem, modId: string): boolean => [...it.prefixes, ...it.suffixes].some((m) => aimHits(m, { modId, minTierIndex: 0 }, { data, sameText: true }));
  if (![...prev].some((id) => on(before, id) && !on(item, id))) return [];
  return fluxAims(data, doc).filter((a) => !on(before, a.modId) && on(item, a.modId)).map((a) => a.modId);
}
/** 棚で打たせない理由: 狙いの耐性の MOD が無ければ打てない (外れの耐性は数えない)。フラックスでなければ null */
export function fluxBlock(data: PatchData, doc: TreeDoc, item: StageItem | null | undefined, key: string): string | null {
  if (!fluxOn(key) || !item) return null;
  return useReason(data, aimOnly(data, item, fluxAims(data, doc)), key, []) ? tr("変えられる狙いの耐性 MOD が無い (外れの MOD には打たない)", "No target resistance mod to convert (not used on junk mods)") : null;
}
