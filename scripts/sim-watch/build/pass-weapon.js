// pass-weapon — 合格レシピの武器 (10-29 オーナー「武器なんか1つ、防具、指輪」): 攻城クロスボウ。変成で物理% → 増強でアタックスピード → 上位の研磨のエッセンス (レアにして物理の追加) → 右の高貴 (狙い無し、4 つ目) → フラクチャー (物理% / 物理の追加 / アタックスピード ☑) → 完璧なエッセンス (アタックスキル +3) + 右の結晶化 (サフィックスを消す)。
// アタックスピードが消えた時は右の高貴で狙い、外れはカオス + 右の消去で当たるまで。マジックの外れは消去で外れを消して増強で狙い直す (kamasan と同じ輪)
// 選んだ訳: 物理のクロスボウはよくある攻撃の作りで、エッセンス 2 種・お告げ 3 種・フラクチャーが 1 本の道に自然に並ぶ
async (K) => {
  const C = "Crossbows/", PP = C + "LocalPhysicalDamagePercent", FP = C + "Essence_PhysicalDamage", AS = C + "LocalIncreasedAttackSpeed", LV = C + "PerfectEssence_IncreaseSocketedGemLevel";
  const open = (id) => { const b = K.box(id); return b && !b.back && !b.hand && !b.done; };
  const redo = (id, keep, aim) => { for (const g of K.add(id, "annul", [], { keep })) if (open(g)) K.add(g, "augment", [], { hitAims: [aim] }); };
  const o0 = K.add("start", "transmute", [], { hitAims: [PP] }), pp = K.pick(o0, (b) => b.out === "hit");
  for (const j of o0) if (j !== pp && open(j)) redo(j, [], PP);
  const o1 = K.add(pp, "augment", [], { hitAims: [AS] }), as = K.pick(o1, (b) => b.out === "hit");
  for (const j of o1) if (j !== as && open(j)) redo(j, [{ modId: PP, tier: 4 }], AS);
  for (const r of K.add(as, "essence:greater:" + FP, [], {})) {
    if (!open(r)) continue;
    for (const x of K.add(r, "exalt", ["OmenofDextralExaltation"], { hitAims: [] })) {
      if (!open(x)) continue;
      for (const f of K.add(x, "fracture", [], { hitAims: [PP, FP, AS] })) {
        if (!open(f) || K.box(f).out !== "hit") continue;
        for (const p of K.add(f, "essence:perfect:" + LV, ["OmenofDextralCrystallisation"], {})) {
          if (!open(p) || K.has(p, "LocalIncreasedAttackSpeed")) continue;
          for (const y of K.add(p, "exalt", ["OmenofDextralExaltation"], { hitAims: [AS] })) if (open(y) && K.box(y).out !== "hit") K.add(y, "chaos", ["OmenofDextralErasure"], { hitAims: [AS], spam: true });
        }
      }
    }
  }
}
