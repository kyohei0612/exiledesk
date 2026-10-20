/**
 * check-yafu-actual.mjs — やふやふさんの手袋 (動画 SJdAUeUMNBU) の「実際の完成品」(妥協した段込み) を狙いにして、
 * ④ の順番ごとの最善手 (solveOrder) と ⑤ の回し方 (エンジン) で完成までの費用を出す (解析君、2026-10-20)
 *
 *   node scripts/analysis/check-yafu-actual.mjs [v0,v1,v2] [N=1000] [TOP=3]
 *
 * リーク無し: 自動の打ち方は動画の結果・本人の手順を見ない。決めるのは ④ の順番 (関門)・⑤ の打ち方・③ の値段・打ち止めとエンジンの入口だけ。
 * ② の付け方 (フラクチャー・高貴・冒涜・カオス・エッセンス) は動画の付け方を入力にする (前の見本と同じ扱い)。
 * 見本 (狙い):
 *   v0 = 前の見本「③ 動画と同じ完成品」(メモ optimal-craft-dp): マナ T1 固定 / スピード (冒涜)・ES 実数 T1 (高貴) / 投射物 +2・ヒステリー・戦慄
 *   v1 = 実物 (字幕から): スピード固定 / ES% (高貴、段は不明 → どの段でも)・マナ (冒涜、段は不明 → どの段でも) / 投射物 +2・ヒステリー・戦慄
 *   v2 = v1 のマナを T1 に (本人が狙っていた段)
 *   b0 = 見本の靴 (④ の突き合わせの靴、check-auto-order.mjs と同じ。見本の完成手順 boots-chrono はグレーターの道で solveOrder の範囲外)
 * 始めの値段 R = ③ の白から作る式 (use-sim-calc.ts の calc と同じ組み方、1 手の確率は sim-odds = エンジンの入口)。白のベースは 0 神。
 * ルーン (コルの狩り・アストリッドの創造性) は ⑤ の最初に差す (代金はエンジンの費用に入る)。値段は 10-21 の相場 (check-auto-order.mjs と同じ、神 = 718 高貴)
 */
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_yafu-entry.ts");
const want = (process.argv[2] ?? "v0,v1,v2,b0").split(",");
const N = Number(process.argv[3] ?? 1000);
const TOP = Number(process.argv[4] ?? 3);
const data = M.loadPatch();

const PRICES = {
  exalt: 1, exalt_greater: 17.759, exalt_perfect: 2167.68, chaos: 73.097, chaos_greater: 215.018, chaos_perfect: 5420.49, annul: 316.796,
  OmenofSinistralExaltation: 67.472, OmenofDextralExaltation: 32.287, OmenofGreaterExaltation: 10.088, OmenofSinistralErasure: 14334.5, OmenofDextralErasure: 9624.24,
  OmenofWhittling: 9467.96, OmenofSinistralAnnulment: 15105.1, OmenofDextralAnnulment: 9748.28, OmenofSinistralCrystallisation: 282.44, OmenofDextralCrystallisation: 269.06,
  desecrate: 131.981, desecrate_ancient: 6757.19, OmenofAbyssalEchoes: 51.247, OmenofLight: 6667.94, OmenofSinistralNecromancy: 3.219, OmenofDextralNecromancy: 5.116,
  fracture: 8166.06, regal: 1.387, reveal: 0, divine: 718.434,
  transmute: 1.086, transmute_greater: 1.178, transmute_perfect: 11.83, augment: 1.87, augment_greater: 2.817, augment_perfect: 180.0,
  "rune:Kolr's Hunt": 838.48, "rune:Uhtred's Sidereus": 838.48, "essence:perfect:Boots_str/PerfectEssence_BaseSpirit": 1219.68, "rune:Astrid's Creativity": 6940.498,
  "essence:perfect:Gloves_int/PerfectEssence_CriticalStrikeMultiplier": 998.84, "essence:perfect:Gloves_int/PerfectEssence_SoulCore": 1219.68,
};
const DIV = PRICES.divine;
const price = (k) => PRICES[k] ?? 0;
const runePrice = (en) => price(`rune:${en}`);
const ASTRID = "Astrid's Creativity";
const need = (id) => { const m = data.mods.get(id); if (!m) throw new Error("MOD が無い: " + id); return m; };
const top = (id) => need(id).tiers.length - 1;
const BASE = "Intricate Gloves", ILVL = 82;

const ID = (s) => `Gloves_int/${s}`;
const MN = ID("IncreasedMana"), ES = ID("LocalEnergyShield"), ESP = ID("LocalEnergyShieldPercent"), SPD = ID("Rune_marksman_ProjectileSpeed");
const PROJ = ID("Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level"), HYS = ID("PerfectEssence_CriticalStrikeMultiplier"), HOR = ID("PerfectEssence_SoulCore");
const LABEL = { [`mod:${SPD}`]: "スピード", [`mod:${ES}`]: "ES T1", [`mod:${ESP}`]: "ES%", [`mod:${MN}`]: "マナ", [`mod:${PROJ}`]: "投射物", [`mod:${HYS}`]: "ヒステリー", [`mod:${HOR}`]: "戦慄" };
const suf = [{ modId: PROJ, minTierIndex: top(PROJ), method: "chaos" }, { modId: HYS, minTierIndex: 0, method: "essence" }, { modId: HOR, minTierIndex: 0, method: "essence" }];
const BT = (x) => `Boots_str/${x}`;
const MS = BT("Rune_chronomancy_MovementVelocity"), DODGE = BT("Rune_chronomancy_DodgeRoll"), SPIRIT = BT("PerfectEssence_BaseSpirit");
const RES = ["LightningResistance", "FireResistance", "ColdResistance"].map(BT);
Object.assign(LABEL, { [`mod:${RES[0]}`]: "耐性T1×2", [`mod:${SPIRIT}`]: "スピリット", [`mod:${DODGE}`]: "ドッジロール" });
const VARIANTS = {
  b0: { name: "見本の靴 (④ の突き合わせの靴: 移動速度 T1 固定 / ドッジ (冒涜、段は 2 つなので T2 以上 = どの段でも) / 耐性 T1 × 2・スピリット)", base: "Vaal Greaves", astrid: false,
    targets: [{ modId: MS, minTierIndex: 2, method: "fracture" }, { modId: RES[0], minTierIndex: top(RES[0]), method: "chaos", alts: RES.slice(1).map((id) => ({ modId: id, minTierIndex: top(id) })), need: 2 }, { modId: SPIRIT, minTierIndex: 0, method: "essence" }, { modId: DODGE, minTierIndex: 0, method: "desecrate" }] },
  v0: { name: "前の見本 (マナ T1 固定 + スピード + ES 実数 T1)", targets: [{ modId: MN, minTierIndex: top(MN), method: "fracture" }, { modId: SPD, minTierIndex: 0, method: "desecrate" }, { modId: ES, minTierIndex: top(ES), method: "exalt" }, ...suf] },
  v1: { name: "実物 (スピード固定 + ES% どの段でも + マナ どの段でも)", targets: [{ modId: SPD, minTierIndex: 0, method: "fracture" }, { modId: ESP, minTierIndex: 0, method: "exalt" }, { modId: MN, minTierIndex: 0, method: "desecrate" }, ...suf] },
  v2: { name: "実物のマナを T1 に (スピード固定 + ES% どの段でも + マナ T1)", targets: [{ modId: SPD, minTierIndex: 0, method: "fracture" }, { modId: ESP, minTierIndex: 0, method: "exalt" }, { modId: MN, minTierIndex: top(MN), method: "desecrate" }, ...suf] },
};

/** ③ の白から作る 1 個 (use-sim-calc.ts の calc と同じ組み方、グレーターの道・買う始め方は無し) */
function whiteCost(targets, base) {
  const frac = targets.filter((t) => t.method === "fracture");
  const it = M.startFrom(data, base, ILVL, { rarity: "magic", sockets: 2 }, 1);
  const blank = M.blankWith(data, it, ILVL, "magic", targets);
  const grades = [["augment_perfect", "transmute_perfect"], ["augment_greater", "transmute_greater"], ["augment", "transmute"]].map(([aug, tra]) => ({ aug, tra, odds: M.magicAugOdds(data, blank, aug) }));
  const pHitOf = (o) => Math.min(1, frac.reduce((a, r) => a + o.hit(need(r.modId).type === "suffix" ? "suffix" : "prefix", [r]), 0));
  const gr = grades.find((g) => pHitOf(g.odds) > 0) ?? grades[0];
  const pHit = pHitOf(gr.odds);
  const fracP = M.fractureOdds(data, blank, frac.map((r) => ({ modId: r.modId, minTierIndex: r.minTierIndex })));
  const runes = [...new Set(frac.map((r) => need(r.modId).rune).filter(Boolean).map((r) => M.runeEnForId(r)).filter(Boolean))];
  const rr = 1 / pHit;
  const once = runes.reduce((a, en) => a + runePrice(en), 0) + price(gr.tra) + rr * price(gr.aug) + rr * 2 * price("annul") + price("regal") + Math.max(0, 1 - pHit) * price("exalt") + price("desecrate") + price("fracture");
  return { R: once / fracP + 2 * price("annul"), pHit, fracP, grade: gr.aug };
}

const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));
const div = (v) => (v / DIV).toFixed(1);
const pct = (a, b) => (b ? `${(((a - b) / b) * 100).toFixed(1)}%` : "-");

/** 計算の最善手を ⑤ の答えに (src の auto-rules の rulesFromDetail。K2b: 前は古い rulesOf の写しで、発現で段の足りない狙いの見え方の答えが抜け、靴 #2 で答え無し 422 人)。
 * アストリッド (計算の形に無いルーン) は要るルーンの後に差す答えを足し、ほかの答えの aug を 1 つ上げる */
function rulesOf(model, det, sim, recipe0, astrid) {
  const q = M.rulesFromDetail(model, det, recipe0);
  if (!astrid || (recipe0.start.runes ?? []).includes(ASTRID)) return q;
  const isRune = (r) => typeof r.do.use === "string" && r.do.use.startsWith("rune:");
  const runes = q.rules.main.filter(isRune), rest = q.rules.main.filter((r) => !isRune(r));
  const aug0 = (recipe0.start.runes?.length ?? 0) + runes.length;
  return { v: 3, rules: { main: [...runes, { when: { aug: aug0 }, do: { use: `rune:${ASTRID}` } }, ...rest.map((r) => ({ ...r, when: { ...r.when, aug: aug0 + 1 } }))] } };
}

/** ⑥ と同じ回し方 (quizFromSim + runQuizOnce、関門・打ち止めあり)。1 人ずつの費用も返す (半分の人) */
function engine(sim, order, quiz, n) {
  const { recipe, error } = M.quizFromSim({ ...sim, order }, quiz);
  if (error) throw new Error(error);
  const costs = [], uses = {};
  let done = 0, unans = 0, gate = 0, blocked = 0;
  const why = {};
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const r = M.runQuizOnce(data, recipe, 900000 + i * 7919, { price, maxSteps: 400000 });
    if (r.stop?.kind === "unanswered") { unans++; const k = Object.entries(r.stop.situation).filter(([k]) => !["r", "cat", "n", "p.n", "s.n", "p.free", "s.free", "fx", "p.fx", "s.fx"].includes(k)).map(([k, v]) => `${k}=${v}`).join(","); why[k] = (why[k] ?? 0) + 1; continue; }
    if (r.stop?.kind === "gate") gate++;
    if (r.stop?.kind === "blocked") { blocked++; why["打てない " + r.stop.reason] = (why["打てない " + r.stop.reason] ?? 0) + 1; }
    costs.push(r.cost - recipe.start.price); if (r.done) done++;
    for (const [k, c] of Object.entries(r.uses)) uses[k] = (uses[k] ?? 0) + c;
  }
  const m = costs.length;
  const sorted = [...costs].sort((a, b) => a - b);
  return { cost: m ? costs.reduce((a, b) => a + b, 0) / m : NaN, finish: m ? done / m : NaN, median: m ? sorted[m >> 1] : NaN, p90: m ? sorted[Math.floor(m * 0.9)] : NaN, uses: Object.fromEntries(Object.entries(uses).map(([k, c]) => [k, c / (m || 1)])), unans, gate, blocked, why: Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 3), sec: (Date.now() - t0) / 1000 };
}

for (const v of want) {
  const V = VARIANTS[v];
  const w = whiteCost(V.targets, V.base ?? BASE);
  const astrid = V.astrid === false ? 0 : runePrice(ASTRID);
  console.log(`\n== ${v}: ${V.name}`);
  console.log(`  始め R (③ の白から、${w.grade}・増強 1 回の当たり ${(w.pHit * 100).toFixed(2)}%・フラクチャーの当たり ${(w.fracP * 100).toFixed(1)}%) = ${div(w.R)} 神`);
  const sim = { data, base: V.base ?? BASE, itemLevel: ILVL, targets: V.targets, start: "fractured", startPrice: w.R, sockets: 2, runePrice };
  const b = M.buildAutoModel({ sim, price });
  if (!b.ok) { console.log("  対応外:", b.reason.ja); continue; }
  const model = b.model;
  console.log(`  札 ${model.slots.length} (${model.slots.map((s) => s.id + (s.side ? "S" : "P")).join(" ")})、並べる行 ${model.keys.length}、ルーン代 (計算) ${div(model.runeCost)} 神 + アストリッド ${div(astrid)} 神 (計算には足して並べる)`);
  const name = (o) => o.map((k) => LABEL[k] ?? k).join(" → ");
  const t0 = Date.now();
  const all = perms(model.keys).map((o) => ({ o, r: M.solveOrder(model, o) }));
  all.sort((a, b) => a.r.perFinish - b.r.perFinish);
  console.log(`  値だけ ${all.length} 通り ${((Date.now() - t0) / 1000).toFixed(1)} 秒。上位 5: ${all.slice(0, 5).map((x) => `${name(x.o)} ${div(x.r.perFinish + astrid)}`).join(" | ")}`);
  const mcTop = all.slice(0, 5).map((x) => ({ ...x, mcr: M.solveOrder(model, x.o, { mc: 2000, seed: 11 }) })).sort((a, b) => a.mcr.perFinish - b.mcr.perFinish);
  console.log(`  mc 2,000 の並べ直し: ${mcTop.map((x) => `${name(x.o)} ${div(x.mcr.perFinish + astrid)} (完成 ${(x.mcr.finish * 100).toFixed(1)}%)`).join(" | ")}`);
  console.log(`  順番 | 計算 mc 2,000 (1 人・完成・1 個あたり、アストリッド込み) | エンジン ${N} 人 (1 人・完成・1 個あたり・半分の人・10 人に 9 人) | ずれ`);
  for (const x of mcTop.slice(0, TOP)) {
    const mc = M.orderDetail(model, x.o, { mc: 2000, seed: 3 });
    const quiz = rulesOf(model, mc, sim, M.quizFromSim({ ...sim, order: x.o }, null).recipe, astrid > 0);
    const e = engine(sim, x.o, quiz, N);
    const ePer = e.finish > 0 ? (model.R + e.cost) / e.finish - model.R : Infinity;
    const m = mc.result, mPer = (model.R + m.cost + astrid) / m.finish - model.R;
    console.log(`  ${name(x.o)}\n     計算 ${div(m.cost + astrid)}・${(m.finish * 100).toFixed(1)}%・${div(mPer)} | エンジン ${div(e.cost)}・${(e.finish * 100).toFixed(1)}%・${div(ePer)}・半分 ${div(e.median)}・9 割 ${div(e.p90)} (${e.sec.toFixed(0)} 秒、答え無し ${e.unans}・打ち止め ${e.gate}・打てない ${e.blocked}) | ずれ ${pct(m.cost + astrid, e.cost)} / ${pct(m.finish, e.finish)} / ${pct(mPer, ePer)}`);
    console.log(`     前半込み (R + 後半) ÷ 完成: エンジン ${div((model.R + e.cost) / e.finish)} 神`);
    // 打った物の内訳 (1 人あたりの回数、計算 mc 2,000 の通った手 vs エンジン)。費用の差の大きい順
    const cu = {};
    for (const v of mc.view) {
      if (!v.visits || v.act === "restart") continue;
      const a = M.quizActionOf(model, v.act);
      for (const k of [a.use, ...(a.omens ?? [])].filter(Boolean)) cu[k] = (cu[k] ?? 0) + v.visits / 2000;
      if (a.reveal) cu.reveal = (cu.reveal ?? 0) + v.visits / 2000;
    }
    const keys = [...new Set([...Object.keys(cu), ...Object.keys(e.uses)])].filter((k) => !k.startsWith("rune:"));
    const rows = keys.map((k) => ({ k, c: cu[k] ?? 0, e: e.uses[k] ?? 0, d: ((cu[k] ?? 0) - (e.uses[k] ?? 0)) * price(k) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    console.log(`     内訳 (計算 / エンジン 回、差 神): ${rows.slice(0, 6).map((r) => `${r.k} ${r.c.toFixed(2)} / ${r.e.toFixed(2)} (${(r.d / DIV).toFixed(1)})`).join(" | ")}`);
    if (e.why.length) console.log(`     止まった所: ${e.why.map(([k, n]) => `${n}× ${k}`).join(" | ")}`);
  }
}
