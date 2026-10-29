// bone2b — 冒涜 2b: kamasan と同じ道で、王者の外れに左の死霊術の骨 (発現させる、置き石 = 最大 ES) → 当たりにカオス (火 ☑)
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
    for (const d of K.add(x, "desecrate", ["OmenofSinistralNecromancy"], { hitAims: [H + "LocalEnergyShield"], veil: "pick" })) if (open(d) && K.box(d).out === "hit") K.add(d, "chaos", [], { hitAims: [FI] });
  }
}
