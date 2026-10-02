// 火力チェックのエンジン点検 (直した後): ビルドごとに 読み込み → 主スキルの PoB の左の数字と比べる → 取引所の武器・手袋 (日本語 / 英語) を貼る → 戻す
const api = await import("/src/services/pob-check/api.ts");
const { toPobItem } = await import("/src/services/pob-check/item-text.ts");
const inv = window.__TAURI_INTERNALS__.invoke;
const builds = BUILDS;
const trade = TRADE;
const NL = String.fromCharCode(10);
const strip = (s) => s.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]|]+)\]/g, "$1");
const desc = (m) => strip(typeof m === "string" ? m : m.description);

/** 取引所の item JSON → ゲームの Ctrl+C の文面 */
function copyText(it, lang) {
  const ja = lang === "ja";
  const R = ja ? { Normal: "ノーマル", Magic: "マジック", Rare: "レア", Unique: "ユニーク" } : null;
  const out = [];
  out.push(`${ja ? "レアリティ" : "Rarity"}: ${ja ? R[it.rarity] : it.rarity}`);
  if (it.name) out.push(it.name);
  out.push(it.typeLine);
  out.push("--------");
  for (const p of it.properties ?? []) {
    const name = strip(p.name);
    if (p.values?.length) out.push(`${name}: ${p.values.map((v) => v[0]).join(", ")}`);
    else out.push(name);
  }
  out.push("--------");
  out.push(`${ja ? "アイテムレベル" : "Item Level"}: ${it.ilvl}`);
  if (it.runeMods?.length) { out.push("--------"); for (const m of it.runeMods) out.push(`${desc(m)} (rune)`); }
  if (it.implicitMods?.length) { out.push("--------"); for (const m of it.implicitMods) out.push(`${desc(m)} (implicit)`); }
  if (it.explicitMods?.length) {
    out.push("--------");
    for (const m of it.explicitMods) out.push(`${desc(m)}${m.domain === "desecrated" ? " (desecrated)" : m.domain === "fractured" ? " (fractured)" : ""}`);
  }
  if (it.corrupted) { out.push("--------"); out.push(ja ? "コラプト状態" : "Corrupted"); }
  return out.join(NL);
}

const lua = async (script) => JSON.parse(await inv("pob_eval", { script }));
const pobSide = () => lua(`PCK.recalc(); local o=build.calcsTab.mainOutput; local g=build.skillsTab.socketGroupList[build.mainSocketGroup]
  local n=0 for _ in pairs(build.itemsTab.items) do n=n+1 end
  return require("dkjson").encode({ main=build.mainSocketGroup, k=g and g.mainActiveSkill or 0, total=o.TotalDPS or 0, combined=o.CombinedDPS or 0, buff=build.calcsTab.input.misc_buffMode, items=n })`);

const rows = (s) => s.groups.filter((g) => !g.duplicateOf && g.enabled).flatMap((g) => g.skills.map((x) => ({ i: g.i, k: x.k, name: x.name, dps: x.game.dps, pob: x.pobDps })));
const topOf = (s) => rows(s).sort((a, b) => b.dps - a.dps)[0];

const ITEMS = [
  { key: "weapon", slot: "Weapon 1", item: trade.weapon },
  { key: "gloves", slot: "Gloves", item: trade["armour.gloves"] },
];
const res = [];
for (const [bk, b] of Object.entries(builds)) {
  const row = { build: bk, tests: [] };
  try {
    const t0 = performance.now();
    await api.loadBuild(b.code);
    const s0 = await api.summary();
    row.loadMs = Math.round(performance.now() - t0);
    row.char = `${s0.char.ascendancy || s0.char.class} Lv${s0.char.level}`;
    // 本家の左の数字 (MAIN) と、同じスキルの行の pobDps (CALCS を MAIN にそろえた物) が一致するか
    const side = await pobSide();
    const mainRow = rows(s0).find((r) => r.i === side.main && r.k === side.k);
    row.sidebar = { main: side.main, k: side.k, pobTotal: Math.round(side.total), rowPob: mainRow ? Math.round(mainRow.pob) : null, rowName: mainRow?.name, same: mainRow ? Math.abs(mainRow.pob - side.total) < 1 : null, buff: side.buff };
    const top = topOf(s0);
    row.top = top ? { name: top.name, dps: Math.round(top.dps) } : null;
    // DPS が一番高いスキルを PoB の主スキルにして、本家の左の数字 (MAIN) と行の pobDps (CALCS を MAIN にそろえた物) を比べる
    if (top) {
      await lua(`return PCK.setMainSkill(${top.i}, ${top.k})`);
      const side2 = await pobSide();
      row.topSidebar = { pobTotal: Math.round(side2.total), rowPob: Math.round(top.pob), same: Math.abs(top.pob - side2.total) < 1 };
      await lua(`return PCK.setMainSkill(${side.main}, ${side.k})`);
    }
    row.zeroRows = rows(s0).filter((r) => r.dps <= 0).length;
    row.items0 = side.items;
    for (const it of ITEMS) {
      const orig = s0.items.find((x) => x.slot === it.slot)?.item;
      for (const lang of ["ja", "en"]) {
        const test = { item: it.key, lang, orig: orig ? `${orig.title} (${orig.base})` : "空き" };
        try {
          const text = copyText(lang === "ja" ? it.item.jp.item : it.item.en.item, lang);
          const conv = await toPobItem(text);
          test.unread = conv.unread;
          test.ambiguous = conv.ambiguous;
          const r = await api.equip(it.slot, conv.text);
          test.notCalculated = r.unread;
          const s1 = await api.summary();
          const now = s1.items.find((x) => x.slot === it.slot)?.item;
          test.inPoB = now ? { title: now.title, base: now.base, imp: now.implicits.length, rune: now.runes.length, exp: now.explicits.length } : null;
          test.lines = now ? [...now.runes, ...now.implicits, ...now.explicits] : [];
          const t1 = topOf(s1);
          test.after = t1 ? Math.round(t1.dps) : 0;
          test.diffPct = top?.dps ? +(((test.after - top.dps) / top.dps) * 100).toFixed(1) : null;
          test.offhand = s1.items.find((x) => x.slot === "Weapon 2")?.item?.title ?? "(空)";
          await api.restore(it.slot);
          const s2 = await api.summary();
          const t2 = topOf(s2);
          test.restored = Math.round(t2?.dps ?? 0) === Math.round(top?.dps ?? 0);
          if (!test.restored) test.afterRestore = { top: t2?.name, dps: Math.round(t2?.dps ?? 0), offhand: s2.items.find((x) => x.slot === "Weapon 2")?.item?.title ?? "(空)", changed: s2.items.filter((x) => x.changed).map((x) => x.slot) };
          test.items = (await pobSide()).items;
        } catch (e) {
          test.error = String(e);
        }
        row.tests.push(test);
      }
    }
    // ジェムの丸め・0 の行: 主スキルの最初のジェムを Lv 99 にして戻す
    try {
      const g = s0.groups.find((x) => x.i === side.main);
      const gem = g?.gems[0];
      if (gem) {
        const r1 = await api.setGem(g.i, gem.j, "level", 99);
        await api.setGem(g.i, gem.j, "level", gem.level);
        row.gemClamp = { from: gem.level, to99: r1.gem.level, max: gem.maxLevel };
      }
    } catch (e) {
      row.gemErr = String(e);
    }
  } catch (e) {
    row.error = String(e);
  }
  res.push(row);
}
return res;
