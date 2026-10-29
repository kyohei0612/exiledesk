// rowFreeSides — S-160 の「変成・増強・王者の側分け (S-65)」の見本 (10-30 見張り部長、⑦ R6): カマサのティアラを変成 → 増強 → 王者を全部狙い無しで打ち、
// 打った後の箱がプレ / サフィで分かれる所を通す (S-65 の確かめ「1 / 2 / 1 / 2 箱」と同じ形)。王者の後は打たず、残りは finish で失敗 (箱を増やさない、noAgain)
async (K) => {
  window.__kit.noAgain = true;
  const open = (id) => { const b = K.box(id); return b && !b.back && !b.hand && !b.done; };
  for (const a of K.add("start", "transmute", [], { hitAims: [], free: true })) {
    if (!open(a)) continue;
    for (const b of K.add(a, "augment", [], { hitAims: [], free: true })) if (open(b)) K.add(b, "regal", [], { hitAims: [], free: true });
  }
}
