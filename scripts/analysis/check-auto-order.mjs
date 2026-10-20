/**
 * check-auto-order.mjs — ④ の「順番だけ自動」の計算 (src/services/simulator/auto/) を、⑤ の回し方 (エンジン) と並べる (解析君、2026-10-20)
 *
 *   node scripts/analysis/check-auto-order.mjs [gloves|boots|all] [N=1000] [TOP=3]
 *
 * 見本: やふやふ手袋 (マナ T1 固定、スピード・ES T3・投射物 +2・会心倍率 T3・攻撃速度 T3、前の試し plan5 の TIER=3 と同じ完成品)、
 *       靴 (移動速度を固定、耐性 T1 × 2・スピリット (完璧なエッセンス)・ドッジロール (冒涜))。
 * 1. 並べる行の順番を全部 solveOrder (値だけ) で数え、時間を測る
 * 2. 上位 TOP と、真ん中・一番下の順番について、計算の最善手を ⑤ の答えに書き、quizFromSim + runQuizOnce で N 人 (⑥ と同じ回し方)。
 *    計算 (値だけ・mc 2,000 人) とエンジンの 1 人の費用・完成の割合・完成 1 個あたりを並べ、ずれ % を出す
 * 3. シミュ部長の絞り方 (auto-order.ts の orderCandidates、n ≥ 6 で 24 通り) は見積もり (redo) が画面にしか無いので、
 *    ここでは「1 位が値だけの全部と mc 上位 5 の並べ直しで同じか」だけ見る
 * 値段は 10-21 の相場 (前の試しの dp-probe.json、神 = 718 高貴) で固定。取引所は叩かない
 */
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_auto-order-entry.ts");
const which = process.argv[2] ?? "all";
const N = Number(process.argv[3] ?? 1000);
const TOP = Number(process.argv[4] ?? 3);
const data = M.loadPatch();

const PRICES = {
  exalt: 1, exalt_greater: 17.759, exalt_perfect: 2167.68, chaos: 73.097, chaos_greater: 215.018, chaos_perfect: 5420.49, annul: 316.796,
  OmenofSinistralExaltation: 67.472, OmenofDextralExaltation: 32.287, OmenofGreaterExaltation: 10.088, OmenofSinistralErasure: 14334.5, OmenofDextralErasure: 9624.24,
  OmenofWhittling: 9467.96, OmenofSinistralAnnulment: 15105.1, OmenofDextralAnnulment: 9748.28, OmenofSinistralCrystallisation: 282.44, OmenofDextralCrystallisation: 269.06,
  desecrate: 131.981, desecrate_ancient: 6757.19, OmenofAbyssalEchoes: 51.247, OmenofLight: 6667.94, OmenofSinistralNecromancy: 3.219, OmenofDextralNecromancy: 5.116,
  fracture: 8166.06, regal: 1.387, reveal: 0, divine: 718.434,
  "rune:Kolr's Hunt": 838.48, "rune:Uhtred's Sidereus": 838.48,
  "essence:perfect:Gloves_int/PerfectEssence_CriticalStrikeMultiplier": 998.84, "essence:perfect:Gloves_int/PerfectEssence_SoulCore": 1219.68,
  "essence:perfect:Boots_str/PerfectEssence_BaseSpirit": 1219.68,
};
const DIV = PRICES.divine;
const price = (k) => PRICES[k] ?? 0;
const runePrice = (en) => price(`rune:${en}`);
const need = (id) => { const m = data.mods.get(id); if (!m) throw new Error("MOD が無い: " + id); return m; };
const top = (id) => need(id).tiers.length - 1;

function gloves() {
  const ID = (s) => `Gloves_int/${s}`;
  const MN = ID("IncreasedMana"), ES = ID("LocalEnergyShield"), SPD = ID("Rune_marksman_ProjectileSpeed"), PROJ = ID("Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level");
  const CRIT = ID("CriticalStrikeMultiplier"), AS = ID("IncreasedAttackSpeed");
  const t3 = (id) => Math.max(0, top(id) - 2);
  const targets = [
    { modId: MN, minTierIndex: top(MN), method: "fracture" },
    { modId: SPD, minTierIndex: 0, method: "desecrate" },
    { modId: ES, minTierIndex: t3(ES), method: "exalt" },
    { modId: PROJ, minTierIndex: t3(PROJ), method: "chaos" },
    { modId: CRIT, minTierIndex: t3(CRIT), method: "chaos" },
    { modId: AS, minTierIndex: t3(AS), method: "chaos" },
  ];
  const label = { [`mod:${SPD}`]: "スピード", [`mod:${ES}`]: "ES", [`mod:${PROJ}`]: "投射物", [`mod:${CRIT}`]: "会心倍率", [`mod:${AS}`]: "攻撃速度" };
  return { name: "手袋 (やふやふ、T3)", sim: { data, base: "Intricate Gloves", itemLevel: 82, targets, start: "fractured", startPrice: 69.1391642842024 * DIV, sockets: 2, runePrice }, label };
}
function boots() {
  const B = (s) => `Boots_str/${s}`;
  const MS = B("Rune_chronomancy_MovementVelocity"), DODGE = B("Rune_chronomancy_DodgeRoll"), SPIRIT = B("PerfectEssence_BaseSpirit");
  const RES = ["LightningResistance", "FireResistance", "ColdResistance"].map(B);
  const targets = [
    { modId: MS, minTierIndex: 2, method: "fracture" },
    { modId: RES[0], minTierIndex: top(RES[0]), method: "chaos", alts: RES.slice(1).map((id) => ({ modId: id, minTierIndex: top(id) })), need: 2 },
    { modId: SPIRIT, minTierIndex: 0, method: "essence" },
    { modId: DODGE, minTierIndex: 0, method: "desecrate" },
  ];
  const label = { [`mod:${RES[0]}`]: "耐性T1×2", [`mod:${SPIRIT}`]: "スピリット", [`mod:${DODGE}`]: "ドッジロール" };
  return { name: "靴 (移動速度を固定)", sim: { data, base: "Vaal Greaves", itemLevel: 82, targets, start: "fractured", startPrice: 30 * DIV, sockets: 2, runePrice }, label };
}

const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));
const div = (v) => (v / DIV).toFixed(1);
const pct = (a, b) => (b ? `${(((a - b) / b) * 100).toFixed(1)}%` : "-");

/** 計算の最善手を ⑤ の答えに (見えている形 → 状況の項目)。同じ状況になる形は通った回数の多い物 */
function rulesOf(model, det, sim, recipe0) {
  const goal = recipe0.routes[0].goal;
  const fracId = goal.find((s) => s.kind === "fractured").id;
  const K = model.slots.length;
  const st = recipe0.start;
  const have = new Set(st.runes ?? []);
  const runeAll = [...new Set(sim.targets.flatMap((t) => [t, ...(t.alts ?? [])]).map((t) => data.mods.get(t.modId)?.rune).filter(Boolean).map((r) => M.runeEnForId(r)).filter(Boolean))];
  const extra = runeAll.filter((en) => !have.has(en));
  const rules = extra.map((en, i) => ({ when: { aug: have.size + i }, do: { use: `rune:${en}` } }));
  const aug = have.size + extra.length;
  const best = new Map();
  for (const v of det.view) {
    const s = v.s, d = s[3 + K];
    const when = { aug, [fracId]: 3, "p.junk": s[1 + K], "s.junk": s[2 + K], "p.hid": d === 1 || d === 2 ? 1 : 0, "s.hid": d === 3 || d === 4 ? 1 : 0, "p.bad": d === 5 ? 1 : 0, "s.bad": d === 6 ? 1 : 0, des: d ? 1 : 0 };
    model.slots.forEach((sl, k) => { const x = s[1 + k], Mk = sl.members.length; when[sl.id] = x > Mk ? 2 : x > 0 ? 1 : 0; });
    const key = JSON.stringify(when);
    const e = best.get(key);
    if (e && e.visits >= v.visits) continue;
    best.set(key, { when, act: v.act, visits: v.visits });
  }
  // 発現で段の足りない狙いの MOD が出た時、計算は「外れの冒涜」(p.bad / s.bad) に数えるが、⑤ は「札が段の足りない状態 (1)・冒涜あり」に見える。
  // 外れの冒涜の形の答えを、その側の空いた札が 1 の見え方にも書く (同じ状況が既にあればそちら)
  for (const { when, act, visits } of [...best.values()]) {
    for (const [bad, side, junk] of [["p.bad", 0, "p.junk"], ["s.bad", 1, "s.junk"]]) {
      if (when[bad] !== 1) continue;
      model.slots.forEach((sl) => {
        if (sl.side !== side || when[sl.id] !== 0) return;
        const w = { ...when, [bad]: 0, [junk]: when[junk] - 1, [sl.id]: 1 };
        const key = JSON.stringify(w);
        if (!best.has(key)) best.set(key, { when: w, act, visits: -1 });
      });
    }
    void visits;
  }
  for (const { when, act } of best.values()) {
    if (Object.keys(model.slots).every((k) => when[model.slots[k].id] === 2)) continue;
    rules.push({ when, do: act === "restart" ? { restart: true } : M.quizActionOf(model, act) });
  }
  return { v: 3, rules: { main: rules } };
}

function engine(sim, order, quiz, n) {
  const { recipe, error } = M.quizFromSim({ ...sim, order }, quiz);
  if (error) throw new Error(error);
  let cost = 0, done = 0, unans = 0, gate = 0, blocked = 0;
  const why = {};
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const r = M.runQuizOnce(data, recipe, 900000 + i * 7919, { price, maxSteps: 400000 });
    if (r.stop?.kind === "unanswered") { unans++; const k = Object.entries(r.stop.situation).filter(([k]) => !["r", "cat", "n", "p.n", "s.n", "p.free", "s.free", "fx", "p.fx", "s.fx"].includes(k)).map(([k, v]) => `${k}=${v}`).join(","); why[k] = (why[k] ?? 0) + 1; continue; }
    if (r.stop?.kind === "gate") gate++;
    if (r.stop?.kind === "blocked") { blocked++; why["打てない " + r.stop.reason] = (why["打てない " + r.stop.reason] ?? 0) + 1; }
    cost += r.cost - recipe.start.price; if (r.done) done++;
  }
  const m = n - unans;
  return { cost: m ? cost / m : NaN, finish: m ? done / m : NaN, unans, gate, blocked, why: Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 3), sec: (Date.now() - t0) / 1000 };
}

for (const S of (which === "all" ? [gloves(), boots()] : which === "boots" ? [boots()] : [gloves()])) {
  console.log(`\n== ${S.name}`);
  const b = M.buildAutoModel({ sim: S.sim, price });
  if (!b.ok) { console.log("  対応外:", b.reason.ja); continue; }
  const model = b.model;
  console.log(`  札 ${model.slots.length} (${model.slots.map((s) => s.id + (s.side ? "S" : "P")).join(" ")})、並べる行 ${model.keys.length}、作り直し R ${div(model.R)} 神、ルーン代 ${div(model.runeCost)} 神`);
  const name = (o) => o.map((k) => S.label[k] ?? k).join(" → ");
  // 1. 値だけで全部
  const all = [];
  let tFirst = 0;
  const t0 = Date.now();
  for (const o of perms(model.keys)) {
    const det = M.orderDetail(model, o);
    if (!all.length) tFirst = det.result.ms;
    all.push({ o, det, r: det.result });
  }
  const tAll = Date.now() - t0;
  all.sort((a, b) => a.r.perFinish - b.r.perFinish);
  const ms = all.map((x) => x.r.ms).sort((a, b) => a - b);
  console.log(`  時間: ${all.length} 通り ${(tAll / 1000).toFixed(2)} 秒 (1 つ目 ${tFirst} ms = 行き先の表を作る分込み、2 つ目から 中央 ${ms[ms.length >> 1]} ms・最大 ${ms[ms.length - 1]} ms)、形 見えている ${all[0].det.size.view}・本当 ${all[0].det.size.true}`);
  console.log(`  方策の手が打てない形 ${all.reduce((a, x) => a + x.det.bad, 0)}、止まる形のある順番 ${all.filter((x) => x.det.stuck).length}`);
  // mc 上位 5 の並べ直し
  const mcTop = all.slice(0, 5).map((x) => ({ ...x, mcr: M.solveOrder(model, x.o, { mc: 2000, seed: 11 }) })).sort((a, b) => a.mcr.perFinish - b.mcr.perFinish);
  console.log(`  1 位 (値だけ) ${name(all[0].o)} / mc 上位 5 の並べ直しの 1 位 ${name(mcTop[0].o)}${all[0].o.join() === mcTop[0].o.join() ? " (同じ)" : " (違う)"}`);
  // 2. エンジンと並べる
  const pick = [...all.slice(0, TOP), all[all.length >> 1], all[all.length - 1]].filter((x, i, a) => a.indexOf(x) === i);
  console.log(`  順番 | 計算 値だけ (1 人・完成・1 個あたり) | 計算 mc 2,000 | エンジン ${N} 人 | ずれ (1 人の費用 / 完成 / 1 個あたり、mc とエンジン)`);
  for (const x of pick) {
    const mc = M.orderDetail(model, x.o, { mc: 2000, seed: 3 });
    const quiz = rulesOf(model, mc, S.sim, M.quizFromSim({ ...S.sim, order: x.o }, null).recipe);
    const e = engine(S.sim, x.o, quiz, N);
    const ePer = e.finish > 0 ? (model.R + e.cost) / e.finish - model.R : Infinity;
    const m = mc.result;
    console.log(`  #${all.indexOf(x) + 1} ${name(x.o)}\n     値だけ ${div(x.r.cost)} 神・${(x.r.finish * 100).toFixed(1)}%・${div(x.r.perFinish)} | mc ${div(m.cost)}・${(m.finish * 100).toFixed(1)}%・${div(m.perFinish)} | エンジン ${div(e.cost)}・${(e.finish * 100).toFixed(1)}%・${div(ePer)} (${e.sec.toFixed(0)} 秒、答え無し ${e.unans}・打ち止め ${e.gate}・打てない ${e.blocked}) | ずれ ${pct(m.cost, e.cost)} / ${pct(m.finish, e.finish)} / ${pct(m.perFinish, ePer)}・値だけの 1 個あたり ${pct(x.r.perFinish, ePer)}`);
    if (e.why.length) console.log(`     止まった所: ${e.why.map(([k, v]) => `${v}× ${k}`).join(" | ")}`);
  }
}
