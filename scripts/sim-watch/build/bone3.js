// bone3 — 冒涜 3: ES + 火・冷気・雷 (サフィ満杯) のレア → 右の死霊術の骨 (未発現のまま、結果は 狙いが消えた だけ) → 後から発現 (冷気 ☑)
async (K) => {
  const H = "Helmets_int/";
  for (const x of K.add("start", "desecrate", ["OmenofDextralNecromancy"], { hitAims: [], veil: "keep" })) {
    const b = K.box(x);
    if (b && !b.back && !b.hand && !b.done) K.add(x, "reveal", [], { hitAims: [H + "ColdResistance"] });
  }
}
