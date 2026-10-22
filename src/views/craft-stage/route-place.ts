/**
 * route-place.ts — スパムシミュの当たった形をクラフト台に置く (2026-10-22 オーナー「当たった状態でクラフト台に戻る」)。
 * 運試しの欄 (StageRouteLuck.vue) と道のカード (StageRoutesPage.vue) が使う。クラフト台の形が変わるのはこれだけ (「← クラフトへ戻る」は開いた時のまま)。
 * 前の形は 1 つ戻す (Ctrl+Z) で工程ごと戻る (craftStage.place)。スパムの手と費用はクラフト台の工程に入れない (始めの MOD として置く)
 */
import { craftStage as s, priceOf } from "../../state/craft-stage";
import { routesLuck, routesOpen, routesTarget } from "../../state/web-page";
import { fullSockets } from "../../state/emulator/stage-steps";
import { startFrom } from "../../services/craft-stage/run-plan";
import { routeRun, type RaceRow, type RaceTarget, type RoutePrep } from "../../services/craft-stage/route-race";
import { mulberry32 } from "../../services/htc/rng";
import type { Force } from "../../services/craft-stage/stage-core";
import type { StageItem } from "../../services/craft-stage/types";

/** 置いてページを閉じる。from = 今のアイテムから始めた (丸ごと置く)。決まりの形からは始めの MOD で組み直す (値を振る種は再生と同じ seed − 1) */
export function placeOnStage(it: StageItem, from: boolean): void {
  const d = s.data.value;
  if (!d) return;
  const forces: Force[] = [...it.prefixes, ...it.suffixes].map((m) => ({ mod: m.modId, tier: m.tierName, values: m.values, ...(m.fractured ? { fractured: true } : {}), ...(m.desecrated ? { desecrated: true } : {}) }));
  s.place(it, forces);
  if (!from) {
    // 嵌めたルーンもそのまま (ソケットの数とオーグメント)
    const placed = fullSockets(startFrom(d, s.base.value, it.itemLevel, { mods: forces, rarity: it.rarity }, s.seed.value - 1));
    s.item.value = { ...placed, rollSeed: s.seed.value - 1, ...(it.augments?.length ? { sockets: Math.max(placed.sockets ?? 0, it.sockets ?? 0), augments: it.augments } : {}) };
  }
  routesLuck.value = false;
  routesTarget.value = null;
  routesOpen.value = false;
}

/** その道・等級で 1 人を当たるまで打った形 (上限の手数までに付かなければ null)。道のカードの「当たった形でクラフト台に戻る」 */
export function hitItemOf(row: RaceRow, targets: readonly RaceTarget[], ilvl: number, prep: RoutePrep, from: StageItem | null, maxSteps = 3000): StageItem | null {
  const d = s.data.value;
  if (!d) return null;
  for (let k = 0; k < 5; k++) {
    const run = routeRun(d, s.base.value, ilvl, targets, row.route, row.grade, mulberry32((Math.random() * 2 ** 31) | 0), priceOf, prep, from ?? undefined);
    if (!run) return null;
    while (run.n < maxSteps && !run.hit()) if (!run.step()) break;
    if (run.hit()) return run.item;
  }
  return null;
}
