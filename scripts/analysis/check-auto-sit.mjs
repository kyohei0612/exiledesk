/**
 * check-auto-sit.mjs — ④ の計算 (mc) とエンジン (⑥ と同じ答えで 1 手ずつ) で、⑤ の場面ごとに 1 人あたり何回通ったかを並べる (解析君、2026-10-20 K2c)
 *
 *   node scripts/analysis/check-auto-sit.mjs [順位=3] [N=1000]
 *
 * 見本は check-auto-order.mjs の靴 (R は BOOTS_R、既定 30 神)。順位 = 値だけの安い順の何番目の順番か。
 * 計算: orderDetail(mc 2,000) の見えている形を auto-rules の whenOf で場面 (条件) に直して通った回数を足す。
 * エンジン: rulesFromDetail の答えで situationOf → ruleFor → applyQuizAction を 1 手ずつ (関門の打ち止めは見ない)。当たった答えの条件ごとに数える
 */
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_auto-sit-entry.ts");
const RANK = Number(process.argv[2] ?? 3), N = Number(process.argv[3] ?? 1000);
const data = M.loadPatch();
const PRICES = {
  exalt: 1, exalt_greater: 17.759, exalt_perfect: 2167.68, chaos: 73.097, chaos_greater: 215.018, chaos_perfect: 5420.49, annul: 316.796,
  OmenofSinistralExaltation: 67.472, OmenofDextralExaltation: 32.287, OmenofGreaterExaltation: 10.088, OmenofSinistralErasure: 14334.5, OmenofDextralErasure: 9624.24,
  OmenofWhittling: 9467.96, OmenofSinistralAnnulment: 15105.1, OmenofDextralAnnulment: 9748.28, OmenofSinistralCrystallisation: 282.44, OmenofDextralCrystallisation: 269.06,
  desecrate: 131.981, desecrate_ancient: 6757.19, OmenofAbyssalEchoes: 51.247, OmenofLight: 6667.94, OmenofSinistralNecromancy: 3.219, OmenofDextralNecromancy: 5.116,
  fracture: 8166.06, regal: 1.387, reveal: 0, divine: 718.434,
  "essence:perfect:Boots_str/PerfectEssence_BaseSpirit": 1219.68,
};
const DIV = PRICES.divine;
const price = (k) => PRICES[k] ?? 0;
const top = (id) => data.mods.get(id).tiers.length - 1;
const B = (s) => `Boots_str/${s}`;
const MS = B("Rune_chronomancy_MovementVelocity"), DODGE = B("Rune_chronomancy_DodgeRoll"), SPIRIT = B("PerfectEssence_BaseSpirit");
const RES = ["LightningResistance", "FireResistance", "ColdResistance"].map(B);
const targets = [
  { modId: MS, minTierIndex: 2, method: "fracture" },
  { modId: RES[0], minTierIndex: top(RES[0]), method: "chaos", alts: RES.slice(1).map((id) => ({ modId: id, minTierIndex: top(id) })), need: 2 },
  { modId: SPIRIT, minTierIndex: 0, method: "essence" },
  { modId: DODGE, minTierIndex: 0, method: "desecrate" },
];
PRICES["rune:Astrid's Creativity"] = 9.7 * DIV;
// SAMPLE=greater: グレーターの道の靴 (check-auto-order.mjs の bootsGreater と同じ)
const RAR = B("Essence_ItemFoundRarityIncrease");
const greater = process.env.SAMPLE === "greater";
if (greater) {
  const res = targets[1];
  const rarTier = data.mods.get(RAR).tiers.findIndex((t) => /^Greater/.test(String(t.name ?? "")));
  targets.splice(0, targets.length, targets[0], { ...res, need: 1 }, { modId: RAR, minTierIndex: Math.max(0, rarTier), method: "essence" }, targets[2], targets[3]);
}
const sim = { data, base: "Vaal Greaves", itemLevel: 82, targets, start: "fractured", startPrice: Number(process.env.BOOTS_R ?? 30) * DIV, sockets: 2, runePrice: (en) => price(`rune:${en}`), ...(greater ? { greater: { essKey: `essence:greater:${RAR}`, keep: targets[1] } } : {}) };
const label = { [`mod:${B("Essence_ItemFoundRarityIncrease")}`]: "絢爛", [`mod:${RES[0]}`]: "耐性", [`mod:${SPIRIT}`]: "スピリット", [`mod:${DODGE}`]: "ドッジ" };
const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));

const b = M.buildAutoModel({ sim, price });
if (!b.ok) throw new Error(b.reason.ja);
const model = b.model;
const all = perms(model.keys).map((o) => ({ o, r: M.solveOrder(model, o) })).sort((a, b) => a.r.perFinish - b.r.perFinish);
const order = all[RANK - 1].o;
const det = M.orderDetail(model, order, { mc: 2000, seed: 3 });
const recipe0 = M.quizFromSim({ ...sim, order }, null).recipe;
const quiz = M.rulesFromDetail(model, det, recipe0);
const { recipe } = M.quizFromSim({ ...sim, order }, quiz);
const route = recipe.routes[0];
const fracId = route.goal.find((s) => s.kind === "fractured").id;
const aug = (recipe0.start.runes?.length ?? 0) + model.runes.filter((r) => !(recipe0.start.runes ?? []).includes(r)).length;
console.log(`順番 #${RANK} ${order.map((k) => label[k] ?? k).join(" → ")}、札 ${route.goal.map((s) => s.id + ":" + s.mods.map((m) => m.modId.split("/")[1]).join("/")).join(" ")}`);

// 計算
const calc = new Map();
for (const v of det.view) {
  if (!(v.visits > 0)) continue;
  const k = JSON.stringify(M.whenOf(model, fracId, aug, v.s));
  const e = calc.get(k) ?? { n: 0, act: v.act };
  e.n += v.visits / 2000; calc.set(k, e);
}
// エンジン
const eng = new Map();
const trans = new Map(); // 場面 → 次の場面 → 回数 (エンジン)
const revealItems = [];
const g = M.mulberry32(20261020);
let unans = 0, steps = 0, done = 0;
for (let i = 0; i < N; i++) {
  const buy = () => {
    const st = recipe.start, pk = st.pick?.[Math.floor(g() * st.pick.length)] ?? st;
    let x = M.startFrom(data, recipe.base, recipe.itemLevel, { mods: pk.mods, ...(st.rarity ? { rarity: st.rarity } : {}), ...(st.sockets ? { sockets: st.sockets } : {}), ...((pk.runes ?? st.runes)?.length ? { runes: pk.runes ?? st.runes } : {}) }, Math.floor(g() * 2 ** 31));
    for (const y of st.steps ?? []) x = M.applyCurrency(data, x, y.use, g, y.omens ?? []).item;
    const fr = pk.fracture ?? st.fracture;
    if (fr) { const f = (ms) => ms.map((m) => (m.modId === fr ? { ...m, fractured: true } : m)); x = { ...x, prefixes: f(x.prefixes), suffixes: f(x.suffixes) }; }
    return x;
  };
  let it = buy();
  for (let st = 0; st < 400000; st++) {
    const sit = M.situationOf(it, route.goal, route.order);
    if (M.routeDone(route, sit)) { done++; break; }
    const rule = M.ruleFor(route.rules, sit);
    if (!rule) { unans++; break; }
    const k = JSON.stringify(rule.when);
    eng.set(k, (eng.get(k) ?? 0) + 1 / N);
    if (process.env.PROBE_REVEAL && "reveal" in rule.do && revealItems.length < 40) revealItems.push({ k, it });
    const x = M.applyQuizAction(data, route, it, rule.do, g);
    steps++;
    if (x.kind === "restart") { it = buy(); continue; }
    if (x.kind === "blocked") break;
    if (x.kind === "used") it = x.item;
    const s2 = M.situationOf(it, route.goal, route.order);
    const r2 = M.routeDone(route, s2) ? "完成" : (M.ruleFor(route.rules, s2) ? JSON.stringify(M.ruleFor(route.rules, s2).when) : "答え無し");
    const tm = trans.get(k) ?? new Map(); tm.set(r2, (tm.get(r2) ?? 0) + 1); trans.set(k, tm);
  }
}
console.log(`エンジン: 完成 ${done}/${N}・答え無し ${unans}・1 人 ${(steps / N).toFixed(1)} 手 / 計算 mc: 1 人 ${[...calc.values()].reduce((a, e) => a + e.n, 0).toFixed(1)} 手`);
const keys = [...new Set([...calc.keys(), ...eng.keys()])];
const rows = keys.map((k) => ({ k, c: calc.get(k)?.n ?? 0, e: eng.get(k) ?? 0, act: calc.get(k)?.act ?? route.rules.find((r) => JSON.stringify(r.when) === k)?.do })).sort((a, b) => Math.abs(b.e - b.c) - Math.abs(a.e - a.c));
const short = (k) => Object.entries(JSON.parse(k)).filter(([kk, v]) => kk !== "aug" && kk !== fracId && v !== 0).map(([kk, v]) => `${kk}=${v}`).join(",") || "(空)";
console.log("場面 (0 でない項目) | 計算 1 人 | エンジン 1 人 | 手");
for (const r of rows.slice(0, 20)) console.log(`  ${short(r.k).padEnd(40)} ${r.c.toFixed(2).padStart(7)} ${r.e.toFixed(2).padStart(7)}  ${typeof r.act === "string" ? r.act : JSON.stringify(r.act)}`);

// 上の 4 つの場面: 次の場面への分かれ方 (エンジンの実測 vs 計算の行き先)。計算は見えている形のうち通った回数の一番多い物から、その手の行き先を見え方に直す
const sh = new M.Shape(model);
for (const r of rows.slice(0, Number(process.env.TRANS ?? 4))) {
  const vs = det.view.filter((v) => JSON.stringify(M.whenOf(model, fracId, aug, v.s)) === r.k).sort((a, b) => b.visits - a.visits)[0];
  const tm = trans.get(r.k) ?? new Map(), tot = [...tm.values()].reduce((a, b) => a + b, 0);
  const cm = new Map();
  if (vs) {
    const a = M.actionsOf(sh, [...vs.s]).find((x) => x.name === vs.act);
    for (const [p, t] of a?.out ?? []) { const v = sh.view(t, det.gates); const kk = sh.goal(t) ? "完成" : JSON.stringify(M.whenOf(model, fracId, aug, v)); cm.set(kk, (cm.get(kk) ?? 0) + p); }
  }
  console.log(`
${short(r.k)} (${typeof r.act === "string" ? r.act : JSON.stringify(r.act)}) の次: 計算 / エンジン (${tot} 回)`);
  const ks = [...new Set([...cm.keys(), ...tm.keys()])].map((kk) => ({ kk, c: cm.get(kk) ?? 0, e: (tm.get(kk) ?? 0) / (tot || 1) })).sort((a, b) => b.e + b.c - a.e - a.c);
  for (const x of ks.slice(0, 10)) console.log(`  ${(x.kk.startsWith("{") ? short(x.kk) : x.kk).padEnd(40)} ${x.c.toFixed(3)} / ${x.e.toFixed(3)}`);
}

// PROBE_REVEAL=1: 発現の場面のアイテムで、エンジンの revealOffers の 1 組目に「埋まっていない札の MOD」が出る割合 vs 計算の 1 組 (rv|0) の当たり
if (process.env.PROBE_REVEAL) {
  const byK = new Map();
  for (const { k, it } of revealItems) {
    const open = route.goal.filter((sl) => (M.situationOf(it, route.goal, route.order)[sl.id] ?? 0) < 2);
    let h = 0; const T = 400;
    for (let i = 0; i < T; i++) { const o = M.revealOffers(data, it, g); if (o.first.some((m) => open.some((sl) => sl.side === m.side && sl.mods.some((mm) => mm.modId === m.modId && m.tierIndex >= mm.minTierIndex)))) h++; }
    const e = byK.get(k) ?? { n: 0, h: 0 }; e.n += T; e.h += h; byK.set(k, e);
  }
  for (const [k, e] of byK) {
    const vs = det.view.filter((v) => JSON.stringify(M.whenOf(model, fracId, aug, v.s)) === k).sort((a, b) => b.visits - a.visits)[0];
    const a = vs && M.actionsOf(sh, [...vs.s]).find((x) => x.name === "rv|0");
    const c = a ? a.out.filter(([, t]) => sh.goal(t) || t.slice(1, 1 + sh.K).filter((v, kk) => sh.hit(kk, v)).length > [...vs.s].slice(1, 1 + sh.K).filter((v, kk) => sh.hit(kk, v)).length).reduce((x, [p]) => x + p, 0) : NaN;
    console.log(`発現 1 組で埋まっていない札が出る: ${short(k)} 計算 ${c.toFixed(3)} / エンジン ${(e.h / e.n).toFixed(3)} (${e.n} 回)`);
  }
}
