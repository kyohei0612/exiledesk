/**
 * spam-share-open.ts — X のシェア (カオススパム計算機の結果) から来た人に、同じ計算機を開く (2026-10-17 オーナー「開いたら即スパム測定できるように」)。
 *
 * シェアの URL /s/<code> は中身を全部持つ (server/web/og-card.js の PACK)。カードのページは人を /?base=…&spam=<code> へ送る。
 * code の 11 番目 (setup) に、スパムを始めた時のアイテム (アイテムレベル・レアリティ・MOD と数値) と狙い・カオスの種類が入っている。
 * それを置いて、狙いとカオスを入れて計算機を開く (計算は計算機が自分で始める)。古いシェア (setup が無い) はベースから始めるだけ
 */
import { craftStage as s } from "./craft-stage";
import { fullSockets } from "./stage-steps";
import { spamAims, spamKey, spamPending } from "./chaos-spam";
import { startFrom } from "../services/craft-stage/run-plan";
import { aimLabel } from "../services/craft-stage/mod-list";
import { SPAM_KEYS } from "../services/craft-stage/chaos-spam";
import type { Force } from "../services/craft-stage/stage-core";
import type { StageItem } from "../services/craft-stage/types";
import type { Grade, RouteKind } from "../services/craft-stage/route-race";
import { routesLuck, routesOpen, routesTarget } from "./web-page";

/** シェアに入れるスパムの始めの状態 (短く: i = アイテムレベル、r = レアリティ、s = MOD、a = 狙い、k = カオスの種類) */
export interface SpamSetup {
  i: number;
  r: StageItem["rarity"];
  /** [MOD の id, 段の名前, 数値, 1 = 固定 / 2 = 冒涜] */
  s: Array<[string, string, number[], number?]>;
  /** [MOD の id, 段の下限 (0 = どの段でも)] */
  a: Array<[string, number]>;
  k: string;
}
/** スパムシミュレーターの運試しのシェア (2026-10-19): r = 道、g = 等級、m = 狙いの MOD、t = 段の下限、i = アイテムレベル */
export interface RouteSetup { route: { r: RouteKind; g: Grade; m: string; t: number; i: number } }

/** スパムを始めた時のアイテムと狙いから setup を作る (use-spam-share.ts が URL に入れる) */
export function setupOf(start: StageItem | null, aims: ReadonlyArray<{ modId: string; minTierIndex: number }>, key: string): SpamSetup | null {
  if (!start) return null;
  const mods = [...start.prefixes, ...start.suffixes].filter((m) => !m.unrevealed && !m.abyssMark);
  return {
    i: start.itemLevel,
    r: start.rarity,
    s: mods.map((m) => [m.modId, m.tierName, m.values, ...(m.fractured ? [1] : m.desecrated ? [2] : [])] as [string, string, number[], number?]),
    a: aims.map((a) => [a.modId, a.minTierIndex]),
    k: key,
  };
}

async function unpack(code: string): Promise<unknown[] | null> {
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}

/** URL の ?spam=<code> を読んで、同じ計算機を開く (ベースは ?base= で先に置いてある) */
export async function openSharedSpam(): Promise<void> {
  let code: string | null = null;
  try { code = new URLSearchParams(location.search).get("spam"); } catch { return; }
  if (!code) return;
  try { const u = new URL(location.href); u.searchParams.delete("spam"); history.replaceState(null, "", u.pathname + u.search + u.hash); } catch { /* 外せなくても開く */ }
  const arr = await unpack(code);
  const d = s.data.value;
  // スパムシミュレーターの運試しから: 同じ狙いでページを開き、計算が済んだら運試しの欄を開く
  const rt = (arr?.[10] as RouteSetup | undefined)?.route;
  if (rt && d?.mods.has(rt.m)) {
    s.itemLevel.value = Math.max(1, Math.min(100, Number(rt.i) || 82));
    s.reset();
    routesTarget.value = { modId: rt.m, minTierIndex: Math.max(0, Number(rt.t) || 0) };
    routesLuck.value = true;
    routesOpen.value = true;
    return;
  }
  const st = arr?.[10] as SpamSetup | undefined;
  if (!st || !d || !Array.isArray(st.s) || !Array.isArray(st.a) || !st.a.length) return;
  const forces: Force[] = st.s.filter((x) => d.mods.has(x[0])).map(([mod, tier, values, f]) => ({ mod, ...(tier ? { tier } : {}), ...(values?.length ? { values } : {}), ...(f === 1 ? { fractured: true } : f === 2 ? { desecrated: true } : {}) }));
  const ilvl = Math.max(1, Math.min(100, Number(st.i) || 82));
  try {
    s.itemLevel.value = ilvl;
    s.reset();
    s.startMods.value = forces;
    s.item.value = { ...fullSockets(startFrom(d, s.base.value, ilvl, { mods: forces, rarity: st.r }, s.seed.value - 1)), rollSeed: s.seed.value - 1 };
  } catch { s.startMods.value = []; s.reset(); }
  spamAims.value = st.a.filter(([id]) => d.mods.has(id)).map(([modId, minTierIndex]) => ({ modId, minTierIndex, label: aimLabel(d, { modId, minTierIndex, label: modId }) }));
  if (!spamAims.value.length) return;
  spamKey.value = (SPAM_KEYS as readonly string[]).includes(st.k) ? st.k : "chaos";
  spamPending.value = true;
}
