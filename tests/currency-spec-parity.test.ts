/**
 * ADR-004 の土台 (2026-10-16): 説明文の分解 (spec/) で打った結果 = 今の applyCurrency の結果。
 * 冒涜まわり (骨 4 種 × 部位・発現・ネクロマンシー・勢力・腐食・反響) と消去 (光・左右の消去) を、
 * いくつものベース × 状態 × アイテムレベル × お告げ × 種で打ち比べ、手順の再生 (続けて打つ・手順 JSON) でも全部の手を比べる。
 * 説明文はクライアントの currency-hover / 用語集の写しと同じか (パッチで変わったら落ちる)。
 * 今の関数と違う所は、どちらが正しいかを決めるまで「分かっている違い」として下に並べる (docs/archive/2026-10-16-adr-004-desecrate-rules.md)
 */
import { describe, expect, it } from "vitest";
import { data } from "./helpers/spec-parity";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { bonesFor } from "../src/state/stage/craft-stage-shelf";
import { mulberry32 } from "../src/services/htc/rng";
import { applyBySpec, resolveSpec } from "../src/services/craft-stage/spec/run-spec";
import { BONE_SPECS, CURRENCY_SPECS, OMEN_SPECS } from "../src/services/craft-stage/spec/desecrate-specs";
import { bossOmenAllowed, desecrationBoneFor } from "../src/vendor/poe2htc/engine/probability";
import { categoriesIn, clientClassOf, ENGINE_CATEGORIES } from "../src/services/mods/item-classes";
import { OMEN_FOR } from "../src/services/craft-stage/omens";
import HOVER_EN from "../src/i18n/currency-hover-en.json";
import HOVER_JA from "../src/i18n/currency-hover-ja.json";
import KW_EN from "../src/i18n/keywords-en.json";
import KW_JA from "../src/i18n/keywords-ja.json";
import type { StageItem } from "../src/services/craft-stage/types";

describe("説明文はクライアントの写しと同じ", () => {
  const en = HOVER_EN as Record<string, { e: string[] }>;
  const ja = HOVER_JA as Record<string, { e: string[] }>;
  it("カレンシー (骨・消去) と発現の用語集", () => {
    for (const s of CURRENCY_SPECS) {
      if (s.key.startsWith("keyword:")) {
        const k = s.key.slice("keyword:".length);
        expect((KW_EN as Record<string, { d: string }>)[k]!.d).toContain(s.text.en[0]);
        expect((KW_JA as Record<string, { d: string }>)[k]!.d).toContain(s.text.ja[0]);
        continue;
      }
      expect(en[s.key]?.e, s.key).toEqual(s.text.en);
      expect(ja[s.key]?.e, s.key).toEqual(s.text.ja);
    }
  });
  it("お告げ", () => {
    for (const o of OMEN_SPECS) {
      expect(en[o.hover]?.e, o.key).toEqual(o.text.en);
      expect(ja[o.hover]?.e, o.key).toEqual(o.text.ja);
    }
  });
  it("骨はクライアントにある物で全部 (頭蓋骨は保存された物だけ、変質した骨は鎖骨だけ)", () => {
    const client = Object.keys(en).filter((k) => /(jawbone|rib|collarbone|cranium)$/.test(k) && /^(gnawed|preserved|ancient|altered)/.test(k)).sort();
    expect(BONE_SPECS.map((s) => s.key).sort()).toEqual(client);
  });
  it("お告げの掛かる手は今の棚 (OMEN_FOR) と同じ", () => {
    for (const kind of ["desecrate", "reveal", "annul"]) {
      const mine = OMEN_SPECS.filter((o) => o.appliesTo === kind).map((o) => o.key).sort();
      expect(mine, kind).toEqual([...(OMEN_FOR[kind] ?? [])].sort());
    }
  });
});

describe("対象の部位はクライアントの区分から", () => {
  it("骨の種類は今の desecrationBoneFor と同じ部位に当たる", () => {
    const part = { jawbone: "jawbone", rib: "rib", collarbone: "collarbone", cranium: "cranium" } as const;
    for (const cat of ENGINE_CATEGORIES) {
      const item = { ...freshItem(data, "Gold Ring", 82), cls: { ...freshItem(data, "Gold Ring", 82).cls, category: cat } } as StageItem;
      const r = resolveSpec("desecrate", item)!;
      const want = desecrationBoneFor(cat);
      // 今の関数は知らない部位を肋骨に落とす。新しい作りは合う骨が無いと言う (フラスコ・チャームなど)
      if (r.reason) { expect(["rib"]).toContain(want); continue; }
      expect(r.spec.key, cat).toBe(`preserved${part[want]}`);
    }
  });
  it("鎖骨の「アミュレット、指輪またはベルト」= 宝飾品のまとまり", () => {
    expect(new Set(categoriesIn("jewellery").map(clientClassOf))).toEqual(new Set(["Amulet", "Ring", "Belt"]));
  });
  it("勢力のお告げの対象 = 今の bossOmenAllowed", () => {
    const fac = OMEN_SPECS.find((o) => o.key === "OmenoftheSovereign")!;
    for (const cat of ENGINE_CATEGORIES) {
      const item = { ...freshItem(data, "Gold Ring", 82), rarity: "rare", cls: { ...freshItem(data, "Gold Ring", 82).cls, category: cat } } as StageItem;
      const ok = !fac.target!.groups || fac.target!.groups.some((g) => categoriesIn(g).includes(cat));
      expect(ok, cat).toBe(bossOmenAllowed(cat));
      void item;
    }
  });
});

describe("説明文・クライアントどおり (2026-10-16 に切り替えた時に変わった所)", () => {
  it("古代の骨 + 腐食のお告げ、アイテムレベル 40 未満: 今は打てる、新しい作りは古代の骨の制約で打てない", () => {
    const item = applyCurrency(data, freshItem(data, "Gold Ring", 35), "alchemy", mulberry32(3)).item;
    expect(applyBySpec(data, item, "desecrate_ancient", mulberry32(1), ["OmenofPutrefaction"])!.applied).toBe(false);
  });
  it("棚に無い骨 (古代の頭蓋骨・武器の変質した骨): 今の関数は打ててしまう物がある、新しい作りはクライアントにある骨だけ", () => {
    const jewel = applyCurrency(data, freshItem(data, "Ruby", 82), "alchemy", mulberry32(3)).item;
    expect(bonesFor(jewel)).toEqual(["desecrate"]);
    expect(applyBySpec(data, jewel, "desecrate_ancient", mulberry32(1))!.applied).toBe(false);
    const wand = applyCurrency(data, freshItem(data, "Withered Wand", 82), "alchemy", mulberry32(3)).item;
    expect(applyCurrency(data, wand, "desecrate_altered", mulberry32(1)).applied).toBe(false);
    expect(applyBySpec(data, wand, "desecrate_altered", mulberry32(1))!.reason).toBe(applyCurrency(data, wand, "desecrate_altered", mulberry32(1)).reason);
  });
});
