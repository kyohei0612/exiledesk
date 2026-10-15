// MOD 一覧の「付ける」の付け方 (普通 / フラクチャー / 冒涜。2026-10-15 オーナー、roadmap の「エミュレーターの細かいタスク」2)。
// 途中でも普通の MOD を冒涜で付けられる (骨の発現に出る物)。付けた結果と、手順 (plan) の再生が同じになる
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { forceKey } from "../src/services/craft-stage/apply-force";
import { allMods } from "../src/services/craft-stage/stage-core";
import { freshItem, playPlan } from "../src/services/craft-stage/run-plan";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem } from "../src/services/craft-stage/types";

const data = loadPatch();
const A = (item: StageItem, key: string) => applyCurrency(data, item, key, mulberry32(1));
const idOf = (base: string, re: RegExp): string => [...data.mods.values()].find((m) => m.id.startsWith(`${base}/`) && m.source === "normal" && re.test(m.id))!.id;
const look = (it: StageItem) => ({
  rarity: it.rarity, quality: it.quality ?? 0, sockets: it.sockets ?? 0,
  mods: [...it.prefixes, ...it.suffixes].map((m) => `${m.modId}#${m.tierIndex}:${JSON.stringify(m.values ?? null)}${m.fractured ? "f" : ""}${m.desecrated ? "d" : ""}${m.crafted ? "c" : ""}`),
});

describe("付け方: 冒涜 (force の d)", () => {
  it("普通の MOD を途中で冒涜で付けられる (レアにして、冒涜の印)", () => {
    const life = idOf("Rings", /IncreasedLife$/), fire = idOf("Rings", /FireResistance$/);
    const magic = A(freshItem(data, "Gold Ring", 82), forceKey(fire, "T2", "n")).item;
    const r = A(magic, forceKey(life, "T2", "d"));
    expect(r.applied).toBe(true);
    expect(r.item.rarity).toBe("rare");
    expect(allMods(r.item).find((m) => m.modId === life)?.desecrated).toBe(true);
    // 冒涜で付けた普通の MOD はフラクチャーできない (冒涜で付いた物は全部固定されない)
    expect(A(r.item, forceKey(life, "T2", "f")).applied).toBe(false);
    // 骨の発現に出る普通の MOD はアイテムレベルの決まりのまま
    expect(A({ ...freshItem(data, "Gold Ring", 5), rarity: "rare" }, forceKey(life, "T1", "d")).reason).toMatch(/アイテムレベル/);
  });
  it("冒涜専用の MOD はアイテムレベルを見ない (2026-10-10 確定)", () => {
    const d = data.bases.get("Rings")!.pools.desecrated!;
    const id = d.prefixes[0] ?? d.suffixes[0]!;
    const r = A({ ...freshItem(data, "Gold Ring", 20), rarity: "rare" }, forceKey(id, "T1", "d"));
    expect(r.applied).toBe(true);
    expect(allMods(r.item).find((m) => m.modId === id)?.desecrated).toBe(true);
  });
  it("骨に出ない MOD (エッセンス) は冒涜で付かない", () => {
    const e = data.bases.get("Rings")!.pools.essence;
    const r = A({ ...freshItem(data, "Gold Ring", 82), rarity: "rare" }, forceKey(e.prefixes[0] ?? e.suffixes[0]!, "T1", "d"));
    expect(r.applied).toBe(false);
  });
});

describe("付け方を選んで付けた手順の再生", () => {
  it("普通 / フラクチャー / 冒涜で付けた手は、手順 JSON の再生で同じアイテムになる (始めの状態の冒涜も)", async () => {
    const { craftStage } = await import("../src/state/craft-stage");
    craftStage.data.value = data;
    craftStage.base.value = "Gold Ring";
    craftStage.itemLevel.value = 82;
    craftStage.reset();
    // まだ打っていない間: 普通の MOD を冒涜で始めの状態に
    craftStage.addStartMod({ mod: idOf("Rings", /IncreasedLife$/), tier: "T2", desecrated: true });
    expect(allMods(craftStage.item.value!).some((m) => m.desecrated)).toBe(true);
    // 打ち始めた後: 普通・フラクチャーで付ける。冒涜は 1 つまでなので一度外してから途中で冒涜で付け直す
    craftStage.use(forceKey(idOf("Rings", /FireResistance$/), "T1", "n"));
    craftStage.use(forceKey(idOf("Rings", /IncreasedMana$/), "T3", "f"));
    craftStage.use(forceKey(idOf("Rings", /IncreasedLife$/), null, "x"));
    craftStage.use(forceKey(idOf("Rings", /ColdResistance$/), "T2", "d"));
    const log = craftStage.log.value;
    expect(log.every((p) => p.out.applied)).toBe(true);
    const it = craftStage.item.value!;
    expect(allMods(it).find((m) => m.modId === idOf("Rings", /IncreasedMana$/))?.fractured).toBe(true);
    expect(allMods(it).find((m) => m.modId === idOf("Rings", /ColdResistance$/))?.desecrated).toBe(true);
    const { final, steps } = playPlan(data, craftStage.plan(), {});
    expect(look(final)).toEqual(look(it));
    expect(steps.map((p) => look(p.after))).toEqual(log.map((p) => look(p.after)));
    // 1 手戻すで冒涜で付けた MOD が外れる
    craftStage.undo();
    expect(allMods(craftStage.item.value!).some((m) => m.desecrated)).toBe(false);
  });
});
