// okPcmPyY — オーナーの木 (10-27): ✦ スキルレベル → 高貴 (狙い無し) → カオスでスピリット → 右の死霊術 + 反響の冒涜で詠唱速度、外れの冒涜は完璧なエッセンス (被ダメのライフ化) で上書きしてもう一度冒涜 (同じ手の繰り返し = sameHand の見張り)。
// 元の木は詠唱速度で止まっていた (完成の狙いの全防御が無い)。詠唱速度の後に高貴で外れのプレ → 完璧なエッセンス (全防御、左のお告げでプレを消す) を足して完成まで。
// 狙い無しの高貴にも完成の狙いの当たりの箱が出る (今の決まり、hitAimsOf) ので、結果の種類ごとに手を分ける
async (K) => {
  const SP = "Amulets/BaseSpirit", CS = "Amulets/IncreasedCastSpeed";
  const prefixes = (id) => K.mods(id).filter((m) => m.side === "prefix").length;
  const open = (id) => { const b = K.box(id); return b && !b.back && !b.hand && !b.done; };
  const both = (id) => K.has(id, "BaseSpirit") && K.has(id, "IncreasedCastSpeed");
  const toAllDef = (id) => {
    if (prefixes(id) >= 2) { K.add(id, "essence:perfect:Amulets/PerfectEssence_AllDefences", ["OmenofSinistralCrystallisation"], {}); return; }
    for (const x of K.add(id, "exalt", [], { hitAims: [] })) if (open(x) && prefixes(x) >= 2) K.add(x, "essence:perfect:Amulets/PerfectEssence_AllDefences", ["OmenofSinistralCrystallisation"], {});
  };
  const desecrate = (id, depth = 0) => {
    for (const x of K.add(id, "desecrate", ["OmenofDextralNecromancy", "OmenofAbyssalEchoes"], { hitAims: [CS] })) {
      if (!open(x)) continue;
      if (both(x)) { toAllDef(x); continue; }
      if (K.box(x).out === "junk" && depth < 2) for (const e of K.add(x, "essence:perfect:Amulets/PerfectEssence_DamageTakenGainedAsLife", [], {})) if (open(e) && K.has(e, "BaseSpirit")) desecrate(e, depth + 1);
    }
  };
  // 外れの箱はカオスでスピリットを当たるまで (素のカオスの再挑戦は付きにくい T1 で精査の辿りが着かず neverHit が出た)
  const spirit = (id) => { for (const h of K.add(id, "chaos", [], { hitAims: [SP], spam: true })) if (open(h) && K.has(h, "BaseSpirit")) (both(h) ? toAllDef : desecrate)(h); };
  for (const x of K.add("start", "exalt", [], { hitAims: [] })) {
    if (!open(x)) continue;
    if (K.has(x, "BaseSpirit")) desecrate(x);
    // 詠唱速度だけの箱: カオスでは詠唱速度しか消せず必ず失うので、高貴でスピリットを足す
    else if (K.has(x, "IncreasedCastSpeed")) { for (const h of K.add(x, "exalt", [], { hitAims: [SP] })) if (open(h) && both(h)) toAllDef(h); }
    else spirit(x);
  }
}
