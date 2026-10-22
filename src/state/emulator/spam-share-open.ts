/**
 * spam-share-open.ts — X のシェアから来た人に、スパムシミュレーターの運試しを開く (2026-10-17 オーナー「開いたら即スパム測定できるように」)。
 *
 * シェアの URL /s/<code> は中身を全部持つ (server/web/og-card.js の PACK)。カードのページは人を /?base=…&spam=<code> へ送る。
 * code の 11 番目 (setup) に狙いが入っている:
 *   - スパムシミュレーターの運試し (2026-10-19〜): { route: { r, g, m, t, i } }
 *   - 旧カオススパム計算機 (2026-10-16〜19、計算機は 2026-10-19 オーナー「カオススパム計算機削除でこっちに統一」で消した): { i, r, s, a, k }。
 *     狙いの最初の 1 つ (a[0]) とアイテムレベルで、同じようにスパムシミュレーターを開く
 */
import { startFrom, type RouteKind } from "../../services/craft-stage/engine";
import { craftStage as s } from "../craft-stage";
import { fullSockets } from "../for-share/stage-steps";
import { unpackJson } from "../../services/craft-stage/share";
import type { Grade } from "../../services/craft-stage/engine";
import type { SharedRace } from "../../services/craft-stage/engine-emu";
import { ROUTES_MAX, routesLuck, routesOpen, routesRunes, routesShared, routesTarget } from "../web-page";

/** スパムシミュレーターの運試しのシェア: r = 道、g = 等級、m = 狙いの MOD、t = 段の下限、i = アイテムレベル、a = 当たりが 2 つ以上の時の全部 ([MOD の id, 段の下限]。m・t は 1 つ目) */
export interface RouteSetup { route: { r: RouteKind; g: Grade; m: string; t: number; i: number; a?: Array<[string, number]>; /** 嵌めたルーンの id */ u?: string[]; /** 計算済みの結果 (開いた人は計算しない) */ x?: SharedRace } }
/** 旧カオススパム計算機のシェア (読むだけ): i = アイテムレベル、a = [MOD の id, 段の下限] の並び */
interface OldSpamSetup { i: number; a: Array<[string, number]> }

async function unpack(code: string): Promise<unknown[] | null> {
  try {
    const arr = await unpackJson(code);
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}

/** URL の ?spam=<code> を読んで、スパムシミュレーターの運試しを開く (ベースは ?base= で先に置いてある) */
export async function openSharedSpam(): Promise<void> {
  let code: string | null = null;
  try { code = new URLSearchParams(location.search).get("spam"); } catch { return; }
  if (!code) return;
  try { const u = new URL(location.href); u.searchParams.delete("spam"); history.replaceState(null, "", u.pathname + u.search + u.hash); } catch { /* 外せなくても開く */ }
  const arr = await unpack(code);
  const d = s.data.value;
  if (!d) return;
  const setup = arr?.[10] as (Partial<RouteSetup> & Partial<OldSpamSetup>) | undefined;
  const rt = setup?.route;
  const old = !rt && Array.isArray(setup?.a) ? setup!.a![0] : undefined;
  const mod = rt?.m ?? old?.[0];
  if (!mod || !d.mods.has(mod)) return;
  const ilvl = Math.max(1, Math.min(100, Number(rt?.i ?? setup?.i) || 82));
  s.itemLevel.value = ilvl;
  s.reset();
  // 白のアイテムを置く (ページはアイテムがある時に開く。ベースは ?base= で先に置いてある)
  try { s.item.value = { ...fullSockets(startFrom(d, s.base.value, ilvl, { mods: [], rarity: "normal" }, s.seed.value - 1)), rollSeed: s.seed.value - 1 }; } catch { return; }
  const more = Array.isArray(rt?.a) ? rt!.a!.filter((x) => Array.isArray(x) && typeof x[0] === "string" && d.mods.has(x[0])).map((x) => ({ modId: x[0], minTierIndex: Math.max(0, Number(x[1]) || 0) })) : [];
  routesTarget.value = more.length > 1 ? more.slice(0, ROUTES_MAX) : [{ modId: mod, minTierIndex: Math.max(0, Number(rt?.t ?? old?.[1]) || 0) }];
  routesRunes.value = Array.isArray(rt?.u) ? rt!.u!.filter((x) => typeof x === "string") : null;
  const x = rt?.x;
  routesShared.value = x && Array.isArray(x.r) && Array.isArray(x.l) && Array.isArray(x.t) && Number(x.n) > 0 ? x : null;
  routesLuck.value = true;
  routesOpen.value = true;
}
