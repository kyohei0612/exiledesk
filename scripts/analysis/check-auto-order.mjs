/**
 * check-auto-order.mjs — ④ の「順番だけ自動」の計算 (src/services/simulator/auto/) を、⑤ の回し方 (エンジン) と並べる (解析君、2026-10-20)
 *
 *   node scripts/analysis/check-auto-order.mjs [gloves|boots|white|split|greater|ring|all] [N=1000] [TOP=3]
 *
 * 見本: やふやふ手袋 (マナ T1 固定、スピード・ES T3・投射物 +2・会心倍率 T3・攻撃速度 T3、前の試し plan5 の TIER=3 と同じ完成品)、
 *       靴 (移動速度を固定、耐性 T1 × 2・スピリット (完璧なエッセンス)・ドッジロール (冒涜))。
 * 1. 並べる行の順番を全部 solveOrder (値だけ) で数え、時間を測る
 * 2. 上位 TOP と、真ん中・一番下の順番について、計算の最善手を ⑤ の答えに書き (src の auto-rules: rulesFromDetail、答えの無い状況は 300 人 × 最大 3 回 answerFor で足す)、
 *    quizFromSim + runQuizOnce で N 人 (⑥ と同じ回し方)。付け方 (methodsFromDetail) も出す。
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
  "rune:Kolr's Hunt": 838.48, "rune:Uhtred's Sidereus": 838.48, "rune:Astrid's Creativity": 9.7 * 718.434,
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
  return { name: "靴 (移動速度を固定)", sim: { data, base: "Vaal Greaves", itemLevel: 82, targets, start: "fractured", startPrice: Number(process.env.BOOTS_R ?? 30) * DIV, sockets: 2, runePrice }, label };
}

/** 白からマジックで反対側の狙い (会心倍率) と一緒に揃える道 (③ の keep が together の時に画面が渡す greater: { essKey: null, keep }、K3) */
function glovesWhite() {
  const g = gloves();
  const keep = g.sim.targets.find((t) => t.modId.endsWith("/CriticalStrikeMultiplier"));
  return { ...g, name: "手袋 (白から・会心倍率をマジックで一緒に)", sim: { ...g.sim, greater: { essKey: null, keep } } };
}

/** 両側の「どれか」(K6): 手袋で ES (プレ) か攻撃速度 (サフィ) のどれか 1 つを高貴で。⑤ は route が prefix / suffix の 2 つ */
function glovesSplit() {
  const g = gloves();
  const ES = g.sim.targets.find((t) => t.modId.endsWith("/LocalEnergyShield")), AS = g.sim.targets.find((t) => t.modId.endsWith("/IncreasedAttackSpeed"));
  const targets = g.sim.targets.filter((t) => t !== AS).map((t) => (t === ES ? { ...ES, alts: [{ modId: AS.modId, minTierIndex: AS.minTierIndex }] } : t));
  return { ...g, name: "手袋 (ES か攻撃速度のどれか)", sim: { ...g.sim, targets } };
}

/** グレーターエッセンスの道 (K8、範囲 C): 動画の靴 S-7YHuq3-P4 (quiz-samples の boots-chrono) の形。移動速度 T3 以上を固定・耐性 T1 を残す MOD・
 * 絢爛 (グレーターのレアリティ) でレアに → 壁 → 固定、⑤ でドッジ (冒涜)・スピリット (完璧なエッセンス) */
function bootsGreater() {
  const B = (s) => `Boots_str/${s}`;
  const MS = B("Rune_chronomancy_MovementVelocity"), DODGE = B("Rune_chronomancy_DodgeRoll"), SPIRIT = B("PerfectEssence_BaseSpirit"), RAR = B("Essence_ItemFoundRarityIncrease");
  const RES = ["LightningResistance", "FireResistance", "ColdResistance"].map(B);
  const rarTier = data.mods.get(RAR).tiers.findIndex((t) => /^Greater/.test(String(t.name ?? "")));
  const res = { modId: RES[0], minTierIndex: top(RES[0]), method: "chaos", alts: RES.slice(1).map((id) => ({ modId: id, minTierIndex: top(id) })) };
  const rar = { modId: RAR, minTierIndex: Math.max(0, rarTier), method: "essence" };
  const targets = [{ modId: MS, minTierIndex: 2, method: "fracture" }, res, rar, { modId: SPIRIT, minTierIndex: 0, method: "essence" }, { modId: DODGE, minTierIndex: 0, method: "desecrate" }];
  const label = { [`mod:${RES[0]}`]: "耐性T1", [`mod:${SPIRIT}`]: "スピリット", [`mod:${DODGE}`]: "ドッジロール", [`mod:${RAR}`]: "絢爛" };
  return { name: "靴 (グレーターの道、絢爛)", sim: { data, base: "Vaal Greaves", itemLevel: 82, targets, start: "fractured", startPrice: Number(process.env.BOOTS_R ?? 30) * DIV, sockets: 2, runePrice, greater: { essKey: `essence:greater:${RAR}`, keep: res } }, label };
}

/** 鉄の指輪 (オーナーの貼り付けの見本 6、docs/org/emulator/notes/paste-samples/6.txt): 貼り付けの読み取りで ② の狙いを作り、雷ダメージ (付加) をフラクチャーに (シミュ部長の S3 の見本と同じ形) */
async function ring() {
  const fs = await import("node:fs");
  const text = fs.readFileSync("docs/org/emulator/notes/paste-samples/6.txt", "utf8");
  const r = M.readPaste(data, text);
  const it = r.item;
  const targets = r.targets.map((t) => (/LightningDamage/i.test(t.modId) && data.mods.get(t.modId)?.type === "prefix" && !r.targets.some((u) => u !== t && u.method === "fracture") && /Local|Attack|Added|Physical|Lightning/.test(t.modId) ? { ...t, method: "fracture" } : t));
  const frac = targets.find((t) => t.method === "fracture");
  const withMethod = targets.map((t) => (t.method ? t : { ...t, method: M.methodsFor(data, t.modId)[0] }));
  const label = Object.fromEntries(withMethod.map((t) => [`mod:${t.modId}`, t.modId.split("/").pop()]));
  return { name: `鉄の指輪 (貼り付け 6、フラクチャー ${frac?.modId ?? "なし"})`, sim: { data, base: it.base?.en ?? "Iron Ring", itemLevel: it.itemLevel ?? 61, targets: withMethod, start: "fractured", startPrice: Number(process.env.RING_R ?? 20) * DIV, runePrice }, label };
}

const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));
const div = (v) => (v / DIV).toFixed(1);
const pct = (a, b) => (b ? `${(((a - b) / b) * 100).toFixed(1)}%` : "-");

function engine(sim, order, quiz, n) {
  const { recipe, error } = M.quizFromSim({ ...sim, order }, quiz);
  if (error) throw new Error(error);
  let cost = 0, done = 0, unans = 0, gate = 0, blocked = 0;
  const rebuy = [];
  const why = {};
  const open = new Map();
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const r = M.runQuizOnce(data, recipe, 900000 + i * 7919, { price, maxSteps: 400000 });
    if (r.stop?.kind === "unanswered") { unans++; const sk = r.stop.route + JSON.stringify(r.stop.situation); if (!open.has(sk)) open.set(sk, { route: r.stop.route, sit: r.stop.situation }); const k = Object.entries(r.stop.situation).filter(([k]) => !["r", "cat", "n", "p.n", "s.n", "p.free", "s.free", "fx", "p.fx", "s.fx"].includes(k)).map(([k, v]) => `${k}=${v}`).join(","); why[k] = (why[k] ?? 0) + 1; continue; }
    if (r.stop?.kind === "gate") { gate++; why["打ち止め " + r.stop.reason] = (why["打ち止め " + r.stop.reason] ?? 0) + 1; }
    if (r.stop?.kind === "blocked") { blocked++; why["打てない " + r.stop.reason] = (why["打てない " + r.stop.reason] ?? 0) + 1; }
    cost += r.cost - recipe.start.price; if (r.done) done++;
    rebuy.push(r.bases - 1);
  }
  const m = n - unans;
  rebuy.sort((a, b) => a - b);
  const q = (p) => (rebuy.length ? rebuy[Math.min(rebuy.length - 1, Math.floor(rebuy.length * p))] : 0);
  return { rebuy: { p50: q(0.5), p90: q(0.9), p99: q(0.99), max: rebuy[rebuy.length - 1] ?? 0 }, open: [...open.values()], cost: m ? cost / m : NaN, finish: m ? done / m : NaN, unans, gate, blocked, why: Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 3), sec: (Date.now() - t0) / 1000 };
}

for (const S of (which === "ring" ? [await ring()] : which === "all" ? [gloves(), boots(), glovesWhite(), glovesSplit(), bootsGreater()] : which === "boots" ? [boots()] : which === "white" ? [glovesWhite()] : which === "split" ? [glovesSplit()] : which === "greater" ? [bootsGreater()] : [gloves()])) {
  console.log(`\n== ${S.name}`);
  const b = M.buildAutoModel({ sim: S.sim, price });
  if (!b.ok) { console.log("  対応外:", b.reason.ja); continue; }
  const model = b.model;
  if (process.env.SHOW_STARTS) console.log("  始めの形:", model.starts.map(([p, st]) => `${(p * 100).toFixed(1)}% [${st.join(",")}]`).join(" "), model.slots.map((sl) => sl.id + ":" + sl.members.map((m) => m.modId.split("/")[1]).join("/")).join(" "));
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
    // 自動の答え (auto-rules の rulesFromDetail)。300 人回して答えの無い状況に answerFor の答えを足す (最大 3 回、設計 3-1 の穴埋め)
    const recipe0 = M.quizFromSim({ ...S.sim, order: x.o }, null).recipe;
    // route ごとの答え (両側のどれかが無ければ main だけ。mc は上の mc と同じ種)
    const { quiz, details } = M.rulesForOrder(model, x.o, recipe0, { mc: 2000, seed: 3 });
    let added = 0, left = 0;
    for (let round = 0; round < 3; round++) {
      const pre = engine(S.sim, x.o, quiz, 300);
      if (!pre.open.length) break;
      left = 0;
      for (const { route, sit } of pre.open) { const dd = details[route]; const r = dd && M.answerFor(dd.model, dd.detail, recipe0, sit, route); if (r) { quiz.rules[route].push(r); added++; } else left++; }
      if (!added) break;
    }
    const e = engine(S.sim, x.o, quiz, N);
    const meth = M.methodsFromDetail(model, mc).map((y) => `${y.slot} ${y.method ?? "-"}${y.method ? ` ${(y.share * 100).toFixed(0)}%` : ""}`).join("・");
    const ePer = e.finish > 0 ? (model.R + e.cost) / e.finish - model.R : Infinity;
    const m = mc.result;
    console.log(`  #${all.indexOf(x) + 1} ${name(x.o)}\n     値だけ ${div(x.r.cost)} 神・${(x.r.finish * 100).toFixed(1)}%・${div(x.r.perFinish)} | mc ${div(m.cost)}・${(m.finish * 100).toFixed(1)}%・${div(m.perFinish)} | エンジン ${div(e.cost)}・${(e.finish * 100).toFixed(1)}%・${div(ePer)} (${e.sec.toFixed(0)} 秒、答え無し ${e.unans}・打ち止め ${e.gate}・打てない ${e.blocked}) | ずれ ${pct(m.cost, e.cost)} / ${pct(m.finish, e.finish)} / ${pct(m.perFinish, ePer)}・値だけの 1 個あたり ${pct(x.r.perFinish, ePer)}`);
    console.log(`     自動の答え ${Object.entries(quiz.rules).map(([k, v]) => `${k} ${v.length}`).join("・")} (穴埋めで足した ${added}・答えられなかった状況 ${left})、付け方 ${meth}、1 割以内: ${Math.abs(m.perFinish - ePer) <= 0.1 * ePer ? "はい" : "いいえ"}`);
    console.log(`     買い直しの回数 (1 人、答えのある人): 中央 ${e.rebuy.p50}・90% ${e.rebuy.p90}・99% ${e.rebuy.p99}・最大 ${e.rebuy.max}`);
    if (e.why.length) console.log(`     止まった所: ${e.why.map(([k, v]) => `${v}× ${k}`).join(" | ")}`);
  }
}
