// ownerWhittle — オーナーの木 FmNY7Wwv (金の指輪、10-29): 元の木の道を組み直す。
// 高貴 → カオスでプレのレアリティ → 右の高貴で外れのサフィ (餌) → ブリーチのエッセンス + 右のお告げ (品質の最大値、餌が消える) → カタリスト 40% → 完璧な高貴 + 触媒の高貴 + 左のお告げで回避
// → (足した手) カタリスト 40% (触媒の高貴のお告げが品質を使い切るので、完成の前に入れ直す。引き継ぎ 10-29) → 削減 + カオス (狙い無し)
// → 外れがサフィに付けば完璧なエッセンス (ルーンの守り) + 右のお告げで完成、プレに付けば消去 (プレのレアリティと回避を残す) → 右の高貴で餌 → エッセンス
// 残る精査の知らせ 1 つ (エッセンスの箱の「狙いが消えた」の行き先無し) はシミュの作り: 削減で全耐性の低い段 (T4・T5、完成形は T2 以上) が付いた人は外れの箱に着くが、精査の辿りはそれが消えると「狙いが消えた」に数える (選び直しでも箱は足されない)
// 元の木の「高貴 (狙い無し)」は ☑ プレのレアリティにした: 狙い無しの「打った後」の箱は、カオスの外れ (プレ → サフィ) が同じ形でも戻れない (S-51 の候補に打った後が入らない)
async (K) => {
  const R = "Rings/", RP = R + "ItemFoundRarityIncreasePrefix", EV = R + "EvasionRating", MQ = R + "PerfectEssence_LocalMaximumQuality";
  const CAT = "catalyst_defences", MAXQ = "essence:perfect:Rings/PerfectEssence_LocalMaximumQuality", RUNE = "essence:perfect:Rings/PerfectEssence_BaseRunicWard", RIGHT = ["OmenofDextralCrystallisation"];
  K.noAgain = true;
  const open = (id) => { const b = K.box(id); return b && !b.back && !b.hand && !b.done; };
  const sfx = (id) => K.mods(id).filter((m) => m.side === "suffix").length;
  const o0 = K.add("start", "exalt", [], { hitAims: [RP] });
  for (const x of o0) if (K.box(x).out === "junk") K.add(x, "chaos", [], { hitAims: [RP] });
  const h1 = K.pick(o0, (b) => b.out === "hit");
  const x1 = K.add(h1, "exalt", ["OmenofDextralExaltation"], { hitAims: [] });
  for (const x of x1) if (open(x) && x !== K.pick(x1, (b) => b.out === "any")) K.add(x, MAXQ, RIGHT, {});
  const a1 = K.pick(x1, (b) => b.out === "any");
  const e1 = K.pick(K.add(a1, MAXQ, RIGHT, {}), (b) => b.out !== "lost");
  // 品質は「最大まで」(通り抜けの箱、元の木と同じ)。「n % まで」の結果の箱は品質を上げた後に数えられず (afterQualityOf は通り抜けだけ)、触媒の高貴の前に火のカタリストが自動で足された
  const q1 = K.add(e1, CAT, [], { qualityTo: 0 })[0];
  const x2 = K.add(q1, "exalt_perfect", ["OmenofCatalysingExaltation", "OmenofSinistralExaltation"], { hitAims: [EV] });
  // 完璧な高貴の外れ (プレ) は消去 (プレのレアリティと品質の最大値を残す) で高貴の前の形へ (元の木の b22 → b24 は品質の最大値を残さず、半分が失敗した)
  for (const x of x2) if (open(x) && K.box(x).out === "junk") K.add(x, "annul", [], { keep: [{ modId: RP, tier: 1 }, { modId: MQ, tier: 1 }] });
  const ev = K.pick(x2, (b) => b.out === "hit");
  const q2 = K.add(ev, CAT, [], { qualityTo: 40 })[0];
  // ルーンの守りまで: 外れのサフィがあればエッセンス + 右のお告げ、無ければ右の高貴で餌を足してから
  const toRune = (id) => {
    if (sfx(id) >= 2) { for (const r of K.add(id, RUNE, RIGHT, {})) if (K.box(r).out === "hit" && K.has(r, "BaseRunicWard")) K.M.setDone(r, true); return; }
    for (const a of K.add(id, "exalt", ["OmenofDextralExaltation"], { hitAims: [] })) if (open(a) && sfx(a) >= 2) toRune(a);
  };
  for (const w of K.add(q2, "chaos", ["OmenofWhittling"], { hitAims: [] })) {
    if (!open(w) || !K.has(w, "ItemFoundRarityIncreasePrefix") || !K.has(w, "EvasionRating")) continue;
    const junkP = K.mods(w).some((m) => m.side === "prefix" && !m.modId.endsWith("ItemFoundRarityIncreasePrefix") && !m.modId.endsWith("EvasionRating"));
    if (!junkP) { toRune(w); continue; }
    for (const g of K.add(w, "annul", [], { keep: [{ modId: RP, tier: 1 }, { modId: EV, tier: 3 }] })) if (open(g) && K.has(g, "ItemFoundRarityIncreasePrefix") && K.has(g, "EvasionRating")) toRune(g);
  }
}
