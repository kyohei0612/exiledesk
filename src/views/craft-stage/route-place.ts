/**
 * route-place.ts — スパムシミュの当たった形をクラフト台に置く (2026-10-22 オーナー「当たった状態でクラフト台に戻る」)。
 * 運試しの欄 (StageRouteLuck.vue) と道のカード (StageRoutesPage.vue) が使う。クラフト台の形が変わるのはこれだけ (「← クラフトへ戻る」は開いた時のまま)。
 * 起点 = スパムシミュを開いた時のクラフト台 (開いている間は変わらない) の後ろに 1 行 (2026-10-22 オーナー)
 */
import { mulberry32, type StageItem } from "../../services/craft-stage/engine";
import { craftStage as s, priceOf } from "../../state/craft-stage";
import { routesLuck, routesOpen, routesTarget } from "../../state/web-page";
import { routeRun } from "../../services/craft-stage/engine";
import { type RaceRow, type RaceTarget, type RoutePrep, forcesOf, spamKey } from "../../services/craft-stage/engine-emu";

/**
 * 置いてページを閉じる: 今のクラフト台の工程の後ろに「スパム」の 1 手を打つ (費用 = cost、高貴建て)。MOD を当たった形に置き換え、
 * 暗黙・品質・ソケット・ルーンはクラフト台のまま (apply-spam.ts)。1 つ戻すでこの行ごと消え、再生・手順 JSON でも同じ形に飛ぶ。
 * avg = 道のカードから (費用は 100 人の平均) / 運試しから (その 1 人の費用)。打てなければページを閉じない
 */
export function placeOnStage(it: StageItem, row: Pick<RaceRow, "route" | "grade">, o: { cost: number; n: number; avg: boolean }): boolean {
  const before = s.log.value[s.log.value.length - 1];
  s.hold(null);
  s.use(spamKey({ route: row.route, grade: row.grade, cost: o.cost, n: o.n, avg: o.avg, rarity: it.rarity, mods: forcesOf(it) }));
  if (s.log.value[s.log.value.length - 1] === before) return false;
  routesLuck.value = false;
  routesTarget.value = null;
  routesOpen.value = false;
  return true;
}

/**
 * その道・等級で 1 人を当たるまで打った形と手数 (上限の手数までに付かなければ null)。道のカードの「当たった形でクラフト台に戻る」。
 * 始めと 200 手ごとに画面へ手を返す (読み込み中の札が出て回るように)
 */
export async function hitItemOf(row: RaceRow, targets: readonly RaceTarget[], ilvl: number, prep: RoutePrep, from: StageItem | null, maxSteps = 3000): Promise<{ item: StageItem; n: number } | null> {
  const d = s.data.value;
  if (!d) return null;
  // 先に 1 回画面を返す (押してすぐ読み込み中の札が出る。200 手より前に当たる時も)
  await new Promise((r) => setTimeout(r, 0));
  for (let k = 0; k < 5; k++) {
    const run = routeRun(d, s.base.value, ilvl, targets, row.route, row.grade, mulberry32((Math.random() * 2 ** 31) | 0), priceOf, prep, from ?? undefined);
    if (!run) return null;
    while (run.n < maxSteps && !run.hit()) {
      if (!run.step()) break;
      if (run.n % 200 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (run.hit()) return { item: run.item, n: run.n };
  }
  return null;
}
