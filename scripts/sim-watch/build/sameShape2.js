// sameShape2 — 同じ形 2 つ (10-27): okPcmPyY と同じ道で、1 回目の外れの冒涜はカオスで入れ替え、2 回目からは完璧なエッセンス (被ダメのライフ化) で上書き (同じ形の箱へ自動で戻るかの見張り)
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
      if (K.box(x).out === "junk" && depth < 2) for (const e of K.add(x, depth === 0 ? "chaos" : "essence:perfect:Amulets/PerfectEssence_DamageTakenGainedAsLife", [], depth === 0 ? { hitAims: [] } : {})) if (open(e) && K.has(e, "BaseSpirit")) desecrate(e, depth + 1);
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
