// rowSideAnnul — S-160 の「消去 + 側のお告げ」の見本 (10-30 見張り部長、⑦ R6): カマサのティアラ。変成で ES% → 増強で雷耐性 → 完璧な王者で火 / 冷気。
// 王者の外れ (プレ) には左の消去 (全部消えてよい)、外れ (サフィ) には右の消去 (雷耐性を残す) を打ち、空いた側を高貴で狙い直す
async (K) => {
  const H = "Helmets_int/", ES = H + "LocalEnergyShieldPercent", FI = H + "FireResistance", CO = H + "ColdResistance", LI = H + "LightningResistance";
  const open = (id) => { const b = K.box(id); return b && !b.back && !b.hand && !b.done; };
  const o0 = K.add("start", "transmute", [], { hitAims: [ES] }), es = K.pick(o0, (b) => b.out === "hit");
  const o1 = K.add(es, "augment", [], { hitAims: [LI] }), li = K.pick(o1, (b) => b.out === "hit");
  for (const x of K.add(li, "regal_perfect", [], { hitAims: [FI, CO] })) {
    if (!open(x)) continue;
    const b = K.box(x);
    if (b.out === "hit") { K.add(x, "exalt", [], { hitAims: [K.has(x, "FireResistance") ? CO : FI] }); continue; }
    const pre = /s:1\|0|^s:1/.test(b.junkKey ?? "");
    const outs = pre ? K.add(x, "annul", ["OmenofSinistralAnnulment"], { keep: [] }) : K.add(x, "annul", ["OmenofDextralAnnulment"], { keep: [{ modId: LI, tier: 1 }] });
    for (const g of outs) if (open(g)) K.add(g, "exalt", [], { hitAims: [FI, CO] });
  }
}
