// お告げの層 (spec/omen-layer.ts) の見張り (2026-11-07 ジン jin-base、E-27)。正は OmenSpec のデータで、棚の表 (OMEN_FOR)・名前の定数 (OMEN_KEY) がそれとずれないか。
// 外の正解ではない (G-22): 中身の決まりの出どころは各 OmenSpec の source と engine.md の E-27・E-67・E-68
import { describe, expect, it } from "vitest";
import { ALL_OMEN_SPECS, FACTION_TAG, OMEN_EXCLUSIVE, omenFor, omenSideOf, omensOfKind, toggleOmen } from "../src/services/craft-stage/spec/omen-layer";
import { OMEN_KEY } from "../src/services/craft-stage/spec/omen-keys";
import { OMEN_FOR, REMOVED_OMENS } from "../src/services/craft-stage/omens";
import { omensFor } from "../src/services/craft-stage/apply-currency";
import type { StageItem } from "../src/services/craft-stage/types";

const keys = (os: readonly { key: string }[]): string[] => os.map((o) => o.key);

describe("お告げの層", () => {
  it("名前の定数はどれも OmenSpec にある", () => {
    for (const k of Object.values(OMEN_KEY)) expect(ALL_OMEN_SPECS.some((o) => o.key === k), k).toBe(true);
  });
  it("棚の表 (OMEN_FOR) の手ごとの集まりは OmenSpec の appliesTo と同じ (並びは棚の物)", () => {
    const kinds = new Set([...Object.keys(OMEN_FOR), ...ALL_OMEN_SPECS.map((o) => o.appliesTo)]);
    for (const k of kinds) expect([...(OMEN_FOR[k] ?? [])].sort(), k).toEqual(keys(ALL_OMEN_SPECS.filter((o) => o.appliesTo === k)).sort());
    for (const r of REMOVED_OMENS) expect(ALL_OMEN_SPECS.some((o) => o.key === r), r).toBe(false);
  });
  it("掛け替えの組は 11-07 までの手書きの表と同じ", () => {
    expect(OMEN_EXCLUSIVE.map((g) => [...g].sort())).toEqual([
      ["OmenofSinistralNecromancy", "OmenofDextralNecromancy"],
      ["OmenoftheSovereign", "OmenoftheLiege", "OmenoftheBlackblooded"],
      ["OmenofSinistralAnnulment", "OmenofDextralAnnulment", "OmenofLight"],
      ["OmenofSinistralExaltation", "OmenofDextralExaltation"],
      ["OmenofSinistralErasure", "OmenofDextralErasure"],
      ["OmenofSinistralCrystallisation", "OmenofDextralCrystallisation"],
    ].map((g) => [...g].sort()));
    expect(FACTION_TAG).toEqual({ OmenoftheSovereign: "ulaman_mod", OmenoftheLiege: "amanamu_mod", OmenoftheBlackblooded: "kurgal_mod" });
  });
  it("掛け替え: 同じ組を掛けると前の方が外れる・もう一度で外す・別の組は残る", () => {
    expect(toggleOmen(["OmenofSinistralExaltation", "OmenofGreaterExaltation"], "OmenofDextralExaltation")).toEqual(["OmenofGreaterExaltation", "OmenofDextralExaltation"]);
    expect(toggleOmen(["OmenofSinistralAnnulment"], "OmenofLight")).toEqual(["OmenofLight"]);
    expect(toggleOmen(["OmenofLight"], "OmenofDextralAnnulment")).toEqual(["OmenofDextralAnnulment"]);
    expect(toggleOmen(["OmenofWhittling", "OmenofDextralErasure"], "OmenofDextralErasure")).toEqual(["OmenofWhittling"]);
    expect(toggleOmen(["OmenofWhittling"], "OmenofSinistralErasure")).toEqual(["OmenofWhittling", "OmenofSinistralErasure"]);
  });
  it("側: 付ける側と消す側を分けて持つ (消去も消す側)", () => {
    expect(omenSideOf("OmenofSinistralExaltation")).toEqual({ add: "prefix" });
    expect(omenSideOf("OmenofDextralNecromancy")).toEqual({ add: "suffix" });
    expect(omenSideOf("OmenofSinistralAnnulment")).toEqual({ remove: "prefix" });
    expect(omenSideOf("OmenofDextralErasure")).toEqual({ remove: "suffix" });
    expect(omenSideOf("OmenofSinistralCrystallisation")).toEqual({ remove: "prefix" });
    expect(omenSideOf("OmenofLight")).toEqual({});
    expect(omenFor("annul", "suffix")).toBe("OmenofDextralAnnulment");
    expect(omenFor("desecrate", "prefix")).toBe("OmenofSinistralNecromancy");
  });
  it("今効くお告げ: 腐食は単体・光は左右の消去を落とす・同じ組は表の先の 1 つ・紋章のある骨はネクロマンシーを食わない", () => {
    expect(keys(omensOfKind("desecrate", ["OmenofSinistralNecromancy", "OmenofPutrefaction", "OmenoftheLiege"]))).toEqual(["OmenofPutrefaction"]);
    expect(keys(omensOfKind("annul", ["OmenofDextralAnnulment", "OmenofLight"]))).toEqual(["OmenofLight"]);
    expect(keys(omensOfKind("exalt", ["OmenofDextralExaltation", "OmenofSinistralExaltation", "OmenofGreaterExaltation"]))).toEqual(["OmenofSinistralExaltation", "OmenofGreaterExaltation"]);
    expect(keys(omensOfKind("desecrate", ["OmenoftheBlackblooded", "OmenoftheSovereign"]))).toEqual(["OmenoftheSovereign"]);
    expect(keys(omensOfKind("chaos", ["OmenofWhittling", "OmenofSinistralErasure", "OmenofGreaterExaltation"]))).toEqual(["OmenofWhittling", "OmenofSinistralErasure"]);
    const marked = { prefixes: [{ abyssMark: true, fractured: false }], suffixes: [] } as unknown as StageItem;
    expect(keys(omensOfKind("desecrate", ["OmenofSinistralNecromancy", "OmenoftheLiege"], marked))).toEqual(["OmenoftheLiege"]);
    // 棚が使う omensFor も同じ答え (前は光 × 左右の消去を落とさなかった)
    expect(omensFor("annul", ["OmenofSinistralAnnulment", "OmenofLight"])).toEqual(["OmenofLight"]);
    expect(omensFor("desecrate_ancient", ["OmenofPutrefaction", "OmenofDextralNecromancy"])).toEqual(["OmenofPutrefaction"]);
  });
});
