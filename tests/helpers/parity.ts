// engine-emulator-parity-*.test.ts の共通 (2026-10-22 に 512 行のテストから分けた、中身はそのまま)。
// クラフトステージのエミュレーター (applyCurrency / apply-essence) を、同じアイテム・同じお告げ・同じ強さで全部突き合わせる (2026-10-10)。
// エミュレーターが「正」。1 ケースを N 回打ち、狙いの MOD (と段以上) が付いた割合をエンジンの確率と比べる。
// 許し幅は 4σ と 1.5 ポイントの大きい方。informational: エンジンに無い手 (表に出すだけで落とさない)
import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { loadPatch } from "./patch";
import { applyCurrency } from "../../src/services/craft-stage/apply-currency";
import { revealOffers } from "../../src/services/craft-stage/apply-desecrate";
import { effectiveCls } from "../../src/services/craft-stage/stage-core";
import { freshItem } from "../../src/services/craft-stage/run-plan";
import { mulberry32 } from "../../src/services/htc/rng";
import { boostedBy } from "../../src/services/htc/quality";
import { catalysingMultiplier } from "../../src/services/htc/catalysing-multiplier";
import { stepProbability, type PlanStep } from "../../src/vendor/poe2htc/engine/plan";
import { limitsOf } from "../../src/vendor/poe2htc/engine/item";
import type { CurrencyTier, ItemState, Mod } from "../../src/vendor/poe2htc/engine/types";
import { createActionSpace, type McAction } from "../../src/vendor/poe2htc/optimizer/markovActions";
import { decodeState, encodeState, sideIndexOf, type McTarget } from "../../src/vendor/poe2htc/optimizer/markovState";
import { essenceLevelOf } from "../../src/vendor/poe2htc/optimizer/cost";
import type { StageApply, StageItem, StageMod } from "../../src/services/craft-stage/types";

export const data = loadPatch();
export const N = Number(process.env.PARITY_N ?? 3000);

/** エミュレーターのアイテム → エンジンの ItemState (ルーン込みのベース、段の名前はエンジンの tiers[].name) */
export const toEngine = (it: StageItem): ItemState => {
  const pm = (m: StageMod) => ({
    modId: m.modId,
    tierName: String(data.mods.get(m.modId)?.tiers[m.tierIndex]?.name ?? m.tierName),
    ...(m.fractured ? { fractured: true } : {}),
    ...(m.desecrated ? { desecrated: true } : {}),
  });
  const all = [...it.prefixes, ...it.suffixes];
  return {
    base: effectiveCls(it), level: it.itemLevel, rarity: it.rarity as ItemState["rarity"],
    prefixes: it.prefixes.map(pm), suffixes: it.suffixes.map(pm),
    ...(all.some((m) => m.desecrated) ? { desecrated: true } : {}),
  };
};
export const A = (it: StageItem, key: string, seed: number, omens: string[] = []): StageItem => {
  const r = applyCurrency(data, it, key, mulberry32(seed), omens);
  if (!r.applied) throw new Error(`${key}: ${r.reason}`);
  return r.item;
};
export const mod = (id: string): Mod => data.mods.get(id)!;
export const topTier = (m: Mod, lv: number): number => { let k = 0; m.tiers.forEach((t, i) => { if (t.ilvl <= lv && t.weight > 0) k = i; }); return k; };
export const strengthOf = (key: string): CurrencyTier => (key.endsWith("_greater") ? "greater" : key.endsWith("_perfect") ? "perfect" : "base");

// ── アイテム ─────────────────────────────────────────────────────────────────────────────
export const ringNormal = freshItem(data, "Gold Ring", 82);
export const ringMagic = A(ringNormal, "transmute", 11);
export const ringRare = A(ringMagic, "regal", 12);
export const ringRare3 = A(ringRare, "exalt", 14);
export const ring4 = A(ringRare3, "exalt", 15);
export const ringQual = A(ringRare, "catalyst_life", 13);
// プレが埋まった指輪 (左の高貴で埋める)
export let ringPreFull = ringRare;
for (let s = 100; ringPreFull.prefixes.length < 3; s++) ringPreFull = A(ringPreFull, "exalt", s, ["OmenofSinistralExaltation"]);
export const ringFull = (() => { let it = ring4; for (let s = 300; it.prefixes.length + it.suffixes.length < 6; s++) it = A(it, "exalt", s); return it; })();
export const ringOneSlot = (() => { let it = ring4; for (let s = 200; it.prefixes.length + it.suffixes.length < 5; s++) it = A(it, "exalt", s); return it; })();
export const glovesRare = A(A(A(freshItem(data, "Riveted Mitts", 82), "transmute", 21), "regal", 22), "artificer", 23);
export const glovesKol = A(glovesRare, "rune:Kolr's Hunt", 24);
export const wandRare = A(A(freshItem(data, "Volatile Wand", 82), "transmute", 31), "regal", 32);
export const bodyRare = A(A(freshItem(data, "Garment", 82), "transmute", 41), "regal", 42);
export const quiverRare = A(A(freshItem(data, "Broadhead Quiver", 82), "transmute", 71), "regal", 72);
export const ring60 = A(A(freshItem(data, "Gold Ring", 60), "transmute", 51), "regal", 52);

// ── 記録 ─────────────────────────────────────────────────────────────────────────────────
export type Row = { group: string; name: string; target: string; engine: number; emu: number; n: number; ok: boolean; info?: boolean };
export const ROWS: Row[] = [];
export const tol = (p: number, n: number) => Math.max(0.015, 4 * Math.sqrt((p * (1 - p)) / n));
/** 表を出す (各テストのファイルが 1 回呼ぶ。PARITY_OUT は <名前>-<tag>.json に) */
export const parityReport = (tag: string): void => afterAll(() => {
  const pct = (x: number) => (Number.isFinite(x) ? (x * 100).toFixed(2) : "NaN");
  // ケースごとに一番ずれた行と、落ちた行の数
  const byCase = new Map<string, Row[]>();
  for (const r of ROWS) byCase.set(`${r.group}｜${r.name}`, [...(byCase.get(`${r.group}｜${r.name}`) ?? []), r]);
  const lines = ["ケース\t比べた数\t落ちた数\t一番ずれた狙い\tエンジン%\tエミュ%"];
  for (const [k, rs] of byCase) {
    const worst = rs.reduce((a, b) => (Math.abs(b.engine - b.emu) > Math.abs(a.engine - a.emu) || !Number.isFinite(b.engine) ? b : a));
    const bad = rs.filter((r) => !r.ok).length;
    lines.push(`${k}${rs[0]!.info ? " (情報)" : ""}\t${rs.length}\t${bad}\t${worst.target}\t${pct(worst.engine)}\t${pct(worst.emu)}`);
  }
  console.log(lines.join("\n"));
  if (process.env.PARITY_OUT) {
    writeFileSync(process.env.PARITY_OUT.replace(/(\.json)?$/, `-${tag}$1`), JSON.stringify(ROWS, null, 1));
  }
});
/** 行を足して、落ちた物を返す */
export function record(group: string, name: string, rows: Array<{ target: string; engine: number; hits: number }>, n: number, info = false): Row[] {
  const out = rows.map((r) => {
    const emu = r.hits / n;
    const ok = Number.isFinite(r.engine) && Math.abs(r.engine - emu) < tol(r.engine, n);
    return { group, name, target: r.target, engine: r.engine, emu, n, ok, ...(info ? { info } : {}) };
  });
  ROWS.push(...out);
  return out.filter((r) => !r.ok);
}
export const failMsg = (bad: Row[]) => bad.slice(0, 8).map((r) => `${r.target}: エンジン ${(r.engine * 100).toFixed(2)}% / エミュ ${(r.emu * 100).toFixed(2)}%`).join("\n");

/** N 回打つ (結果は added / removed の id と段だけ残す) */
export type Out = { applied: boolean; added: Array<{ id: string; tier: number }>; removed: string[] };
/** ケースの名前から乱数の始まりをずらす (同じ seed 列をケース間で使い回すと、ずれが揃って見える) */
export const seedOf = (name: string): number => { let h = 2166136261; for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h % 1_000_000_000; };
let currentCase = "";
export const setCase = (name: string): void => { currentCase = name; };
export function run(item: StageItem, key: string, omens: string[], n: number, seedBase: number): Out[] {
  const seed0 = seedBase + seedOf(currentCase);
  const out: Out[] = [];
  for (let s = 1; s <= n; s++) {
    const r: StageApply = applyCurrency(data, item, key, mulberry32(seed0 + s), omens);
    out.push({ applied: r.applied, added: r.added.map((m) => ({ id: m.modId, tier: m.tierIndex })), removed: r.removed.map((m) => m.modId) });
  }
  return out;
}
