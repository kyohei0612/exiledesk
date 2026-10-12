/**
 * クラフトステージ (1 手ずつのカレンシー)。scripts/check-craft-stage.mjs の大事な所をテストに移した物
 * (check-craft-stage.mjs は POE2Tube の見本の手順も読むので手元でだけ回す。こちらはリポジトリの中だけで完結)
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { freshItem, playPlan, runPlan } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem } from "../src/services/craft-stage/types";
import type { CraftStagePlan } from "../src/services/craft-stage/contract";

const data = loadPatch();
const META = { prices: {}, exiledeskVersion: "test", patch: "0.5.0", league: null, generatedAt: "2026-09-29T00:00:00Z" };
const plan = (base: string, steps: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): CraftStagePlan =>
  ({ schema: "craft-stage-plan/1", base, item_level: 82, seed: 7, steps, ...extra }) as unknown as CraftStagePlan;
const A = (item: StageItem, key: string, seed = 1, hint = {}) => applyCurrency(data, item, key, mulberry32(seed), [], hint);
const rare = (base: string, lvl: number): StageItem => {
  let it = freshItem(data, base, lvl);
  for (const k of ["transmute", "regal"]) it = A(it, k, 3).item;
  return it;
};

describe("基本の流れ", () => {
  it("同じ手順・同じ seed なら同じ結果 (動画の撮り直しで変わらない)", () => {
    const p = plan("Gold Ring", [{ currency: "transmute" }, { currency: "augment" }, { currency: "regal" }, { currency: "exalt" }]);
    expect(JSON.stringify(runPlan(data, p, META))).toBe(JSON.stringify(runPlan(data, p, META)));
  });
  it("白 → 変成で青 → 王者で黄", () => {
    const r = runPlan(data, plan("Gold Ring", [{ currency: "transmute" }, { currency: "regal" }]), META);
    expect(r.steps.map((s) => s.after.rarity)).toEqual(["magic", "rare"]);
  });
  it("コラプトしたアイテムには普通のカレンシーが打てない", () => {
    expect(A({ ...rare("Gold Ring", 82), corrupted: true }, "exalt").applied).toBe(false);
  });
});

describe("アクト中に落ちる物", () => {
  it("砥石は 1 個 1% (レアリティに関係なし、要望 ㉞-8)。20 回で品質 20%、21 回目は打てない", () => {
    const r = runPlan(data, plan("Hardwood Spear", [{ currency: "whetstone", times: 21 }], { item_level: 30 }), META);
    expect(r.final.quality).toBe(20);
    expect(r.steps[0]!.after.quality).toBe(1);
    expect(r.steps[20]!.applied).toBe(false);
  });
  it("宝飾職人のオーブ: 見習い 3 / 上級 4 / 完全 5", () => {
    const r = runPlan(data, plan("Arc", [{ currency: "jeweller_lesser" }, { currency: "jeweller_greater" }, { currency: "jeweller_perfect" }]), META);
    expect(r.steps.map((s) => s.after.gem_sockets)).toEqual([3, 4, 5]);
  });
  it("シャードは 10 個でオーブ 1 個", () => {
    const r = runPlan(data, plan("Gold Ring", [{ currency: "regal_shard", times: 11 }]), META);
    expect(r.final.shards?.regal_shard).toBe(1);
  });
});

describe("2026-09-29 に足した物", () => {
  it("噛み切られた骨はアイテムレベル 64 以下だけ", () => {
    expect(A(rare("Gold Ring", 82), "desecrate_gnawed").applied).toBe(false);
    expect(A(rare("Gold Ring", 60), "desecrate_gnawed").applied).toBe(true);
  });
  it("秘術師の彫刻針はワンドにだけ", () => {
    // 装備の品質カレンシーは 1 個で +1 か +2 (2026-10-07 オーナーの訂正、POE2Tube 要望 ㊱)。20 個打っても上限 20% を超えない
    expect([1, 2]).toContain(A(freshItem(data, "Attuned Wand", 30), "etcher").item.quality);
    let wand = freshItem(data, "Attuned Wand", 30);
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) { const q = wand.quality; wand = A(wand, "etcher", i + 1).item; if (wand.quality < 20) seen.add(wand.quality - q); }
    expect(wand.quality).toBe(20);
    expect([...seen].sort()).toEqual([1, 2]);
    expect(A(freshItem(data, "Hardwood Spear", 30), "etcher").applied).toBe(false);
  });
  it("インフューザーは上限 +10% まで、超えた時の outcome で コラプト / 無事", () => {
    let arm = freshItem(data, "Rusted Cuirass", 30);
    for (let i = 0; i < 20; i++) arm = A(arm, "scrap").item;
    expect(A(arm, "vaal_infuser_armour", 1, { outcome: "safe" }).item).toMatchObject({ quality: 21, corrupted: false });
    expect(A(arm, "vaal_infuser_armour", 1, { outcome: "corrupted" }).item.corrupted).toBe(true);
  });
  it("生贄のオーブはエンチャントを上位版にして MOD を 1 つ消す", () => {
    const r = { ...rare("Gold Ring", 82), corrupted: true, enchant: { id: "CorruptionAllResistances1", textJa: "x", textEn: "x" } };
    const s = A(r, "sacrifice_jewellery", 5);
    expect(s.item.enchant?.id.startsWith("CorruptionUpgrade")).toBe(true);
    expect(s.item.prefixes.length + s.item.suffixes.length).toBe(r.prefixes.length + r.suffixes.length - 1);
  });
  it("鏡はコピーを作るだけで元のアイテムは変わらない (要望 ㉝ の 7)、髪束の予見はアイテムが変わると消える", () => {
    const m = A(rare("Gold Ring", 82), "mirror");
    expect(m.applied).toBe(true);
    expect(m.item.mirrored).toBeFalsy();
    expect(A(m.item, "exalt").applied).toBe(true);
    const h = A(rare("Gold Ring", 82), "hinekora").item;
    expect(h.foreseen).toBe(true);
    expect(A(h, "exalt", 3).item.foreseen).toBe(false);
  });
});

describe("解呪・サルベージ (要望 ⑰-5)", () => {
  it("解呪はマジック → 変成のシャード、レア → 王者のシャード、ノーマルは不可。後は何も打てない", () => {
    const magic = A(freshItem(data, "Gold Ring", 30), "transmute").item;
    const d = A(magic, "disenchant");
    expect(d.item).toMatchObject({ disposed: "disenchant", shards: { transmute_shard: 1 } });
    expect(A(d.item, "augment").applied).toBe(false);
    expect(A(rare("Gold Ring", 82), "disenchant").item.shards).toEqual({ regal_shard: 1 });
    expect(A(freshItem(data, "Gold Ring", 30), "disenchant").applied).toBe(false);
  });
  it("サルベージは品質 → 品質カレンシー、ソケット → 熟練工のシャード。どちらも無ければ不可", () => {
    const plain = freshItem(data, "Rusted Cuirass", 30);
    expect(A(plain, "salvage").applied).toBe(false);
    const q = A(plain, "scrap").item;
    expect(A(q, "salvage").item).toMatchObject({ disposed: "salvage", gained: { scrap: 1 } });
    const s = A(q, "artificer").item;
    expect(A(s, "salvage").item).toMatchObject({ gained: { scrap: 1 }, shards: { artificer_shard: 1 } });
  });
});

describe("ルーンと上の数値 (要望 ⑰-1 / ⑰-2)", () => {
  it("ルーンはソケットが要る、部位で効き目が違う (弓 = 火ダメージ追加、防具 = 火耐性)", () => {
    const bow = freshItem(data, "Crude Bow", 20);
    expect(A(bow, "rune:Lesser Desert Rune").applied).toBe(false);
    const socketed = A(bow, "artificer").item;
    const r = A(socketed, "rune:Lesser Desert Rune").item;
    expect(r.augments?.[0]).toMatchObject({ cat: "マーシャル武器", textJa: "4から6の火ダメージを追加する" });
    // 空きが無い時は置き換え (普通のルーンは置き換えられる。2026-10-03 augment-rules.ts)
    expect(A(r, "rune:Lesser Glacial Rune").item.augments?.map((a) => a.en)).toEqual(["Lesser Glacial Rune"]);
    const arm = A(A(freshItem(data, "Chain Mail", 20), "artificer").item, "rune:Lesser Desert Rune").item;
    expect(arm.augments?.[0]?.textJa).toBe("火耐性 +10%");
  });
  it("上の数値にルーンの追加ダメージと品質が乗る", async () => {
    const { propRows } = await import("../src/services/craft-stage/stage-props");
    const bow = freshItem(data, "Crude Bow", 20);
    expect(propRows(bow).find((x) => x.key === "phys")).toMatchObject({ value: "6〜9", up: false });
    const r = A(A(bow, "artificer").item, "rune:Lesser Desert Rune").item;
    expect(propRows(r).find((x) => x.key === "fire")).toMatchObject({ value: "4〜6", up: true });
    const q = A(r, "whetstone").item;
    expect(propRows(q).find((x) => x.key === "phys")?.value).toBe(`${Math.round(6 * 1.05)}〜${Math.round(9 * 1.05)}`);
  });
  it("ローカルの MOD (物理ダメージ増加) が物理ダメージに乗る", async () => {
    const { propRows } = await import("../src/services/craft-stage/stage-props");
    let it = freshItem(data, "Crude Bow", 82);
    for (let s = 1; s < 200; s++) {
      const r = A(freshItem(data, "Crude Bow", 82), "transmute", s).item;
      if (r.prefixes.some((m) => m.stats?.includes("local_physical_damage_+%"))) { it = r; break; }
    }
    const inc = it.prefixes.find((m) => m.stats?.includes("local_physical_damage_+%"))!;
    const k = 1 + inc.values[0]! / 100;
    expect(propRows(it).find((x) => x.key === "phys")).toMatchObject({ value: `${Math.round(6 * k)}〜${Math.round(9 * k)}`, up: true });
  });
  it("エッセンスの MOD も上の数値に乗る (要望 6646644d: 英雄の鎧 + 強化のエッセンスでアーマー・回避力が変わらなかった)", async () => {
    const { propRows } = await import("../src/services/craft-stage/stage-props");
    const magic = A(freshItem(data, "Heroic Armour", 82), "transmute", 5).item;
    expect(propRows(magic).map((x) => x.value)).toEqual(["273", "248"]);
    const r = A(magic, "essence:lesser:Body_Armours_str_dex/Essence_DefencesPercent", 3).item;
    const ess = r.prefixes.find((m) => m.modId === "Body_Armours_str_dex/Essence_DefencesPercent")!;
    // 胴 (筋力/器用さ) に付くのは「アーマーと回避力」(poe2db の普通の段 Lv16 の 27-42% と同じ)
    expect(ess.textEn).toMatch(/increased Armour and Evasion$/);
    const k = 1 + ess.values[0]! / 100;
    expect(propRows(r).map((x) => x.value)).toEqual([String(Math.round(273 * k)), String(Math.round(248 * k))]);
  });
  it("冒涜の MOD も中身のタグでカタリストの品質が乗る (2026-10-12 オーナー「MOD にもタグないんじゃね」)", async () => {
    const { makeStageMod, boostedMod } = await import("../src/services/craft-stage/stage-core");
    const mod = data.mods.get("Rings/Desecrated_ColdAndChaosDamageResistance")!;
    expect(mod.tags).toEqual(expect.arrayContaining(["kurgal_mod", "resistance"]));
    const m = makeStageMod(mod, "suffix", 0, mulberry32(1));
    const ring = { ...freshItem(data, "Gold Ring", 82), rarity: "rare" as const, quality: 20, prefixes: [], suffixes: [m] };
    expect(boostedMod({ ...ring, qualityTag: "resistance" }, m, data)?.values[0]).toBe(Math.floor(m.values[0]! * 1.2));
    expect(boostedMod({ ...ring, qualityTag: "life" }, m, data)).toBeNull();
  });
  it("暗黙の MOD にも中身のタグがあり、カタリストの品質で伸びる (2026-10-12 オーナー「カタリストで上がるよ、普通は」)", async () => {
    const { implicitRows } = await import("../src/services/craft-stage/stage-props");
    const ring = freshItem(data, "Amethyst Ring", 82);
    const [plain] = implicitRows(ring, true);
    expect(plain!.tags).toContain("resistance");
    const v = plain!.stats[0]![1];
    expect(implicitRows({ ...ring, quality: 20, qualityTag: "resistance" }, true)[0]).toMatchObject({ boosted: true, stats: [["base_chaos_damage_resistance_%", Math.floor(v * 1.2)]] });
    expect(implicitRows({ ...ring, quality: 20, qualityTag: "life" }, true)[0]!.boosted).toBe(false);
  });
  it("神のオーブ・祝福のお告げで暗黙の数値も振り直す (2026-10-12 オーナー「暗黙も数値の変動はある」)", async () => {
    const { implicitRows } = await import("../src/services/craft-stage/stage-props");
    const ring = rare("Amethyst Ring", 82);
    const v0 = implicitRows(ring, true)[0]!.stats[0]![1];
    const seen = new Set<number>([v0]);
    let cur = ring;
    for (let s = 1; s <= 12; s++) { cur = A(cur, "divine", s).item; seen.add(implicitRows(cur, true)[0]!.stats[0]![1]); }
    expect(seen.size).toBeGreaterThan(1);
    const b = applyCurrency(data, ring, "divine", mulberry32(1), ["OmenoftheBlessed"]);
    expect(b.applied).toBe(true);
    expect(b.item.prefixes).toEqual(ring.prefixes);
    expect(b.item.implicitRoll).toBe(1);
  });
  it("暗黙の値を手で決められる (iset、範囲の中だけ)。神のオーブで振り直すと手の値は消える", async () => {
    const { implicitRows } = await import("../src/services/craft-stage/stage-props");
    const ring = freshItem(data, "Amethyst Ring", 82);
    const set = A(ring, "iset:0:13").item;
    expect(implicitRows(set, true)[0]!.stats[0]![1]).toBe(13);
    expect(implicitRows(A(ring, "iset:0:99").item, true)[0]!.stats[0]![1]).toBe(13);
    expect(A(set, "divine", 3).item.implicitFixed).toBeUndefined();
  });
  it("ジュエルはアイテムレベルを見ない (完全のカレンシー・骨の制限も無し。2026-10-12 オーナー)", () => {
    const low = A(A(freshItem(data, "Emerald", 20), "transmute").item, "regal").item;
    expect(A(low, "exalt_perfect").applied).toBe(true);
    expect(A(low, "desecrate_ancient").applied).toBe(true);
  });
  it("ジュエルもカタリストで伸びる (中身のタグ = displayTags。2026-10-12 オーナー「ジュエルにもカタリストであがる」)", async () => {
    const { makeStageMod, boostedMod } = await import("../src/services/craft-stage/stage-core");
    const mod = data.mods.get("Jewels_dex/JewelAttackCriticalChance")!;
    const m = makeStageMod(mod, mod.type === "suffix" ? "suffix" : "prefix", 0, mulberry32(1));
    const jewel = { ...freshItem(data, "Emerald", 82), rarity: "rare" as const, quality: 20, prefixes: m.side === "prefix" ? [m] : [], suffixes: m.side === "suffix" ? [m] : [] };
    expect(boostedMod({ ...jewel, qualityTag: "attack" }, m, data)?.values[0]).toBe(Math.floor(m.values[0]! * 1.2));
    expect(boostedMod({ ...jewel, qualityTag: "life" }, m, data)).toBeNull();
    // カタリストもジュエルに打てる
    expect(A(freshItem(data, "Emerald", 82), "catalyst_attack").applied).toBe(true);
  });
  it("発現で付いた MOD にも付いた瞬間の確率が付く (2026-10-12 オーナー「確率が出てるはずなのにアイテムには出ない」)", () => {
    const d = A(rare("Gold Ring", 82), "desecrate_ancient", 4);
    expect(d.applied).toBe(true);
    const r = A(d.item, "reveal:1", 5);
    expect(r.applied).toBe(true);
    expect(r.rolled?.[0]).toMatchObject({ modId: r.added[0]!.modId });
    expect(r.rolled![0]!.chance).toBeGreaterThan(0);
    expect(r.rolled![0]!.chance).toBeLessThan(1);
  });
  it("エッセンス・冒涜のローカル MOD は、どの部位でも上の数値を変える", async () => {
    const { propRows } = await import("../src/services/craft-stage/stage-props");
    const { makeStageMod } = await import("../src/services/craft-stage/stage-core");
    const LOCAL = /(increased|reduced) (Armour|Evasion Rating|Energy Shield|Armour and Evasion|Armour and Energy Shield|Evasion and Energy Shield)$|^\+# to (Armour|Evasion Rating|maximum Energy Shield)$|increased Physical Damage$|^Adds .* Damage$|to Critical Hit Chance$/m;
    const bad: string[] = [];
    for (const [cid, cls] of data.bases) {
      const base = cls.bases?.[0];
      if (!base || /^Gloves/.test(cid)) continue;
      const item = freshItem(data, base, 82);
      const before = JSON.stringify(propRows(item));
      if (before === "[]") continue;
      for (const mod of data.mods.values()) {
        if (!mod.id.startsWith(`${cid}/`) || mod.source === "normal" || !LOCAL.test(mod.text ?? "") || /Global|Minion|Companion|Totem|Spell|while|from Equipped|Thorns/.test(mod.text ?? "")) continue;
        const side = mod.type === "suffix" ? "suffix" : "prefix";
        const m = makeStageMod(mod, side, 0, mulberry32(1));
        const it2 = { ...item, rarity: "rare" as const, prefixes: side === "prefix" ? [m] : [], suffixes: side === "suffix" ? [m] : [] };
        if (JSON.stringify(propRows(it2)) === before) bad.push(mod.id);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("今のゲームの決まり (2026-09-29 見直し、クライアントの表と相場)", () => {
  it("熟練工の上限はベースごと: 片手武器・兜は 1、胴・両手は 2 (PoB の socketLimit − 2)", async () => {
    const { socketCapOf } = await import("../src/services/craft-stage/stage-runes");
    const cap = (b: string) => { const it = freshItem(data, b, 30); return socketCapOf(it.base, it.cls.category); };
    expect(cap("Hardwood Spear")).toBe(1);
    expect(cap("Chain Mail")).toBe(2);
    expect(cap("Crescent Quarterstaff")).toBe(2);
    expect(cap("Gold Ring")).toBe(0);
  });
  it("普通のルーンはコラプトの後でもはめられる (CanSocketInCorruptedSanctified)", () => {
    const it = { ...A(freshItem(data, "Chain Mail", 30), "artificer").item, corrupted: true };
    expect(A(it, "rune:Lesser Desert Rune").applied).toBe(true);
  });
  it("今のゲームに無いお告げ (王者・錬金・大いなる消去・コラプト) を掛けたら打てない", () => {
    const magic = A(freshItem(data, "Gold Ring", 82), "transmute").item;
    const r = applyCurrency(data, magic, "regal", mulberry32(1), ["OmenofSinistralCoronation"]);
    expect(r).toMatchObject({ applied: false, reason: "今のゲームに無いお告げ" });
  });
  it("相場に無いルーン (Tempered) は棚に出さず、打てない", async () => {
    const { runeKeys } = await import("../src/services/craft-stage/stage-runes");
    expect(runeKeys().includes("rune:Lesser Tempered Rune")).toBe(false);
    expect(runeKeys().includes("rune:Perfect Desert Rune")).toBe(true);
    const s = A(freshItem(data, "Chain Mail", 30), "artificer").item;
    expect(A(s, "rune:Lesser Tempered Rune").applied).toBe(false);
  });
});

describe("指名 (要望 ⑱)", () => {
  it("付く MOD を指名できる。付きうる物だけで、結果に指名しなかった時の確率", () => {
    const r = playPlan(data, plan("Gold Ring", [{ currency: "transmute", pick: { mod: "ColdResistance", tier: "T6" } }]), {});
    const st = r.steps[0]!;
    expect(st.after.prefixes.length + st.after.suffixes.length).toBe(1);
    expect(st.added[0]).toMatchObject({ family: "ColdResistance", tierName: "T6" });
    const out = st.out as unknown as { picked: boolean; pick_chance: Array<{ chance: number }> };
    expect(out.picked).toBe(true);
    expect(out.pick_chance[0]!.chance).toBeGreaterThan(0);
    expect(out.pick_chance[0]!.chance).toBeLessThan(1);
  });
  it("付けられない指名はエラーで止まる (アイテムレベルで出ない段)", () => {
    expect(() => playPlan(data, plan("Gold Ring", [{ currency: "transmute", pick: { mod: "ColdResistance", tier: "T1" } }], { item_level: 10 }), {})).toThrow(/指名できない/);
  });
  it("カオスは消える MOD と付く MOD を指名できる", () => {
    const p = plan("Gold Ring", [{ currency: "chaos", remove: "ColdResistance", pick: { mod: "FireResistance" } }], { start: { mods: [{ mod: "ColdResistance" }, { mod: "IncreasedLife" }, { mod: "Strength" }] } });
    const st = playPlan(data, p, {}).steps[0]!;
    expect(st.removed[0]?.family).toBe("ColdResistance");
    expect(st.added[0]?.family).toBe("FireResistance");
  });
  it("始めの状態を MOD で指名できる (3 つからはレア)。要求レベルが結果に入る", () => {
    const p = plan("Crescent Quarterstaff", [{ currency: "exalt" }], { start: { mods: [{ mod: "LocalPhysicalDamagePercent" }, { mod: "LocalIncreasedAttackSpeed" }, { mod: "LocalColdDamage" }] } });
    const r = playPlan(data, p, {});
    expect(r.steps[0]!.before.rarity).toBe("rare");
    // 要求レベル = max(ベース 20、各 MOD の floor(MOD レベル × 0.8)) (要望 ㉟-2)
    const mods = [...r.steps[0]!.after.prefixes, ...r.steps[0]!.after.suffixes];
    const want = Math.max(20, ...mods.map((m) => Math.floor(m.modLevel * 0.8)));
    expect((r.steps[0]!.out.after as unknown as { requirements: { level: number } }).requirements.level).toBe(want);
  });
});
