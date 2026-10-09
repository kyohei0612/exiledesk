// 確率表 (held-odds.ts) と打った結果 (エミュレーター) の全突き合わせ (2026-10-09 オーナー「お告げ系全部、異界も、コルとか特殊モッド含め全部確認せえ」)
// 部位・カレンシー・お告げの組み合わせごとに、表の確率と、実際に打って付いた / 候補に出た割合が合うか。表で 0% の物は一度も出てはいけない
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { revealOffers } from "../src/services/craft-stage/apply-desecrate";
import { heldOdds } from "../src/services/craft-stage/held-odds";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem } from "../src/services/craft-stage/types";

const data = loadPatch();
const A = (it: StageItem, key: string, seed: number, omens: string[] = []): StageItem => {
  const r = applyCurrency(data, it, key, mulberry32(seed), omens);
  if (!r.applied) throw new Error(`${key}: ${r.reason}`);
  return r.item;
};
const N = 3000;

const ringNormal = freshItem(data, "Gold Ring", 82);
const ringMagic = A(ringNormal, "transmute", 11);
const ringRare = A(ringMagic, "regal", 12);
const ringQual = A(ringRare, "catalyst_life", 13);
const glovesRare = A(A(A(freshItem(data, "Riveted Mitts", 82), "transmute", 21), "regal", 22), "artificer", 23);
const glovesKol = A(glovesRare, "rune:Kolr's Hunt", 24);
const wandRare = A(A(freshItem(data, "Volatile Wand", 82), "transmute", 31), "regal", 32);
const bodyRare = A(A(freshItem(data, "Garment", 82), "transmute", 41), "regal", 42);
const ring60 = A(A(freshItem(data, "Gold Ring", 60), "transmute", 51), "regal", 52);
const amuRare = A(A(freshItem(data, "Gold Amulet", 82), "transmute", 61), "regal", 62);
const quiverRare = A(A(freshItem(data, "Broadhead Quiver", 82), "transmute", 71), "regal", 72);
/** 両側が埋まった指輪 (高貴で 6 つまで) */
let ringFull = ringRare;
for (let i = 0; i < 6 && ringFull.prefixes.length + ringFull.suffixes.length < 6; i++) ringFull = A(ringFull, "exalt", 80 + i);
/** 深淵の王の印が付いた指輪 (深淵のエッセンス) */
const ringMark = A(ringRare, "essence:perfect:Rings/PerfectEssence_EssenceAbyss", 90);

type Case = { name: string; item: StageItem; key: string; omens?: string[] };
const ADD: Case[] = [
  { name: "指輪 ノーマル 変成", item: ringNormal, key: "transmute" },
  { name: "指輪 ノーマル 完全の変成", item: ringNormal, key: "transmute_perfect" },
  { name: "指輪 ノーマル 錬金", item: ringNormal, key: "alchemy" },
  { name: "指輪 マジック 増強", item: ringMagic, key: "augment" },
  { name: "指輪 マジック 王者", item: ringMagic, key: "regal" },
  { name: "指輪 レア 高貴", item: ringRare, key: "exalt" },
  { name: "指輪 レア 高貴 + 左", item: ringRare, key: "exalt", omens: ["OmenofSinistralExaltation"] },
  { name: "指輪 レア 高貴 + 右", item: ringRare, key: "exalt", omens: ["OmenofDextralExaltation"] },
  { name: "指輪 品質 高貴 + 触媒", item: ringQual, key: "exalt", omens: ["OmenofCatalysingExaltation"] },
  { name: "指輪 レア 大いなる高貴", item: ringRare, key: "exalt", omens: ["OmenofGreaterExaltation"] },
  { name: "指輪 品質 (ライフ) 大いなる高貴 + 触媒", item: ringQual, key: "exalt", omens: ["OmenofGreaterExaltation", "OmenofCatalysingExaltation"] },
  { name: "指輪 レア 大いなる高貴 + 左", item: ringRare, key: "exalt", omens: ["OmenofGreaterExaltation", "OmenofSinistralExaltation"] },
  { name: "鎧 大いなる高貴", item: bodyRare, key: "exalt", omens: ["OmenofGreaterExaltation"] },
  { name: "指輪 レア カオス", item: ringRare, key: "chaos" },
  { name: "指輪 レア カオス + 削減", item: ringRare, key: "chaos", omens: ["OmenofWhittling"] },
  { name: "指輪 レア カオス + 左の抹消", item: ringRare, key: "chaos", omens: ["OmenofSinistralErasure"] },
  { name: "指輪 レア 完全の高貴", item: ringRare, key: "exalt_perfect" },
  { name: "指輪 両側が埋まった カオス", item: ringFull, key: "chaos" },
  { name: "矢筒 高貴", item: quiverRare, key: "exalt" },
  { name: "手袋 コル無し 高貴", item: glovesRare, key: "exalt" },
  { name: "手袋 コル 高貴", item: glovesKol, key: "exalt" },
  { name: "手袋 コル カオス", item: glovesKol, key: "chaos" },
  { name: "火のワンド 高貴", item: wandRare, key: "exalt" },
  { name: "鎧 高貴", item: bodyRare, key: "exalt" },
];
const BONE: Case[] = [
  { name: "指輪 保存された鎖骨", item: ringRare, key: "desecrate" },
  { name: "指輪 古代の鎖骨", item: ringRare, key: "desecrate_ancient" },
  { name: "指輪 変質した鎖骨 (異界)", item: ringRare, key: "desecrate_altered" },
  { name: "指輪 骨 + 左のネクロマンシー", item: ringRare, key: "desecrate", omens: ["OmenofSinistralNecromancy"] },
  { name: "指輪 骨 + ウラマン", item: ringRare, key: "desecrate", omens: ["OmenoftheSovereign"] },
  { name: "指輪 骨 + アマナム", item: ringRare, key: "desecrate", omens: ["OmenoftheLiege"] },
  { name: "指輪 骨 + 反響", item: ringRare, key: "desecrate", omens: ["OmenofAbyssalEchoes"] },
  { name: "手袋 コル 骨", item: glovesKol, key: "desecrate" },
  { name: "火のワンド 骨", item: wandRare, key: "desecrate" },
  { name: "鎧 骨", item: bodyRare, key: "desecrate" },
  { name: "指輪 アイテムレベル 60 骨 (専用 MOD 無し)", item: ring60, key: "desecrate" },
  { name: "指輪 アイテムレベル 60 噛み切られた骨", item: ring60, key: "desecrate_gnawed" },
  { name: "アミュレット 変質した鎖骨", item: amuRare, key: "desecrate_altered" },
  { name: "アミュレット 骨 + ブラックブラッド + 右のネクロマンシー", item: amuRare, key: "desecrate", omens: ["OmenoftheBlackblooded", "OmenofDextralNecromancy"] },
  { name: "矢筒 骨", item: quiverRare, key: "desecrate" },
  { name: "指輪 深淵の王の印 + 骨", item: ringMark, key: "desecrate" },
];

/** 表と実際の差。表の確率 p に対して許す差 (二項の 4 σ と 1.5 ポイントの大きい方) */
const tol = (p: number) => Math.max(0.015, 4 * Math.sqrt((p * (1 - p)) / N));

describe("確率表 = 打った結果 (MOD を足す手)", () => {
  for (const c of ADD) {
    it(c.name, () => {
      const h = heldOdds(data, c.item, c.key, c.omens ?? []);
      expect(h, "表が出ない").not.toBeNull();
      const seen = new Map<string, number>();
      for (let s = 1; s <= N; s++) {
        const r = applyCurrency(data, c.item, c.key, mulberry32(1000 + s), c.omens ?? []);
        expect(r.applied, r.reason).toBe(true);
        // 付いた MOD を全部数える (大いなる高貴は 2 つ。表は「どれかで付く確率」。前は 1 つ目だけ見ていて、大いなる高貴の抜けを見逃した)
        for (const id of new Set((r.added ?? []).map((m) => m.modId))) seen.set(id, (seen.get(id) ?? 0) + 1);
      }
      for (const [id, n] of seen) expect(h!.byMod.has(id), `表で 0% なのに付いた: ${id}`).toBe(true);
      for (const [id, x] of h!.byMod) {
        const p = x.w / h!.total;
        expect(Math.abs(p - (seen.get(id) ?? 0) / N), `${id} 表 ${p.toFixed(3)} / 実際 ${((seen.get(id) ?? 0) / N).toFixed(3)}`).toBeLessThan(tol(p));
      }
    });
  }
  it("大いなる高貴のお告げを掛けると、表の確率が上がる (2 つ付くので)", () => {
    const one = heldOdds(data, ringQual, "exalt", ["OmenofCatalysingExaltation"])!;
    const two = heldOdds(data, ringQual, "exalt", ["OmenofCatalysingExaltation", "OmenofGreaterExaltation"])!;
    const life = [...two.byMod.keys()].find((id) => /Life/.test(id))!;
    expect(two.byMod.get(life)!.w / two.total).toBeGreaterThan((one.byMod.get(life)!.w / one.total) * 1.5);
  });
  it("コルを差すとマークスマンの MOD に確率が出る、差していなければ 0", () => {
    const rune = (h: ReturnType<typeof heldOdds>) => [...(h?.byMod.keys() ?? [])].filter((id) => data.mods.get(id)?.rune === "kolrs-hunt").length;
    expect(rune(heldOdds(data, glovesRare, "exalt", []))).toBe(0);
    expect(rune(heldOdds(data, glovesKol, "exalt", []))).toBeGreaterThan(0);
  });
});

describe("確率表 = 打った結果 (骨: 候補 3 つに出る確率)", () => {
  for (const c of BONE) {
    it(c.name, () => {
      const om = c.omens ?? [];
      const h = heldOdds(data, c.item, c.key, om);
      expect(h?.bone, "骨の表が出ない").toBe(true);
      const seen = new Map<string, number>();
      for (let s = 1; s <= N; s++) {
        const b = applyCurrency(data, c.item, c.key, mulberry32(2000 + s), om);
        expect(b.applied, b.reason).toBe(true);
        const o = revealOffers(data, b.item, mulberry32(9000 + s));
        const shown = new Set(o.first.map((m) => m.modId));
        if (om.includes("OmenofAbyssalEchoes")) for (const m of o.reroll) shown.add(m.modId);
        for (const id of shown) seen.set(id, (seen.get(id) ?? 0) + 1);
      }
      for (const [id] of seen) expect(h!.byMod.has(id), `表で 0% なのに候補に出た: ${id}`).toBe(true);
      for (const [id, x] of h!.byMod) {
        const p = x.w;
        expect(Math.abs(p - (seen.get(id) ?? 0) / N), `${id} 表 ${p.toFixed(3)} / 実際 ${((seen.get(id) ?? 0) / N).toFixed(3)}`).toBeLessThan(tol(p));
      }
    });
  }
});

describe("確率表の計算の速さ", () => {
  it("骨の表は 1 回 300ms 以内 (持ち替えるたびに作る)", () => {
    const t0 = performance.now();
    heldOdds(data, wandRare, "desecrate", []);
    heldOdds(data, bodyRare, "desecrate_ancient", []);
    expect((performance.now() - t0) / 2).toBeLessThan(300);
  });
});
