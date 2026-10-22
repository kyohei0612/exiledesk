/** mod-list-use.ts — 使い方ごとの MOD の一覧 (2026-10-22 シミュの TreeModPick の群れと並びを入口へ、B13。mod-list.ts から分けた) */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { modListFor, type ListRow, type ModGroup } from "../mod-list";
import type { StageItem } from "../types";

/**
 * 使い方ごとの MOD の群れ (並びもこの順。2026-10-22 シミュの自前の式を入口へ、B13): hit = カレンシーで付く当たり (一般・冒涜専用・エッセンス。骨の手の当たりは冒涜で付与、10-22 オーナー)、
 * start = 始まりに置ける MOD (一般・エッセンス・創生の樹などカレンシーで付かない物・ルーンの MOD (付けると force がそのルーンを差す))
 */
export const MOD_USE_GROUPS: Readonly<Record<"hit" | "start", readonly ModGroup[]>> = { hit: ["normal", "desecrated", "essence"], start: ["normal", "essence", "special", "rune"] };
/** その使い方の行だけを、群れの順 → 出やすさ (share) の大きい順に (普通の MOD が先。10-22 靴・手袋を白紙から組んで、創生の樹が一番上に並び探しにくかった) */
export function modListForUse(data: PatchData, item: StageItem, use: "hit" | "start"): ListRow[] {
  const gs = MOD_USE_GROUPS[use];
  return modListFor(data, item).filter((r) => gs.includes(r.group)).sort((a, b) => gs.indexOf(a.group) - gs.indexOf(b.group) || b.share - a.share);
}
