/**
 * 部位の種別とカレンシーの使い先の総当たり (2026-10-13 総点検、docs/reviews/2026-10-13-item-class-audit.md)。
 *
 * 期待値はカレンシーの**説明文の言葉**をそのまま部位の名前で書き直した物 (クライアントの部位 Id)。作りは item-classes.ts のまとまりで引くので、
 * ここで 2 つが合うことを見る。新しい部位がデータに入って item-classes.json に無ければ落ちる (入れ忘れを止める)
 */
import { beforeAll, describe, expect, it } from "vitest";
import rows from "../src/services/htc/base-rows.json";
import jewelBases from "../src/services/htc/jewel-bases.json";
import { loadHtcPatch } from "../src/services/htc/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { clientClassOf, ENGINE_CATEGORIES } from "../src/services/mods/item-classes";
import { bossOmenAllowed, desecrationBoneFor } from "../src/vendor/poe2htc/engine/probability";
import { applyQuality } from "../src/services/craft-stage/apply-act";
import { applyExtra } from "../src/services/craft-stage/apply-extra";
import { applyOther } from "../src/services/craft-stage/apply-other";
import { socketCapOf } from "../src/services/craft-stage/stage-runes";
import type { PatchData } from "../src/vendor/poe2htc/engine/types";
import type { StageItem } from "../src/services/craft-stage/types";

const strip = (cls: string): string => cls.replace(/_(str|dex|int|str_dex|str_int|dex_int|str_dex_int|fire|cold|lightning|chaos|physical|cannon)$/, "");
/** 部位ごとに 1 つのベース (データにある全部の部位) */
const SAMPLE = new Map<string, string>();
for (const [name, cls] of Object.entries(rows as Record<string, string>)) if (!SAMPLE.has(strip(cls))) SAMPLE.set(strip(cls), name);
for (const it of (jewelBases as { items: Array<{ category: string; bases: string[] }> }).items) if (!SAMPLE.has(it.category) && it.bases[0]) SAMPLE.set(it.category, it.bases[0]);

// 説明文の言葉 → クライアントの部位 Id (期待値。作りとは別に書く)
const WEAPON = ["Bow", "Crossbow", "One Hand Mace", "Two Hand Mace", "Warstaff", "Spear", "Talisman", "Wand", "Staff", "Sceptre"];
const MARTIAL = ["Bow", "Crossbow", "One Hand Mace", "Two Hand Mace", "Warstaff", "Spear", "Talisman"];
const CASTER = ["Wand", "Staff", "Sceptre"]; // 「wand, staff or sceptre」
const ARMOUR = ["Helmet", "Body Armour", "Gloves", "Boots", "Shield", "Buckler", "Focus"];
const JEWELLERY = ["Ring", "Amulet", "Belt"];
const has = (list: readonly string[]) => (cat: string): boolean => list.includes(clientClassOf(cat) ?? "");

let data: PatchData;
const item = (cat: string, rarity: StageItem["rarity"] = "normal"): StageItem => ({ ...freshItem(data, SAMPLE.get(cat)!, 82), rarity });
const ok = (r: { applied: boolean; reason?: string | null }): boolean => r.applied || !/だけ|only/i.test(r.reason ?? "");

describe("部位の種別 (クライアントの表)", () => {
  beforeAll(async () => { data = await loadHtcPatch(); });

  it("データにある部位は全部クライアントの部位に結び付く (新しい部位の入れ忘れを止める)", () => {
    const missing = [...SAMPLE.keys()].filter((c) => !clientClassOf(c));
    expect(missing).toEqual([]);
    expect(ENGINE_CATEGORIES.length).toBeGreaterThanOrEqual(SAMPLE.size);
  });

  it("骨: 顎骨 = 武器か矢筒、肋骨 = 防具、鎖骨 = アミュレット・指輪・ベルト、頭蓋骨 = ジュエル", () => {
    for (const cat of SAMPLE.keys()) {
      const c = clientClassOf(cat)!;
      const want = WEAPON.includes(c) || c === "Quiver" ? "jawbone" : ARMOUR.includes(c) ? "rib" : JEWELLERY.includes(c) ? "collarbone" : c === "Jewel" ? "cranium" : null;
      if (want) expect(desecrationBoneFor(cat), cat).toBe(want);
    }
  });

  it("勢力のお告げ: 武器か宝飾品 (矢筒はゲームで確かめるまで今のまま可)", () => {
    for (const cat of SAMPLE.keys()) {
      const c = clientClassOf(cat)!;
      expect(bossOmenAllowed(cat), cat).toBe(WEAPON.includes(c) || JEWELLERY.includes(c) || c === "Quiver");
    }
  });

  it("品質のカレンシー: 砥石 = マーシャル武器、エッチャー = ワンド・スタッフ・セプター、スクラップ = 防具", () => {
    for (const cat of SAMPLE.keys()) {
      expect(ok(applyQuality(item(cat), "whetstone", () => 0)), `whetstone ${cat}`).toBe(has(MARTIAL)(cat));
      expect(ok(applyQuality(item(cat), "etcher", () => 0)), `etcher ${cat}`).toBe(has(CASTER)(cat));
      expect(ok(applyQuality(item(cat), "scrap", () => 0)), `scrap ${cat}`).toBe(has(ARMOUR)(cat));
    }
  });

  it("インフューザー: 鍛冶 = マーシャル武器、防具職人 = 防具、秘術 = ワンド・スタッフ・セプター、触媒 = 指輪かアミュレット", () => {
    for (const cat of SAMPLE.keys()) {
      expect(ok(applyExtra(item(cat), "vaal_infuser_martial", () => 0.99)), `martial ${cat}`).toBe(has(MARTIAL)(cat));
      expect(ok(applyExtra(item(cat), "vaal_infuser_armour", () => 0.99)), `armour ${cat}`).toBe(has(ARMOUR)(cat));
      expect(ok(applyExtra(item(cat), "vaal_infuser_caster", () => 0.99)), `caster ${cat}`).toBe(has(CASTER)(cat));
      expect(ok(applyExtra(item(cat), "vaal_infuser_jewellery", () => 0.99)), `jewellery ${cat}`).toBe(has(["Ring", "Amulet"])(cat));
    }
  });

  it("生贄のオーブ: ヤオマック = 武器か矢筒、コペック = 防具、カマサ = アミュレット・指輪・ベルト", () => {
    for (const cat of SAMPLE.keys()) {
      const corrupted = { ...item(cat, "rare"), corrupted: true };
      expect(ok(applyExtra(corrupted, "sacrifice_weapon", () => 0)), `weapon ${cat}`).toBe(has([...WEAPON, "Quiver"])(cat));
      expect(ok(applyExtra(corrupted, "sacrifice_armour", () => 0)), `armour ${cat}`).toBe(has(ARMOUR)(cat));
      expect(ok(applyExtra(corrupted, "sacrifice_jewellery", () => 0)), `jewellery ${cat}`).toBe(has(JEWELLERY)(cat));
    }
  });

  it("触媒: 普通の物は指輪かアミュレット、精製された物はジュエル", () => {
    for (const cat of SAMPLE.keys()) {
      expect(ok(applyOther(data, item(cat), "catalyst_life", () => 0)), `catalyst ${cat}`).toBe(has(["Ring", "Amulet"])(cat));
      expect(ok(applyOther(data, item(cat), "jcatalyst_life", () => 0)), `jcatalyst ${cat}`).toBe(has(["Jewel"])(cat));
    }
  });

  it("ソケット: 付くのは武器と防具だけ (宝飾品・矢筒・ジュエルは 0)", () => {
    for (const cat of SAMPLE.keys()) expect(socketCapOf(SAMPLE.get(cat)!, cat) > 0, cat).toBe(has([...WEAPON, ...ARMOUR])(cat));
  });
});
