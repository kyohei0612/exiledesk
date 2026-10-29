// goalQ — amuB と同じ道 (不在のアミュレット B) に、完成形の品質 40% (☑・上限 40%・ライフ) とブリーチの MOD。スピリットと詠唱速度がそろったらカタリストで品質を 40% まで (S-31b) 上げてからエッセンスへ
async (K) => {
  const SP = "Amulets/BaseSpirit", CS = "Amulets/IncreasedCastSpeed";
  const ESS = "essence:perfect:Amulets/PerfectEssence_RunicWardPercent", LEFT = ["OmenofSinistralCrystallisation"];
  const prefixes = (id) => K.mods(id).filter((m) => m.side === "prefix").length;
  // スピリットと詠唱速度がそろった箱: 外れのプレがあればエッセンス、無ければ高貴で外れを足し、プレに付いた方へエッセンス
  const CAT = "catalyst_" + (K.M.dump().goalQualityTag ?? "life"), q = K.M.dump().goalQuality ?? 40;
  const toEssence0 = (id) => {
    if (prefixes(id) >= 2) { K.add(id, ESS, LEFT, {}); return; }
    for (const x of K.add(id, "exalt", [], { hitAims: [] })) if (!K.box(x).back && prefixes(x) >= 2) K.add(x, ESS, LEFT, {});
  };
  // 品質を上げる手は通り抜けの箱 (pass) を 1 つ作る。その箱からエッセンスへ
  const toEssence = (id) => { const p = K.add(id, CAT, [], { qualityTo: q })[0]; if (p) toEssence0(p); };
  const both = (id) => K.has(id, "BaseSpirit") && K.has(id, "IncreasedCastSpeed");
  const o1 = K.add("start", "exalt", [], { hitAims: [SP, CS] });
  for (const [aim, next] of [[SP, CS], [CS, SP]]) {
    const at = K.pick(o1, (b) => b.out === "hit" && b.aim?.modId === aim);
    for (const h of K.add(at, "chaos", [], { hitAims: [next], spam: true })) if (!K.box(h).back && both(h)) toEssence(h);
  }
  // 外れの側の箱: カオスで当たるまで。付いた当たりの箱は、まだ無い方をカオスで当たるまで (同じ形の箱へは自動でつながる)
  for (const j of o1.filter((id) => K.box(id).out === "junk")) {
    for (const h of K.add(j, "chaos", [], { hitAims: [SP, CS], spam: true })) {
      if (K.box(h).back || K.box(h).out !== "hit") continue;
      for (const h2 of K.add(h, "chaos", [], { hitAims: [K.box(h).aim.modId === SP ? CS : SP], spam: true })) if (!K.box(h2).back && both(h2)) toEssence(h2);
    }
  }
}
