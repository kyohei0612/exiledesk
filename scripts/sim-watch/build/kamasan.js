// kamasan — カマサのティアラ (要望 8a159e29): 変成で ES% → 増強で雷耐性 → 完璧な王者で火 / 冷気。当たりは残りの耐性を高貴で。王者の外れには右の死霊術 + 反響の冒涜 (狙い無し) → 乱数のフラクチャー (ES% / 雷耐性 ☑)
async (K) => {
  const H = "Helmets_int/", ES = H + "LocalEnergyShieldPercent", FI = H + "FireResistance", CO = H + "ColdResistance", LI = H + "LightningResistance";
  const open = (id) => { const b = K.box(id); return b && !b.back && !b.hand && !b.done; };
  // マジックの外れ: 消去で外れを消し (ES% は残す)、空いたら増強で狙い直す (同じ形の箱へ自動で戻る輪)
  const redo = (id, keep, aim) => { for (const g of K.add(id, "annul", [], { keep })) if (open(g)) K.add(g, "augment", [], { hitAims: [aim] }); };
  const o0 = K.add("start", "transmute", [], { hitAims: [ES] }), es = K.pick(o0, (b) => b.out === "hit");
  for (const j of o0) if (j !== es && open(j)) redo(j, [], ES);
  const o1 = K.add(es, "augment", [], { hitAims: [LI] }), li = K.pick(o1, (b) => b.out === "hit");
  for (const j of o1) if (j !== li && open(j)) redo(j, [{ modId: ES, tier: 1 }], LI);
  for (const x of K.add(li, "regal_perfect", [], { hitAims: [FI, CO] })) {
    if (!open(x)) continue;
    if (K.box(x).out === "hit") { K.add(x, "exalt", [], { hitAims: [K.has(x, "FireResistance") ? CO : FI] }); continue; }
    // 王者の外れ: 冒涜 (狙い無し) → 乱数のフラクチャー
    for (const d of K.add(x, "desecrate", ["OmenofDextralNecromancy", "OmenofAbyssalEchoes"], { hitAims: [] })) if (open(d)) K.add(d, "fracture", [], { hitAims: [ES, LI] });
  }
}
