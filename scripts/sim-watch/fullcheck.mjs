/**
 * fullcheck.mjs — S-160 の表の行 × 親の形を、エンジンの全結果と木の枝で突き合わせる (オーナー 11-01「フルチェックしてくれ枝とエンジンで照らし合わせて」)。
 *   node scripts/sim-watch/fullcheck.mjs [--origin http://localhost:1447] [--out out.jsonl] [--only 親,親] [--hands 手,手] [--trees] [--port 9681]
 * 親はページを開き直して作り、手は打っては Ctrl+Z で戻す。結果は 1 行 1 手の JSON。--trees は trees.json の木の手のある箱を全部見る。
 */
import { openChrome, sleep } from "./cdp.mjs";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const opt = (k, v = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : v; };
const ORIGIN = opt("--origin", "http://localhost:1447"), OUT = opt("--out", "fullcheck.jsonl"), only = opt("--only")?.split(","), handsOnly = opt("--hands")?.split(",");
const here = (p) => new URL(p, import.meta.url);
const R = "Rings/", E = R + "EvasionRating", RP = R + "ItemFoundRarityIncreasePrefix", LI = R + "IncreasedLife", FI = R + "FireResistance", RS = R + "ItemFoundRarityIncrease", CO = R + "ColdResistance";
const ring = { part: "指輪", base: "Gold Ring", goals: [{ modId: E, tier: 1 }, { modId: RP, tier: 3 }, { modId: LI, tier: 1 }, { modId: FI, tier: 1 }, { modId: RS, tier: 3 }, { modId: CO, tier: 1 }] };
const m = (modId, tier = 1, fractured) => ({ modId, tier, ...(fractured ? { fractured: true } : {}) });
const SJ = m(R + "Essence_ColdResistance", 1), PJ = m(R + "Essence_IncreasedLife", 1), DJ = m(R + "Desecrated_CooldownRecovery", 1);
const star = (id) => ring.goals.map((g) => (g.modId === id ? { ...g, fractured: true } : g));
const rand = (side) => ({ key: "exalt", omens: [side === "P" ? "OmenofSinistralExaltation" : "OmenofDextralExaltation"], opt: { hitAims: [] }, pick: "any" });
const rr = (mods, sides = "", path = []) => ({ ...ring, start: { rarity: "rare", mods }, path: [...[...sides].map(rand), ...path] });
const BONE = "desecrate", REGAL = "exalt";
const parents = {
  白: { ...ring, start: { rarity: "normal", mods: [] } },
  マジック狙い1: { ...ring, start: { rarity: "normal", mods: [] }, path: [{ key: "transmute", opt: { hitAims: [E] }, pick: "hit" }] },
  マジック狙いランダム: { ...ring, start: { rarity: "normal", mods: [] }, path: [{ key: "transmute", opt: { hitAims: [E] }, pick: "hit" }, { key: "augment", opt: { hitAims: [] } }] },
  マジック低狙いランダム: { ...ring, start: { rarity: "normal", mods: [] }, path: [{ key: "transmute", opt: { hitAims: [RP] }, pick: "hit" }, { key: "augment", opt: { hitAims: [] } }] },
  レア高狙い空き: rr([m(E), m(FI)]),
  レア低狙い空き: rr([m(RP, 3), m(RS, 3)]),
  レア狙いランダム2: rr([m(E), m(FI)], "PS"),
  レア低狙いランダム2: rr([m(RP, 3), m(RS, 3)], "PS"),
  レア確定外れ: rr([m(E), m(FI), SJ]),
  レア確定外れランダム: rr([m(E), m(FI), SJ], "P"),
  レア満杯確定: rr([m(RP, 3), m(E), PJ, m(FI), m(RS, 3)], "", [{ key: "exalt", opt: { hitAims: [] }, pick: "any" }]),
  プレ満杯サフィ空き: rr([m(E), m(RP, 3), PJ, m(FI)]),
  サフィ満杯プレ空きランダム: rr([m(E), m(FI), m(RS, 3), SJ], "", [{ key: "exalt", opt: { hitAims: [] }, pick: "any" }]),
  レア全部ランダム: { ...ring, start: { rarity: "normal", mods: [] }, path: [{ key: "alchemy", opt: { hitAims: [] } }] },
  冒涜発現済: rr([m(E), m(FI), DJ]),
  冒涜発現ランダム: rr([m(E), m(FI)], "P", [{ key: BONE, omens: ["OmenofDextralNecromancy"], opt: { hitAims: [], veil: "pick" }, pick: "junk" }]),
  未発現サフィ: rr([m(E), m(FI)], "", [{ key: BONE, omens: ["OmenofDextralNecromancy"], opt: { hitAims: [], veil: "keep" }, pick: "any" }]),
  未発現満杯側: rr([m(E), m(RP, 3), m(FI), m(RS, 3), SJ], "", [{ key: BONE, omens: ["OmenofDextralNecromancy"], opt: { hitAims: [], veil: "keep" } }]),
  星プレ確定外れ: { ...rr([m(FI), SJ]), goals: star(E) },
  星サフィランダム: { ...rr([m(E), PJ], "S"), goals: star(FI) },
  当たり道: rr([m(E), m(RS, 3)], "S", [{ key: "chaos", opt: { hitAims: [FI] }, pick: "hit" }]),
  全消しの後: rr([m(E), m(FI), m(RS, 3)], "", [{ key: "annul", opt: { keep: [] }, omens: ["OmenofDextralAnnulment"] }, { key: "annul", opt: { keep: [] } }]),
  ブリーチ道: rr([m(E), m(FI)], "S", [{ key: "essence:perfect:Rings/PerfectEssence_LocalMaximumQuality", opt: {} }]),
  品質後: rr([m(E), m(FI), SJ], "", [{ key: "catalyst_defences", opt: { qualityTo: 20 } }]),
  白兜: { part: "兜", base: "Kamasan Tiara", goals: [{ modId: "Helmets_int/LocalEnergyShieldPercent", tier: 1 }, { modId: "Helmets_int/FireResistance", tier: 1 }, { modId: "Helmets_int/ColdResistance", tier: 1 }], start: { rarity: "normal", mods: [] } },
  マジック狙いサフィ: { ...ring, start: { rarity: "normal", mods: [] }, path: [{ key: "transmute", opt: { hitAims: [FI] }, pick: "hit" }] },
  マジック外れプレ: { ...ring, start: { rarity: "normal", mods: [] }, path: [{ key: "transmute", opt: { hitAims: [] }, pick: "any", has: "" }] },
  マジック兜: { part: "兜", base: "Kamasan Tiara", goals: [{ modId: "Helmets_int/LocalEnergyShieldPercent", tier: 1 }, { modId: "Helmets_int/FireResistance", tier: 1 }], start: { rarity: "normal", mods: [] }, path: [{ key: "transmute", opt: { hitAims: ["Helmets_int/FireResistance"] }, pick: "hit" }] },
  プレ外れ2ランダム: rr([m(FI), m(CO)], "PP"),
  プレ外れ2確定: rr([m(FI), m(CO), PJ], "P"),
  プレ外れ1狙い1: rr([m(E), m(FI)], "P"),
  未発現プレ: rr([m(E), m(FI)], "", [{ key: BONE, omens: ["OmenofSinistralNecromancy"], opt: { hitAims: [], veil: "keep" }, pick: "any" }]),
  未発現低狙い: rr([m(RP, 3), m(RS, 3)], "", [{ key: BONE, omens: ["OmenofDextralNecromancy"], opt: { hitAims: [], veil: "keep" }, pick: "any" }]),
  未発現ランダム: rr([m(E), m(FI)], "P", [{ key: BONE, omens: ["OmenofDextralNecromancy"], opt: { hitAims: [], veil: "keep" }, pick: "any" }]),
  冒涜低狙い: rr([m(RP, 3), m(RS, 3), DJ]),
  冒涜ランダム2: rr([m(E), m(FI), DJ], "P"),
  星4つ: { ...rr([m(E), m(RP, 3), m(FI), m(RS, 3)]), goals: star(E) },
  星2つ4つ: { ...rr([m(E), m(RP, 3), m(FI), m(RS, 3)]), goals: ring.goals.map((g) => (g.modId === E || g.modId === FI ? { ...g, fractured: true } : g)) },
  兜レア2: { part: "兜", base: "Kamasan Tiara", goals: [{ modId: "Helmets_int/LocalEnergyShieldPercent", tier: 1 }, { modId: "Helmets_int/FireResistance", tier: 1 }, { modId: "Helmets_int/ColdResistance", tier: 1 }], start: { rarity: "rare", mods: [m("Helmets_int/FireResistance"), m("Helmets_int/ColdResistance")] } },
  兜レア: { part: "兜", base: "Kamasan Tiara", goals: [{ modId: "Helmets_int/LocalEnergyShieldPercent", tier: 1 }, { modId: "Helmets_int/FireResistance", tier: 1 }, { modId: "Helmets_int/ColdResistance", tier: 1 }], start: { rarity: "rare", mods: [m("Helmets_int/LocalEnergyShieldPercent"), m("Helmets_int/FireResistance")] }, path: [rand("P")] },
};
const EX = ["OmenofSinistralExaltation", "OmenofDextralExaltation", "OmenofGreaterExaltation", "OmenofCatalysingExaltation"];
const CH = ["OmenofWhittling", "OmenofSinistralErasure", "OmenofDextralErasure"];
const AN = ["OmenofSinistralAnnulment", "OmenofDextralAnnulment", "OmenofLight"];
const NE = ["OmenofSinistralNecromancy", "OmenofDextralNecromancy"];
const PE = ["OmenofSinistralCrystallisation", "OmenofDextralCrystallisation"];
const row = (rowName, key, omens = [], variants = [{}]) => variants.map((v) => ({ row: rowName, key, omens, ...v }));
const adds = [{ hit: "free" }, { hit: "one", aimOnly: true }, { hit: "all", aimOnly: true }];
const swaps = [{ hit: "free" }, { hit: "one", aimOnly: true }, { hit: "free", keep: "first" }, { hit: "one", aimOnly: true, keep: "first" }];
const PSUF = "essence:perfect:Rings/PerfectEssence_ManaRegeneration", PPRE = "essence:perfect:Rings/PerfectEssence_MaximumManaIncreasePercent";
const STONE = [{ stone: 1, stoneId: "Rings/Desecrated_CooldownRecovery", opt: { veil: "pick" } }, { hit: "free", opt: { veil: "pick" } }];
const hands = [
  ...row("変成", "transmute", [], adds),
  ...row("増強", "augment", [], adds),
  ...row("王者", "regal", [], adds),
  ...row("高貴", "exalt", [], adds), ...row("高貴+左", "exalt", [EX[0]], adds), ...row("高貴+右", "exalt", [EX[1]], adds),
  ...row("高貴+大いなる", "exalt", [EX[2]], [{ hit: "free", seeds: 8, cap: 1500 }, { hit: "one", aimOnly: true, seeds: 8, cap: 1500 }]),
  ...row("高貴+触媒", "exalt", [EX[3]], adds),
  ...row("カオス", "chaos", [], swaps), ...row("カオス+左", "chaos", [CH[1]], swaps), ...row("カオス+右", "chaos", [CH[2]], swaps),
  ...row("削減カオス", "chaos", [CH[0]], swaps.map((v) => ({ ...v, seeds: 32 }))),
  ...row("消去(全部)", "annul", [], [{ keep: "none" }]), ...row("消去(残す)", "annul", [], [{ keep: "oneAim" }, { keep: "first" }, { keep: "junk" }]),
  ...row("消去+左(全部)", "annul", [AN[0]], [{ keep: "none" }]), ...row("消去+左(残す)", "annul", [AN[0]], [{ keep: "oneAim" }]),
  ...row("消去+右(全部)", "annul", [AN[1]], [{ keep: "none" }]), ...row("消去+右(残す)", "annul", [AN[1]], [{ keep: "oneAim" }]),
  ...row("消去+光", "annul", [AN[2]]),
  ...row("エッセンス", "essence:greater:Rings/Essence_ColdResistance"), ...row("エッセンス(狙い外)", "essence:greater:Rings/Essence_Strength", [], [{}, { hit: "one" }]),
  ...row("パーフェクト", PSUF, [], [{}, { keep: "first" }]), ...row("パーフェクト(プレ)", PPRE, [], [{}, { keep: "first" }]),
  ...row("パーフェクト+左", PSUF, [PE[0]], [{}]), ...row("パーフェクト+右", PSUF, [PE[1]], [{}]), ...row("ブリーチ", "essence:perfect:Rings/PerfectEssence_LocalMaximumQuality", [], [{}, { keep: "first" }]), ...row("ブリーチ+左", "essence:perfect:Rings/PerfectEssence_LocalMaximumQuality", [PE[0]], [{}, { keep: "first" }]), ...row("ブリーチ+右", "essence:perfect:Rings/PerfectEssence_LocalMaximumQuality", [PE[1]], [{}, { keep: "first" }]),
  ...row("カタリスト", "catalyst_defences", [], [{ opt: { qualityTo: 20 } }]),
  ...row("骨(未発現)", "desecrate", [], [{ hit: "free", opt: { veil: "keep" } }, { hit: "free", keep: "first", opt: { veil: "keep" } }]),
  ...row("骨(未発現)+左", "desecrate", [NE[0]], [{ hit: "free", opt: { veil: "keep" } }]), ...row("骨(未発現)+右", "desecrate", [NE[1]], [{ hit: "free", opt: { veil: "keep" } }]),
  ...row("骨(発現)", "desecrate", [], STONE), ...row("骨(発現)+左", "desecrate", [NE[0]], STONE), ...row("骨(発現)+右", "desecrate", [NE[1]], STONE), ...row("骨(反響)", "desecrate", ["OmenofAbyssalEchoes"], STONE.map((v) => ({ ...v, opt: { ...v.opt, echo: true } }))),
  ...row("発現(後)", "reveal", [], [{ hit: "one" }]),
  ...row("フラクチャー", "fracture", [], [{}]), ...row("フラクチャー(狙い無し)", "fracture", [], [{ opt: { free: true } }]),
  ...row("ルーン", "rune:*"),
];
const c = await openChrome(Number(opt("--port", "9681")));
await c.size(1660, 950, false);
await c.go(`${ORIGIN}/web.html`);
await c.ev(`(()=>{try{localStorage.clear();sessionStorage.clear();localStorage.setItem("exiledesk.changelog.seen","9.9.9")}catch{}return 1})()`);
const PAGE = readFileSync(here("./fullcheck-page.js"), "utf8").replace(/^\/\/.*$/gm, "");
const open = async (hash = "") => {
  await c.go("about:blank");
  await c.send("Page.navigate", { url: `${ORIGIN}/web.html?page=sim-tree&lang=ja${opt("--off") ? "&off=" + opt("--off") : ""}${hash}` });
  if (!(await c.until("!!window.__simMonkey", 120000))) throw new Error("開かない");
  await sleep(hash ? 3500 : 2500);
  await c.ev(PAGE);
  if (args.includes("--plant")) await c.ev("window.__plant=1;0");
};
/** 長い式: setTimeout で走らせて window.__r を待つ */
const slow = async (expr, ms = 240000) => {
  await c.ev(`window.__r=undefined;setTimeout(async()=>{try{window.__r=JSON.stringify(await (${expr}))}catch(e){window.__r=JSON.stringify({err:String(e&&e.stack||e).slice(0,500)})}},0);0`);
  if (!(await c.until("window.__r!==undefined", ms))) return { err: "時間切れ" };
  return JSON.parse(await c.ev("window.__r"));
};
const log = (o) => appendFileSync(OUT, JSON.stringify(o) + "\n");
if (!args.includes("--append")) writeFileSync(OUT, "");
try {
  if (!args.includes("--no-matrix")) for (const [name, spec] of Object.entries(parents)) {
    if (only && !only.includes(name)) continue;
    await open();
    const p = await slow(`window.__fc.makeParent(${JSON.stringify(spec)})`);
    log({ type: "parent", name, ...p });
    console.log(new Date().toISOString().slice(11, 19), "親", name, JSON.stringify(p).slice(0, 260));
    if (p.err) continue;
    const t0 = Date.now(); let n = 0, bad = 0, sk = 0;
    for (const h of hands) {
      if (handsOnly && !handsOnly.includes(h.row)) continue;
      const r = await slow(`window.__fc.tryHand(${JSON.stringify(p.at)},${JSON.stringify(h)})`, 120000);
      log({ type: "hand", parent: name, row: h.row, key: h.key, omens: h.omens, v: { hit: h.hit, keep: h.keep, opt: h.opt }, ...r });
      if (r.skip) { sk++; continue; }
      n++; bad += r.finds?.length ? 1 : 0;
      if (r.err) { console.log("  落ち", h.row, r.err.slice(0, 200)); await open(); const q = await slow(`window.__fc.makeParent(${JSON.stringify(spec)})`); if (q.err) break; }
      if (r.undoBad) { console.log("  戻せない", h.row); await open(); await slow(`window.__fc.makeParent(${JSON.stringify(spec)})`); }
    }
    console.log(new Date().toISOString().slice(11, 19), "  手", n, "飛ばし", sk, "ずれのある手", bad, Math.round((Date.now() - t0) / 1000) + "s");
  }
  if (opt("--recipe")) {
    const code = readFileSync(opt("--recipe"), "utf8").match(/#recipe=[A-Za-z0-9_-]+/)[0];
    await open(code); await sleep(3000);
    const list = await slow("window.__fc.handBoxes()");
    for (const b of list) { const r = await slow(`window.__fc.checkBox(${JSON.stringify(b.id)},8,1500)`, 120000); log({ type: "tree", tree: "owner", box: b.id, cur: b.cur, omens: b.omens, free: b.free, keep: b.keep, veil: b.veil, ...r }); }
    console.log("オーナーの木 手の箱", list.length);
  }
  if (args.includes("--trees")) {
    const all = JSON.parse(readFileSync(here("./trees.json"), "utf8"));
    for (const tr of [...all.trees, ...(all.owner ?? []), ...(all.pass ?? []), ...(all.rules ?? [])]) {
      if (!tr.code) continue;
      await open(`#recipe=${tr.code}`);
      const list = await slow("window.__fc.handBoxes()");
      if (list.err) { console.log(tr.key, list.err); continue; }
      let bad = 0;
      for (const b of list) {
        const r = await slow(`window.__fc.checkBox(${JSON.stringify(b.id)},8,1500)`, 120000);
        log({ type: "tree", tree: tr.key, box: b.id, cur: b.cur, omens: b.omens, free: b.free, keep: b.keep, veil: b.veil, ...r });
        if (r.finds?.length) bad++;
      }
      console.log(new Date().toISOString().slice(11, 19), "木", tr.key, "手の箱", list.length, "ずれ", bad);
    }
  }
} finally { c.close(); }
console.log("終わり");
process.exit(0);
