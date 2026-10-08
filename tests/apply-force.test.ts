// 指名で MOD を付ける手 (apply-force.ts、2026-10-08 オーナー「クラフト途中でも MOD 付けれるように、ただ基本的な事は抑えて」)
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { forceKey } from "../src/services/craft-stage/apply-force";
import { allMods } from "../src/services/craft-stage/stage-core";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyRune } from "../src/services/craft-stage/stage-runes";
import { mulberry32 } from "../src/services/htc/rng";
import type { PatchData } from "../src/vendor/poe2htc/engine/types";
import type { StageItem } from "../src/services/craft-stage/types";

const data: PatchData = await loadPatch();
const A = (item: StageItem, key: string) => applyCurrency(data, item, key, mulberry32(1));
const idOf = (base: string, re: RegExp): string => [...data.mods.values()].find((m) => m.id.startsWith(`${base}/`) && m.source === "normal" && re.test(m.id))!.id;

describe("指名で付ける (force:)", () => {
  it("ノーマルに付けたらマジック。マジックはプレ 1・サフィ 1 で、3 つ目は付かない", () => {
    const life = idOf("Rings", /IncreasedLife$/), fire = idOf("Rings", /FireResistance$/), cold = idOf("Rings", /ColdResistance$/);
    let it = freshItem(data, "Gold Ring", 82);
    let r = A(it, forceKey(life, "T2", "n"));
    expect(r.applied).toBe(true);
    expect(r.item.rarity).toBe("magic");
    it = r.item;
    r = A(it, forceKey(fire, "T1", "n"));
    expect(r.applied).toBe(true);
    it = r.item;
    r = A(it, forceKey(cold, "T1", "n"));
    expect(r.applied).toBe(false);
    expect(r.reason).toMatch(/サフィックス 1 つまで/);
    // 王者でレアにすれば付く
    it = A(it, "regal").item;
    expect(it.rarity).toBe("rare");
    // 王者でサフィに付いたら、サフィの枠 (3) の範囲で冷気耐性も付く (同じ系統でなければ)
    r = A(it, forceKey(cold, "T1", "n"));
    expect(r.applied || /同じ系統|埋まって/.test(r.reason ?? "")).toBe(true);
  });
  it("同じ系統が付いていれば付かない、段のアイテムレベルも見る", () => {
    const life = idOf("Rings", /IncreasedLife$/);
    const it = A(freshItem(data, "Gold Ring", 82), forceKey(life, "T3", "n")).item;
    const again = A(it, forceKey(life, "T1", "n"));
    expect(again.applied).toBe(false);
    expect(again.reason).toMatch(/同じ系統/);
    const low = A(freshItem(data, "Gold Ring", 5), forceKey(life, "T1", "n"));
    expect(low.applied).toBe(false);
    expect(low.reason).toMatch(/アイテムレベル/);
  });
  it("冒涜はレアにだけ、1 つまで", () => {
    const d = data.bases.get("Rings")!.pools.desecrated!;
    const [d1, d2] = [d.prefixes[0]!, d.prefixes[1] ?? d.suffixes[0]!];
    const magic = A(freshItem(data, "Gold Ring", 82), forceKey(idOf("Rings", /IncreasedLife$/), "T2", "n")).item;
    expect(A(magic, forceKey(d1, "T1", "d")).reason).toMatch(/レアにだけ/);
    const rare = A(magic, "regal").item;
    const one = A(rare, forceKey(d1, "T1", "d"));
    expect(one.applied).toBe(true);
    expect(allMods(one.item).some((m) => m.desecrated)).toBe(true);
    const two = A(one.item, forceKey(d2, "T1", "d"));
    expect(two.applied || /1 つまで|同じ系統|埋まって/.test(two.reason ?? "")).toBe(true);
    if (two.applied) expect(allMods(two.item).filter((m) => m.desecrated).length).toBe(1);
  });
  it("エッセンスの MOD はクラフト MOD として付く (1 つまで)", () => {
    const e = data.bases.get("Rings")!.pools.essence;
    const e1 = e.prefixes[0]!;
    const r = A(freshItem(data, "Gold Ring", 82), forceKey(e1, "T1", "e"));
    expect(r.applied).toBe(true);
    expect(allMods(r.item).some((m) => m.crafted)).toBe(true);
    const e2 = e.suffixes[0]!;
    const r2 = A(r.item, forceKey(e2, "T1", "e"));
    expect(r2.applied).toBe(false);
    expect(r2.reason).toMatch(/1 つまで/);
  });
  it("ルーンの MOD はそのルーンを差していないと付かない", () => {
    const kol = [...data.mods.values()].find((m) => m.id.startsWith("Gloves_dex/") && m.rune === "kolrs-hunt")!;
    const white = { ...freshItem(data, "Suede Bracers", 82), sockets: 1 };
    const no = A(white, forceKey(kol.id, "T1", "n"));
    expect(no.applied).toBe(false);
    expect(no.reason).toMatch(/ルーンを先に差す/);
    const socketed = applyRune(white, "rune:Kolr's Hunt", data).item;
    const yes = A(socketed, forceKey(kol.id, "T1", "n"));
    expect(yes.applied).toBe(true);
  });
});
