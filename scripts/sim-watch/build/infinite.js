// infinite — 無限のエッセンス (Quilted Vest、狙い知性): 変成 (狙い無し) → 無限のグレーターエッセンス。知性が付けば完成、ほかの能力値は外れ (元の木は外れの箱が未定だった)
async (K) => {
  for (const x of K.add("start", "transmute", [], { hitAims: [] })) {
    const b = K.box(x);
    if (b && !b.back && !b.hand && !b.done) K.add(x, "essence:greater:Body_Armours_dex/Essence_Dexterity", [], {});
  }
}
