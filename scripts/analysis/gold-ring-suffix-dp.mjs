/**
 * gold-ring-suffix-dp.mjs — 金の指輪 (スペルダメージ T2 フラクチャー) のサフィックス 3 つ (レアリティ T1・キャストスピード T2+・全耐性 T2+) が揃うまでの
 * 「形ごとの最善の次の手と期待費用」を動的計画法で出す (解析君、2026-10-22、オーナー「どの形でも 3 MOD 揃うまでの最安値の期待費用」)。冒涜は入れない。
 * 結果は docs/org/math/notes/2026-10-22-gold-ring-suffix-dp.md
 *
 *   [K=200] [MAXS=600] node scripts/analysis/gold-ring-suffix-dp.mjs [N=3000] [SEED=1]
 *
 * 形 (key) = 狙いごとに 無し / 付いている / 低い段で埋まっている (外れだが系統をふさぐ) + 狙いの系統でない外れのサフィックスの数 + 非固定のプレフィックスの数 + 品質 20 の種類。
 * 1) 始めの形 (見本の始まり・オーナーのスナップの途中の形) から広げ、形ごとに代わりのアイテムを取っておく (形ごと 40 個まで)。
 * 2) 形 × 手ごとに、代わりのアイテムへ K 回エンジンで打ち (applyCurrency)、行き先の形の割合と 1 回の費用 (カタリスト代込み) を測る。
 * 3) 値の繰り返しで V(形) = min 手 [費用 + Σ 割合 × V(行き先)]。揃った形は 0。
 * 4) 確かめ: 出た打ち方 (形 → 手の表) でエンジンを N 人回し、計算の V と並べる (同じ物を 2 通りで出す突き合わせ、外の正解ではない)。
 * 近似: 同じ形の中の違い (外れの中身・段・MOD レベル) は代わりのアイテムの混ざり方で平均する。
 */
import { bundleEntry } from "../_bundle-ts.mjs";
import { costOf as costIn, mean, q } from "./_ev-common.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const N = Number(process.argv[2] ?? 3000);
const SEED = Number(process.argv[3] ?? 1);
const K = Number(process.env.K ?? 200);
const MAXS = Number(process.env.MAXS ?? 600);
const REPS = 40;
const data = M.loadPatch();

/** 自分のサーバーの /boot.json (2026-10-22 に取得、中の時刻 2026-10-21T17:00:49Z、高貴建て、神 = 807.07) */
const PRICES = {
  divine: 807.074, chaos: 82.021, chaos_greater: 241.852, chaos_perfect: 5922.686, annul: 347.359,
  exalt: 1, exalt_greater: 13.380, exalt_perfect: 2297.037,
  OmenofDextralExaltation: 28.895, OmenofCatalysingExaltation: 31.261, OmenofDextralAnnulment: 10673.080, OmenofSinistralAnnulment: 17175.992,
  OmenofDextralErasure: 10749.183, OmenofWhittling: 11035.036,
  catalyst_speed: 125.366, catalyst_cold: 15.305,
};
const costOf = (n) => costIn(n, PRICES);

const SD = data.mods.get("Rings/Special_genesis_tree_caster_SpellDamage");
const ID = { R: "Rings/ItemFoundRarityIncrease", C: "Rings/IncreasedCastSpeed", A: "Rings/AllResistances" };
const DOWN = { R: 1, C: 2, A: 2 };
const KEYS3 = ["R", "C", "A"];
const fam = (k) => data.mods.get(ID[k]).family;
const ofK = (k, m) => m.modId === ID[k] || m.family === fam(k);
const good = (k, m) => ofK(k, m) && m.tierIndex >= data.mods.get(m.modId).tiers.length - DOWN[k];

function keyOf(it) {
  const s = KEYS3.map((k) => (it.suffixes.some((m) => good(k, m)) ? "+" : it.suffixes.some((m) => ofK(k, m)) ? "x" : "-")).join("");
  const junkS = it.suffixes.filter((m) => !KEYS3.some((k) => ofK(k, m))).length;
  const freeP = it.prefixes.filter((m) => !m.fractured).length;
  const qt = it.quality >= 20 ? it.qualityTag ?? "" : "";
  return `${s}|j${junkS}|p${freeP}${qt ? `|q${qt}` : ""}`;
}
const isDone = (key) => key.startsWith("+++");

function fresh(rng) {
  const it = M.startFrom(data, "Gold Ring", 82, { rarity: "rare" }, Math.floor(rng() * 2 ** 31));
  return M.applyCurrency(data, M.withMod(it, { ...M.makeStageMod(SD, "prefix", SD.tiers.length - 2, rng), fractured: true }), "exalt", rng).item;
}
/** オーナーのスナップ (10-22): キャストスピード 19% (T2) + 外れのサフィックス 1 つ (器用 T3 で置く) */
function midway(rng) {
  const it = M.startFrom(data, "Gold Ring", 82, { rarity: "rare", mods: [{ mod: ID.C, tier: "T2" }, { mod: "Rings/Dexterity", tier: "T3" }] }, Math.floor(rng() * 2 ** 31));
  return M.withMod(it, { ...M.makeStageMod(SD, "prefix", SD.tiers.length - 2, rng), fractured: true });
}

/** 手 (冒涜は入れない)。cat = その種類のカタリストで品質 20 まで (足りない分だけ) → 触媒の高貴 + 右側の高貴 + 高貴 */
const ACTIONS = [
  { id: "chaos", steps: [["chaos", []]] },
  { id: "chaos_greater", steps: [["chaos_greater", []]] },
  { id: "chaos_perfect", steps: [["chaos_perfect", []]] },
  { id: "chaos+右側の抹消", steps: [["chaos", ["OmenofDextralErasure"]]] },
  { id: "chaos+削減", steps: [["chaos", ["OmenofWhittling"]]] },
  { id: "annul", steps: [["annul", []]] },
  { id: "annul+右側の消去", steps: [["annul", ["OmenofDextralAnnulment"]]] },
  { id: "annul+左側の消去", steps: [["annul", ["OmenofSinistralAnnulment"]]] },
  { id: "exalt+右側", steps: [["exalt", ["OmenofDextralExaltation"]]] },
  { id: "exalt_greater+右側", steps: [["exalt_greater", ["OmenofDextralExaltation"]]] },
  { id: "exalt_perfect+右側", steps: [["exalt_perfect", ["OmenofDextralExaltation"]]] },
  { id: "exalt_greater", steps: [["exalt_greater", []]] },
  ...["catalyst_speed", "catalyst_cold"].flatMap((cat) => ["exalt", "exalt_greater", "exalt_perfect"].map((orb) => ({ id: `${cat}+触媒+右側+${orb}`, cat, steps: [[orb, ["OmenofCatalysingExaltation", "OmenofDextralExaltation"]]] }))),
];

/** 手を打つ。打てなければ null。n に個数を足す */
function play(it, a, rng, n) {
  if (a.cat) {
    for (let i = 0; !(it.qualityTag === a.cat.slice(9) && it.quality >= 20); i++) {
      if (i > 40) return null;
      const r = M.applyCurrency(data, it, a.cat, rng, [], { oneCatalyst: true });
      if (!r.applied) return null;
      n[a.cat] = (n[a.cat] ?? 0) + 1;
      it = r.item;
    }
  }
  for (const [cur, omens] of a.steps) {
    const r = M.applyCurrency(data, it, cur, rng, omens);
    if (!r.applied) return null;
    n[cur] = (n[cur] ?? 0) + 1;
    for (const o of r.omensUsed ?? []) n[o] = (n[o] ?? 0) + 1;
    // お告げが効かなかった (使われなかった) 手は別の手と同じなので数えない
    if (omens.some((o) => !(r.omensUsed ?? []).includes(o))) return null;
    it = r.item;
  }
  return it;
}

// 見本の木の手 (tree-samples の gold-ring-suffix のサフィックス部分) と並べる
const TREE = (k) => {
  const s = k.split("|")[0];
  if (!s.includes("+")) return k.includes("|j0|p0") && s === "---" ? "exalt+右側" : "chaos"; // 狙い 0 → カオス (フラクチャーだけの時は打てないので高貴)
  if (/x/.test(s) || !k.includes("|j0")) return "annul"; // 外れ (系統の低い段も) → すぐ消去
  if (s === "+--") return "catalyst_speed+触媒+右側+exalt_perfect";
  if (s === "++-") return "catalyst_cold+触媒+右側+exalt_perfect";
  if (s === "+-+") return "catalyst_speed+触媒+右側+exalt_perfect";
  return "exalt_greater+右側"; // -+- / --+ / -++
};

/**
 * PROBE="形" [HANDS="手,手"]: その形のアイテムから 1 回だけ打ち、手ごとに 1 回の費用 (使った物の内訳) と行き先の形の割合を N 回で並べる。
 * 既定の手は木の手と全部の触媒の手。「なぜその手が安いか」の中身を見る用
 */
if (process.env.PROBE) {
  const want = process.env.PROBE;
  const r2 = M.mulberry32(SEED);
  const pool = [];
  for (let i = 0; pool.length < 200 && i < 2e6; i++) { const it = fresh(r2); if (keyOf(it) === want) pool.push(it); }
  if (!pool.length) { console.log(`${want} の形が作れない`); process.exit(1); }
  const hands = process.env.HANDS ? process.env.HANDS.split(",") : [TREE(want), ...ACTIONS.filter((a) => a.cat).map((a) => a.id)];
  for (const aid of [...new Set(hands)]) {
    const a = ACTIONS.find((x) => x.id === aid);
    const next = new Map(), used = {};
    let ok = 0, tot = 0;
    for (let i = 0; i < N; i++) {
      const n = {};
      const out = play(pool[i % pool.length], a, r2, n);
      if (!out) continue;
      ok++; tot += costOf(n);
      for (const [k, v] of Object.entries(n)) used[k] = (used[k] ?? 0) + v;
      const nk = keyOf(out).replace(/\|q.*$/, "");
      next.set(nk, (next.get(nk) ?? 0) + 1);
    }
    const top = [...next.entries()].sort((x, y) => y[1] - x[1]).map(([k, c]) => `${k} ${((100 * c) / ok).toFixed(1)}%`).join("・");
    console.log(`${aid}: 打てた ${ok}/${N}、1 回 ${(tot / ok).toFixed(3)} 神 (${Object.entries(used).map(([k, v]) => `${k} ${(v / ok).toFixed(2)}`).join(" ")})\n  行き先 ${top}`);
  }
  process.exit(0);
}

/**
 * OVR="形=手;形=手" (例 "+--|j0|p0=catalyst_cold+触媒+右側+exalt_greater"): 計算は飛ばし、木の手のうち書いた形だけ替えてエンジンで N 人 (同じ種 = 同じ乱数の並び)。
 * 木の手そのまま (OVR=none) と並べて、1 か所替えた差を直に測る
 */
if (process.env.OVR) {
  const ovr = new Map(process.env.OVR === "none" ? [] : process.env.OVR.split(";").map((x) => x.split("=")));
  for (const [nm, fn] of [["見本の始まり", fresh], ["スナップの形", midway]]) {
    const r2 = M.mulberry32(SEED);
    let tot = 0;
    for (let i = 0; i < N; i++) {
      let it = fn(r2);
      const n = {};
      for (let s = 0, k = keyOf(it); !isDone(k) && s < 20000; s++, k = keyOf(it)) {
        const a = ACTIONS.find((x) => x.id === (ovr.get(k) ?? TREE(k)));
        const nx = play(it, a, r2, n);
        if (nx) { it = nx; continue; }
        const r = M.applyCurrency(data, it, "chaos", r2);
        if (r.applied) { n.chaos = (n.chaos ?? 0) + 1; it = r.item; } else it = play(it, ACTIONS.find((x) => x.id === "exalt+右側"), r2, n) ?? it;
      }
      tot += costOf(n);
    }
    console.log(`OVR ${process.env.OVR} ${nm}: ${N} 人 1 個 ${(tot / N).toFixed(2)} 神`);
  }
  process.exit(0);
}

// 1) 2) 形を広げながら、形 × 手の行き先を測る
const t0 = Date.now();
const rng = M.mulberry32(SEED + 1000);
const reps = new Map();
const addRep = (it) => { const k = keyOf(it); const a = reps.get(k) ?? []; if (a.length < REPS) a.push(it); reps.set(k, a); return k; };
const queue = [];
for (let i = 0; i < REPS; i++) { const k1 = addRep(fresh(rng)), k2 = addRep(midway(rng)); if (i === 0) queue.push(k1, k2); }
for (const k of reps.keys()) if (!queue.includes(k)) queue.push(k);
const table = new Map(); // key → [{ a, cost, next: Map<key, p> }]
const seen = new Set(queue);
while (queue.length && table.size < MAXS) {
  const key = queue.shift();
  if (isDone(key)) { table.set(key, []); continue; }
  const rows = [];
  for (const a of ACTIONS) {
    const next = new Map();
    let cost = 0, ok = 0;
    for (let i = 0; i < K; i++) {
      const pool = reps.get(key);
      const it = pool[Math.floor(rng() * pool.length)];
      const n = {};
      const out = play(it, a, rng, n);
      if (!out) continue;
      ok++;
      cost += costOf(n);
      const nk = addRep(out);
      next.set(nk, (next.get(nk) ?? 0) + 1);
      if (!seen.has(nk)) { seen.add(nk); queue.push(nk); }
    }
    if (ok < K * 0.9) continue; // 打てない形が混ざる手は候補から外す
    for (const [k, c] of next) next.set(k, c / ok);
    rows.push({ a: a.id, cost: cost / ok, next });
  }
  table.set(key, rows);
}
console.log(`形 ${table.size} 個 (広げ残り ${queue.length})、${((Date.now() - t0) / 1000).toFixed(0)} 秒`);

// 3) 値の繰り返し
const V = new Map([...table.keys()].map((k) => [k, isDone(k) ? 0 : 1e4]));
const Vof = (k) => V.get(k) ?? 1e4; // 広げていない形は高く置く (使われたら下の確かめに出る)
let best = new Map();
for (let it = 0; it < 5000; it++) {
  let delta = 0;
  for (const [k, rows] of table) {
    if (isDone(k) || !rows.length) continue;
    let bv = Infinity, ba = null;
    for (const r of rows) {
      let v = r.cost;
      for (const [nk, p] of r.next) v += p * Vof(nk);
      if (v < bv) { bv = v; ba = r.a; }
    }
    delta = Math.max(delta, Math.abs(bv - Vof(k)));
    V.set(k, bv); best.set(k, ba);
  }
  if (delta < 1e-6) break;
}
const Q = (k, aid) => { const r = table.get(k)?.find((x) => x.a === aid); if (!r) return NaN; let v = r.cost; for (const [nk, p] of r.next) v += p * Vof(nk); return v; };

const startKeys = { 見本の始まり: keyOf(fresh(M.mulberry32(5))), スナップの形: keyOf(midway(M.mulberry32(5))) };
console.log(`\n始めの形: ${Object.entries(startKeys).map(([n, k]) => `${n} ${k} = ${Vof(k).toFixed(1)} 神 (最善の手 ${best.get(k)}、木の手 ${TREE(k)} なら ${Q(k, TREE(k)).toFixed(1)})`).join(" / ")}`);
console.log("\n形ごと (よく通る形から): 形 | 最善の手 | 期待費用 | 木の手 | 木の手の期待費用 | 差");
const visits = new Map();

// 4) 確かめ: 最善の打ち方 / 木の打ち方をエンジンで
function runPolicy(startFn, pick, seed) {
  const r2 = M.mulberry32(seed);
  const out = [];
  for (let i = 0; i < N; i++) {
    let it = startFn(r2);
    const n = {};
    let steps = 0, stuck = false;
    for (let k = keyOf(it); !isDone(k); k = keyOf(it)) {
      visits.set(k, (visits.get(k) ?? 0) + 1);
      if (++steps > 20000 || costOf(n) > 5000) { stuck = true; break; }
      const aid = pick(k);
      const a = ACTIONS.find((x) => x.id === aid) ?? ACTIONS[0];
      const nx = play(it, a, r2, n);
      if (!nx) { // 打てない時はカオス、それも打てない (フラクチャーだけ) 時は右側の高貴
        const r = M.applyCurrency(data, it, "chaos", r2);
        if (r.applied) { n.chaos = (n.chaos ?? 0) + 1; it = r.item; continue; }
        it = play(it, ACTIONS.find((x) => x.id === "exalt+右側"), r2, n) ?? it;
        continue;
      }
      it = nx;
    }
    out.push({ done: !stuck, cost: costOf(n) });
  }
  const done = out.filter((r) => r.done), costs = done.map((r) => r.cost).sort((a, b) => a - b);
  const m = mean(costs), se = Math.sqrt(mean(costs.map((c) => (c - m) ** 2)) / (costs.length || 1));
  return { per: out.reduce((a, r) => a + r.cost, 0) / (done.length || NaN), done: done.length / N, m, se, med: q(costs, 0.5), p90: q(costs, 0.9) };
}
const show = (name, r) => console.log(`  ${name}: エンジン ${N} 人 1 個 ${r.per.toFixed(1)} 神 (完成した人 ${r.m.toFixed(1)} ±${(1.96 * r.se).toFixed(1)}、完成 ${(100 * r.done).toFixed(1)}%、中央 ${r.med?.toFixed(1)}・90% ${r.p90?.toFixed(1)})`);
console.log("\n確かめ (エンジンで回す、打ち止め 5000 神):");
for (const [nm, fn] of [["見本の始まり", fresh], ["スナップの形", midway]]) {
  show(`${nm} 最善`, runPolicy(fn, (k) => best.get(k) ?? "chaos", SEED));
  show(`${nm} 木の手`, runPolicy(fn, TREE, SEED));
}
const rows = [...visits.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP ?? 40));
for (const [k, c] of rows) {
  const t = TREE(k), qv = Q(k, t), bv = Vof(k);
  console.log(`  ${k.padEnd(16)} ${String(best.get(k)).padEnd(34)} ${bv.toFixed(1).padStart(7)} | ${t.padEnd(34)} ${Number.isFinite(qv) ? qv.toFixed(1).padStart(7) : "  打てない"} | ${Number.isFinite(qv) ? (qv - bv).toFixed(1) : "-"}  (通った ${c})`);
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} 秒`);

// DIAG=1: (1) 木の手を計算の表の中で評価した値 (エンジンの木の手と比べる) (2) 最善の打ち方をエンジンで回した時の、形 × 手の実際の行き先と費用を計算の表と比べる
if (process.env.DIAG) {
  const Vt = new Map([...table.keys()].map((k) => [k, isDone(k) ? 0 : 0]));
  for (let it = 0; it < 20000; it++) {
    let d = 0;
    for (const [k, rows] of table) {
      if (isDone(k)) continue;
      const r = rows.find((x) => x.a === TREE(k)) ?? rows.find((x) => x.a === "chaos") ?? rows[0];
      if (!r) continue;
      let v = r.cost;
      for (const [nk, p] of r.next) v += p * (Vt.get(nk) ?? 1e4);
      d = Math.max(d, Math.abs(v - Vt.get(k))); Vt.set(k, v);
    }
    if (d < 1e-6) break;
  }
  console.log(`DIAG 木の手を計算の表で評価: 見本の始まり ${Vt.get(startKeys.見本の始まり).toFixed(1)} 神・スナップ ${Vt.get(startKeys.スナップの形).toFixed(1)} 神`);
  const emp = new Map();
  const r3 = M.mulberry32(SEED + 7);
  for (let i = 0; i < 200; i++) {
    let it = fresh(r3);
    for (let s = 0, k = keyOf(it); !isDone(k) && s < 5000; s++, k = keyOf(it)) {
      const aid = best.get(k) ?? "chaos";
      const n = {};
      const nx = play(it, ACTIONS.find((x) => x.id === aid), r3, n);
      if (!nx) break;
      const nk = keyOf(nx);
      const e = emp.get(`${k}@${aid}`) ?? { k, aid, cnt: 0, cost: 0, v: 0 };
      e.cnt++; e.cost += costOf(n); e.v += Vof(nk);
      emp.set(`${k}@${aid}`, e);
      it = nx;
    }
  }
  const out = [...emp.values()].map((e) => ({ ...e, empQ: (e.cost + e.v) / e.cnt, modelQ: Q(e.k, e.aid), costE: e.cost / e.cnt, costM: table.get(e.k)?.find((x) => x.a === e.aid)?.cost }));
  out.sort((a, b) => b.cnt * Math.abs(b.empQ - b.modelQ) - a.cnt * Math.abs(a.empQ - a.modelQ));
  for (const e of out.slice(0, 15)) console.log(`DIAG ${e.k} ${e.aid} 回数 ${e.cnt} 計算 Q ${e.modelQ.toFixed(1)} / エンジン ${e.empQ.toFixed(1)}  1 回の費用 計算 ${e.costM?.toFixed(3)} / エンジン ${e.costE.toFixed(3)}`);
}
