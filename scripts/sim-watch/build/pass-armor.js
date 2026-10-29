// pass-armor — 合格レシピの防具 (10-29 オーナー「武器なんか1つ、防具、指輪」): 将軍のキュイラス。変成でライフ → 増強で火耐性 → 上位の冷気のエッセンス (レアにして冷気耐性) → 左の高貴でアーマー% (外れのプレが付いたらもう 1 回) → 骨で冒涜 (右の死霊術 + 反響、火と混沌の耐性 ☑) → ルーンを差す。
// 冒涜の外れは光のお告げの消去で冒涜の MOD だけ消して骨を打ち直す (同じ形の箱へ自動で戻る輪)。マジックの外れは消去で外れを消して増強で狙い直す (kamasan と同じ輪)
// 選んだ訳: ライフと耐性の筋力の鎧はよくある防具の作りで、冒涜は空いたサフィックスに、ルーンは仕上げに自然に入る。王者は外れが 8 割を超えて完成 0/30 だった (10-29 1 回目) のでエッセンスに替えた
async (K) => {
  const B = "Body_Armours_str/", LF = B + "IncreasedLife", AR = B + "LocalPhysicalDamageReductionRatingPercent", FI = B + "FireResistance", CO = B + "Essence_ColdResistance", DS = B + "Desecrated_FireAndChaosDamageResistance";
  const open = (id) => { const b = K.box(id); return b && !b.back && !b.hand && !b.done; };
  const redo = (id, keep, aim) => { for (const g of K.add(id, "annul", [], { keep })) if (open(g)) K.add(g, "augment", [], { hitAims: [aim] }); };
  // 4 つそろった箱: 骨で冒涜、当たりにルーン、外れは光の消去で冒涜だけ消す
  const bone = (id) => {
    for (const d of K.add(id, "desecrate", ["OmenofDextralNecromancy", "OmenofAbyssalEchoes"], { hitAims: [DS] })) {
      if (!open(d)) continue;
      if (K.box(d).out === "hit") K.add(d, "rune:Rune of the Prism", [], {});
      else K.add(d, "annul", ["OmenofLight"], {});
    }
  };
  const o0 = K.add("start", "transmute", [], { hitAims: [LF] }), lf = K.pick(o0, (b) => b.out === "hit");
  for (const j of o0) if (j !== lf && open(j)) redo(j, [], LF);
  const o1 = K.add(lf, "augment", [], { hitAims: [FI] }), fi = K.pick(o1, (b) => b.out === "hit");
  for (const j of o1) if (j !== fi && open(j)) redo(j, [{ modId: LF, tier: 6 }], FI);
  for (const r of K.add(fi, "essence:greater:" + CO, [], {})) {
    if (!open(r)) continue;
    for (const x of K.add(r, "exalt", ["OmenofSinistralExaltation"], { hitAims: [AR] })) {
      if (!open(x)) continue;
      if (K.box(x).out === "hit") { bone(x); continue; }
      // 外れのプレが付いた: もう 1 回左の高貴 (プレの最後の枠)
      for (const y of K.add(x, "exalt", ["OmenofSinistralExaltation"], { hitAims: [AR] })) if (open(y) && K.box(y).out === "hit") bone(y);
    }
  }
}
