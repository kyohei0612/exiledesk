// rowFracStar — S-160 の「フラクチャー (✦ の木)」の見本 (10-30 見張り部長、⑦ R6): カマサのティアラで ES% に ✦ の印。変成で ES% → 増強で雷耐性 → 王者で火 → 高貴で冷気、
// 4 つそろった当たりにフラクチャー (✦ ごとの「〇〇が固定された」だけ、S-43)。外れは finish で失敗 (箱を増やさない、noAgain)
async (K) => {
  window.__kit.noAgain = true;
  // ✦ の印はフラクチャー前から (start.from four = 白から、S-08 の始め方の窓の「4 MOD そろえてからフラクチャー」)
  const { useTree } = await import("/src/views/simulator/tree/use-tree.ts");
  useTree().edit((d) => { d.start = { ...d.start, from: "four", rarity: "normal", mods: [] }; });
  const H = "Helmets_int/", ES = H + "LocalEnergyShieldPercent", FI = H + "FireResistance", CO = H + "ColdResistance", LI = H + "LightningResistance";
  const hit = (ids) => K.pick(ids, (b) => b.out === "hit");
  const es = hit(K.add("start", "transmute", [], { hitAims: [ES] }));
  const li = es && hit(K.add(es, "augment", [], { hitAims: [LI] }));
  const fi = li && hit(K.add(li, "regal", [], { hitAims: [FI] }));
  const co = fi && hit(K.add(fi, "exalt", [], { hitAims: [CO] }));
  if (co) K.add(co, "fracture", [], {});
}
