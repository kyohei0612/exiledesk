// amuB — 不在のアミュレット B: ✦ スキルレベル → 高貴でスピリット / 詠唱速度 → 残りを高貴で (10-29 judgeOne: スピリット + ✦ にカオスは消せるのがスピリットだけ = 必ず消えるので、2 つ目は高貴で足す) → (外れのプレが無ければ高貴で足す) → 完璧なエッセンス (ルーンの守り、左のお告げでプレを消す)。
// 元の木はスピリットだけのプレに左のエッセンスを打っていて、スピリットが必ず消えた (当たりが起こらない)。外れのプレを足して半々にした
async (K) => {
  const SP = "Amulets/BaseSpirit", CS = "Amulets/IncreasedCastSpeed";
  const ESS = "essence:perfect:Amulets/PerfectEssence_RunicWardPercent", LEFT = ["OmenofSinistralCrystallisation"];
  const prefixes = (id) => K.mods(id).filter((m) => m.side === "prefix").length;
  // スピリットと詠唱速度がそろった箱: 外れのプレがあればエッセンス、無ければ高貴で外れを足し、プレに付いた方へエッセンス
  const toEssence = (id) => {
    if (prefixes(id) >= 2) { K.add(id, ESS, LEFT, {}); return; }
    for (const x of K.add(id, "exalt", [], { hitAims: [] })) if (!K.box(x).back && prefixes(x) >= 2) K.add(x, ESS, LEFT, {});
  };
  const both = (id) => K.has(id, "BaseSpirit") && K.has(id, "IncreasedCastSpeed");
  const o1 = K.add("start", "exalt", [], { hitAims: [SP, CS] });
  for (const [aim, next] of [[SP, CS], [CS, SP]]) {
    const at = K.pick(o1, (b) => b.out === "hit" && b.aim?.modId === aim);
    for (const h of K.add(at, "exalt", [], { hitAims: [next] })) if (!K.box(h).back && both(h)) toEssence(h);
  }
  // 外れの側の箱: カオスで当たるまで。付いた当たりの箱は、まだ無い方をカオスで当たるまで (同じ形の箱へは自動でつながる)
  for (const j of o1.filter((id) => K.box(id).out === "junk")) {
    for (const h of K.add(j, "chaos", [], { hitAims: [SP, CS], spam: true })) {
      if (K.box(h).back || K.box(h).out !== "hit") continue;
      for (const h2 of K.add(h, "exalt", [], { hitAims: [K.box(h).aim.modId === SP ? CS : SP] })) if (!K.box(h2).back && both(h2)) toEssence(h2);
    }
  }
}
