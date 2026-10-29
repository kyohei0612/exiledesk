// fg0BCVYy — ibMlQuAV の作り直し (10-27): okPcmPyY と同じ道で、外れの冒涜の上書きは完璧なエッセンス (器用さ%) + 右のお告げ (サフィだけ消すのでスピリットを守る)、全防御のエッセンスはお告げ無し (元の木どおり、スピリットが消える事もある)
async (K) => {
  const SP = "Amulets/BaseSpirit", CS = "Amulets/IncreasedCastSpeed";
  const prefixes = (id) => K.mods(id).filter((m) => m.side === "prefix").length;
  const open = (id) => { const b = K.box(id); return b && !b.back && !b.hand && !b.done; };
  const both = (id) => K.has(id, "BaseSpirit") && K.has(id, "IncreasedCastSpeed");
  const toAllDef = (id) => {
    if (prefixes(id) >= 2) { K.add(id, "essence:perfect:Amulets/PerfectEssence_AllDefences", [], {}); return; }
    for (const x of K.add(id, "exalt", [], { hitAims: [] })) if (open(x) && prefixes(x) >= 2) K.add(x, "essence:perfect:Amulets/PerfectEssence_AllDefences", [], {});
  };
  const desecrate = (id, depth = 0) => {
    for (const x of K.add(id, "desecrate", ["OmenofDextralNecromancy", "OmenofAbyssalEchoes"], { hitAims: [CS] })) {
      if (!open(x)) continue;
      if (both(x)) { toAllDef(x); continue; }
      if (K.box(x).out === "junk" && depth < 2) for (const e of K.add(x, "essence:perfect:Amulets/PerfectEssence_PercentageDexterity", ["OmenofDextralCrystallisation"], {})) if (open(e) && K.has(e, "BaseSpirit")) desecrate(e, depth + 1);
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
