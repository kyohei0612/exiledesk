(async () => {
  const M = window.__simMonkey, log = [];
  try {
  const show = (r) => (r.boxes ?? []).map((b) => `${b.id} ${b.out}${b.aim ? " ◎" + b.aim.modId : ""} [${b.mods.map((m) => (m.side === "prefix" ? "P:" : "S:") + m.modId.replace("Rings/", "") + (m.fractured ? "✦" : "")).join(", ")}]`);
  const step = (name, id, key, omens, opt) => { const r = M.add(id, key, omens, opt); log.push({ name, at: id, ok: r.ok, problem: r.problem, kind: r.kind, quality: r.hand?.quality, boxes: show(r) }); return r; };
  // 1 カオスでプレのレアリティ
  const r1 = step("カオス (プレのレアリティ)", "b1", "chaos", [], { hitAims: ["Rings/ItemFoundRarityIncreasePrefix"] });
  const h1 = r1.boxes.find((b) => b.out === "hit").id;
  // 2 高貴 (サフィ、狙い無し) = 餌の外れ
  const r2 = step("高貴 (サフィ・狙い無し)", h1, "exalt", ["OmenofDextralExaltation"], { hitAims: [] });
  const a1 = r2.boxes.find((b) => b.out === "any").id;
  // 3 ブリーチのエッセンス
  const r3 = step("ブリーチのエッセンス", a1, "essence:perfect:Rings/PerfectEssence_LocalMaximumQuality", [], {});
  // 餌 (サフィの外れ) が消えた当たり = プレのレアリティとサフィのレアリティ✦ が残る箱
  const e1 = (r3.boxes.find((b) => b.out !== "lost" && b.mods.some((m) => m.modId === "Rings/ItemFoundRarityIncreasePrefix") && b.mods.filter((m) => m.side === "suffix").length === 1) ?? r3.boxes.find((b) => b.out === "hit"))?.id;
  log.push({ e1, cats: M.shelf(e1).filter((x) => x.key.startsWith("catalyst_")).map((x) => x.key + " " + x.ok) });
  // 4 カタリスト (防御) 40%
  const cats = ["catalyst_defences", "catalyst_defense", "catalyst_armour", "catalyst_evasion"];
  const cat = window.__catKey ?? cats[0];
  const r4 = step("カタリスト 40%", e1, cat, [], { qualityTo: 40 });
  const q1 = r4.boxes?.[0]?.id;
  log.push({ q1Item: q1 && JSON.stringify((({ quality, catalystQuality, qualityTag }) => ({ quality, catalystQuality, qualityTag }))(M.boxItem(q1).item)) });
  // 5 削減のお告げ + カオス (回避を狙う)
  log.push({ whittle: M.omens(q1, "chaos").map((o) => o.key + " " + o.ok) });
  const r5 = step("削減 + カオス (回避)", q1, "chaos", ["OmenofWhittling"], { hitAims: ["Rings/EvasionRating"] });
  const ev = r5.boxes?.find((b) => b.out === "hit")?.id;
  // 6 回避の後にもう一度カタリスト
  const r6 = ev ? step("カタリスト (回避の後)", ev, cat, [], { qualityTo: 40 }) : null;
  const q2 = r6?.boxes?.[0]?.id;
  // 7 最後に高貴で全耐性を狙い、当たりを完成。行き先の無い外れ・狙いが消えたの箱は失敗で閉じる
  if (q2) {
    const r7 = step("高貴 (全耐性)", q2, "exalt", [], { hitAims: ["Rings/AllResistances"] });
    for (const b of r7.boxes ?? []) if (b.out === "hit") log.push({ done: b.id, r: M.setDone(b.id, true) });
  }
  const d = M.dump();
  // カオスの外れは打つ前の箱へ戻って当たるまで (再挑戦)
  for (const b of Object.values(d.boxes)) if (!b.hand && !b.done && b.out === "junk" && d.boxes[b.parent]?.hand?.currency === "chaos") { log.push({ back: b.id, to: b.parent, r: M.setBack(b.id, b.parent) }); }
  const d2 = M.dump();
  for (const b of Object.values(d2.boxes)) if (!b.hand && !b.back && !b.done && b.id !== "start") log.push({ close: b.id, out: b.out, r: b.out === "hit" ? M.setDone(b.id, true) : M.setDone(b.id, "fail") });
  } catch (e) { log.push({ error: String(e) }); }
  const chk = await M.check();
  log.push({ passed: chk.passed, issues: chk.issues.map((x) => `${x.boxId} ${x.kind} ${x.text.slice(0, 60)}`) });
  const res = await M.result(100, 1);
  log.push({ result: JSON.stringify(res).slice(0, 300) });
  return log;
})()
