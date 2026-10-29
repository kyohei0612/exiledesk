// ownerCatalyst — オーナーの木 6jCm1kMt (完成形だけ、10-29): owner-catalyst-tree.js の道をスタートから組む。
// 高貴 (狙い無し) の外れのプレ → カオスでプレのレアリティ → 右の高貴で外れのサフィ (餌) → ブリーチのエッセンス + 右のお告げ (品質の最大値、餌が消える) → カタリスト 40% → 削減 + カオスで回避 → もう一度カタリスト → 高貴で全耐性
async (K) => {
  const R = "Rings/", RP = R + "ItemFoundRarityIncreasePrefix", EV = R + "EvasionRating", AR = R + "AllResistances";
  const CAT = "catalyst_defences";
  K.noAgain = true;
  const sfx = (id) => K.mods(id).filter((m) => m.side === "suffix").length;
  const o0 = K.add("start", "exalt", [], { hitAims: [RP] });
  // 高貴 (☑ プレのレアリティ) の外れの箱 (プレ / サフィ) はカオスでプレのレアリティを狙い、外れは同じ手で戻る (S-51。狙い無しの「打った後」の箱は S-51 の候補に入らず戻れなかった)
  for (const x of o0) if (K.box(x).out === "junk") K.add(x, "chaos", [], { hitAims: [RP] });
  const h1 = K.pick(o0, (b) => b.out === "hit" && b.aim?.modId === RP);
  // 右の高貴の結果は外れのサフィ (餌) も全耐性もエッセンスへ。右のお告げでサフィだけを消す (元の木 FmNY7Wwv と同じ。お告げ無しだとプレのレアリティが消えて 8 割が失敗)
  const x1 = K.add(h1, "exalt", ["OmenofDextralExaltation"], { hitAims: [] });
  const a1 = K.pick(x1, (b) => b.out === "any");
  for (const x of x1) if (x !== a1 && !K.box(x).back) K.add(x, "essence:perfect:Rings/PerfectEssence_LocalMaximumQuality", ["OmenofDextralCrystallisation"], {});
  const e1 = K.pick(K.add(a1, "essence:perfect:Rings/PerfectEssence_LocalMaximumQuality", ["OmenofDextralCrystallisation"], {}), (b, ms) => b.out !== "lost" && ms.some((m) => m.modId === RP) && sfx(b.id) === 1);
  const q1 = K.add(e1, CAT, [], { qualityTo: 40 })[0];
  const w1 = K.add(q1, "chaos", ["OmenofWhittling"], { hitAims: [EV] });
  const ev = K.pick(w1, (b) => b.out === "hit" && !b.back);
  // 削減 + カオスの外れのプレの箱 (同じ側) は消去 (プレのレアリティを残す): 外れが消えれば道の箱 (プレのレアリティ + ✦) へ、レアリティが消えれば最初の外れの箱へ自動で戻る。
  // 外れのサフィの箱 (プレ → サフィ) は失敗で閉じる (消去で戻すと輪が長くなり精査の 30 人が手の上限 = noDone。エッセンス + 右のお告げは、結果の「打った後」が同じ形の前の箱へ戻れない = S-51 の候補に打った後が入らない)
  for (const x of w1) {
    const b = K.box(x);
    if (b.out !== "junk" || b.back || !K.has(x, "ItemFoundRarityIncreasePrefix") || !K.mods(x).some((m) => m.side === "prefix" && !m.modId.endsWith("ItemFoundRarityIncreasePrefix"))) continue;
    K.add(x, "annul", [], { keep: [{ modId: RP, tier: 1 }] });
  }
  const q2 = ev && K.add(ev, CAT, [], { qualityTo: 40 })[0];
  // 最後の当たり (完成形 6 つのうち 4 つ: ✦ レアリティ・プレのレアリティ・回避・全耐性) を完成に (元の台本どおり)
  if (q2) for (const x of K.add(q2, "exalt", [], { hitAims: [AR] })) if (K.box(x).out === "hit") K.M.setDone(x, true);
}
