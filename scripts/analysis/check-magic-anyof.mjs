/**
 * check-magic-anyof.mjs — ③ の白から作る「候補が 2 つ以上 (どれか 1 つ)」のマジックのループの式を、エンジンで打った結果と並べる (解析君、2026-10-22)
 *
 *   node scripts/analysis/check-magic-anyof.mjs [N=4000]
 *
 * 比べる物 (ジン部長の 2feac81f・emulator/notes/2026-10-22-sim-logic-to-engine.md の C の残り):
 *   式 A (今の start-cost)  = magicLoopCounts(pHit, null, share[1 つ目の候補の側])、高貴 × (1 − pHit)
 *   式 B (pAny に替えた物) = magicLoopCounts(pAny, null, share[同])、高貴 × (1 − pAny)
 *   式 C (両側にまたがる時の閉じた式) = 外れは側を問わず消すので MOD は常に 0 か 1 つ → 増強 = 消去 = (1 − pAny) ÷ pAny、高貴 1 (同じ側の時は式 A のまま)
 *   入口 spamCounts(…, [], { anyOf })  (300 人、種 20261020。シミュが仮の式から替える先)
 *   エンジン = spamCounts と同じ決まり (候補の側に当たりでない MOD があれば消去、無ければ増強) を applyCurrency で N 人。
 *     終わった時に MOD が 1 つだけの割合 (= 王者の後に高貴が要る割合) も数える
 * 見本 = 5 つのベース × 完全の増強で重い順の MOD (段は付く中で上から 2 つ目以上)。同じ側 2 つ・反対の側どうし・1 つ (比べの基準)。
 * 値段は check-sim-start.mjs の固定値 (式とエンジンで同じ値段なので、ずれは確率と手順の違いだけ)
 */
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_magic-anyof-entry.ts");
const N = Number(process.argv[2] ?? 4000);
const data = M.loadPatch();
const PRICES = { white: 50, transmute_perfect: 40, augment_perfect: 60, transmute_greater: 2, augment_greater: 3, transmute: 0.2, augment: 0.2, annul: 316.796, regal: 1.387, exalt: 1, desecrate: 131.981, fracture: 8166.06, divine: 696.93 };
const price = (k) => PRICES[k] ?? 0;
const IL = 82;
const side = (id) => M.sideOfMod(data, id);
const pct = (a, b) => `${a >= b ? "+" : ""}${(100 * (a / b - 1)).toFixed(1)}%`;

/** 1 回分の費用 (高貴建て) と 1 個 (フラクチャー済みまで、神) */
function cost(gr, lc, exaltN, fracP) {
  const once = price("white") + price(gr.tra) * lc.transmute + price(gr.aug) * lc.augment + price("annul") * lc.annul + price("regal") + price("exalt") * exaltN + price("desecrate") + price("fracture");
  return (once / fracP + 2 * price("annul")) / price("divine");
}

/** エンジン: spamCounts の増強の道と同じ決まりを 1 人ずつ。増強・消去・変成は 1 回分 (着くまで) の平均、one = 終わりに MOD が 1 つだけの割合 */
function engine(blank, gr, members) {
  const rng = M.mulberry32(20261022);
  const hit = (m) => !m.unrevealed && members.some((t) => t.modId === m.modId && m.tierIndex >= t.minTierIndex);
  const sides = [...new Set(members.map((t) => side(t.modId)))];
  const n = { transmute: 0, augment: 0, annul: 0 };
  let ones = 0, done = 0;
  for (let r = 0; r < N; r++) {
    let it = { ...blank, rarity: "normal" }, steps = 0;
    const use = (k, slot) => { const res = M.applyCurrency(data, it, k, rng); if (!res.applied) throw new Error(`${k}: ${res.reason}`); it = res.item; n[slot]++; steps++; };
    use(gr.tra, "transmute");
    while (steps < 3000 && ![...it.prefixes, ...it.suffixes].some(hit)) {
      const wrong = sides.some((s) => (s === "prefix" ? it.prefixes : it.suffixes).some((m) => !hit(m)));
      if (wrong) use("annul", "annul"); else use(gr.aug, "augment");
    }
    if ([...it.prefixes, ...it.suffixes].some(hit)) { done++; if (it.prefixes.length + it.suffixes.length === 1) ones++; }
  }
  return { transmute: n.transmute / done, augment: n.augment / done, annul: n.annul / done, one: ones / done, done: done / N };
}

function cases(baseName) {
  const white = M.startFrom(data, baseName, IL, { rarity: "normal" }, 1);
  const blank = M.blankWith(data, white, IL, "magic", []);
  const cands = M.addOddsBySpec(data, blank, "augment_perfect", []).cands;
  const top = (s) => cands.filter((c) => c.side === s && c.tiers.length).sort((a, b) => b.w - a.w).slice(0, 2)
    .map((c) => { const ix = c.tiers.map((t) => t.index).sort((a, b) => b - a); return { modId: c.mod.id, minTierIndex: ix[Math.min(1, ix.length - 1)] }; });
  const [p0, p1] = top("prefix"), [s0, s1] = top("suffix");
  return { blank, list: [["前 1 つ", [p0]], ["前 2 つ", [p0, p1]], ["後 2 つ", [s0, s1]], ["前 + 後", [p0, s0]], ["後 + 前", [s0, p0]]] };
}

const short = (id) => id.split("/").pop();
const rows = [];
for (const baseName of ["Intricate Gloves", "Sirenscale Gloves", "Vaal Greaves", "Drakeskin Boots", "Gold Ring"]) {
  const { blank, list } = cases(baseName);
  console.log(`\n=== ${baseName} (ilvl ${IL})`);
  for (const [label, members] of list) {
    const gr = M.addGradeFor(data, blank, members);
    const a = M.anyOfAddOdds(data, gr.odds, members);
    const fside = side(members[0].modId);
    const share = gr.odds.share[fside];
    const fracP = M.fractureOdds(data, blank, members);
    const A = M.magicLoopCounts(a.pHit, null, share);
    const B = M.magicLoopCounts(a.pAny, null, share);
    const two = new Set(members.map((t) => side(t.modId))).size > 1;
    const C = two ? { augment: (1 - a.pAny) / a.pAny, annul: (1 - a.pAny) / a.pAny } : A;
    const sc = M.spamCounts(data, { ...blank, rarity: "normal" }, "augment", gr.g, [], { anyOf: members, seed: 20261020 });
    const S = { transmute: (sc.uses[gr.tra] ?? 0) / sc.hitRate, augment: (sc.uses[gr.aug] ?? 0) / sc.hitRate, annul: (sc.uses.annul ?? 0) / sc.hitRate };
    const E = engine(blank, gr, members);
    const cE = cost(gr, E, E.one, fracP);
    const cA = cost(gr, { transmute: 1, ...A }, 1 - a.pHit, fracP);
    const cB = cost(gr, { transmute: 1, ...B }, 1 - a.pAny, fracP);
    const cS = cost(gr, S, E.one, fracP);
    const cC = cost(gr, { transmute: 1, ...C }, two ? 1 : 1 - a.pHit, fracP);
    rows.push({ baseName, label, cA: cA / cE - 1, cB: cB / cE - 1, cS: cS / cE - 1, cC: cC / cE - 1, augC: C.augment / E.augment - 1, augA: A.augment / E.augment - 1, augS: S.augment / E.augment - 1, two });
    console.log(`  ${label} [${members.map((t) => `${short(t.modId)}≥${t.minTierIndex}`).join(" | ")}] ${gr.ja}  pHit ${a.pHit.toFixed(4)}  pAny ${a.pAny.toFixed(4)} (÷ ${(a.pAny / a.pHit).toFixed(2)})  側の割合 ${share.toFixed(3)}  フラクチャー ${fracP.toFixed(3)}`);
    console.log(`    増強・消去 (変成の後)  エンジン ${E.augment.toFixed(2)}・${E.annul.toFixed(2)} (完成 ${(100 * E.done).toFixed(1)}%)  式 A ${A.augment.toFixed(2)}・${A.annul.toFixed(2)}  式 B ${B.augment.toFixed(2)}・${B.annul.toFixed(2)}  式 C ${C.augment.toFixed(2)}・${C.annul.toFixed(2)}  spamCounts ${S.augment.toFixed(2)}・${S.annul.toFixed(2)}`);
    console.log(`    MOD 1 つで終わる (高貴が要る)  エンジン ${E.one.toFixed(3)}  1 − pHit ${(1 - a.pHit).toFixed(3)}  1 − pAny ${(1 - a.pAny).toFixed(3)}`);
    console.log(`    1 個 (神)  エンジン ${cE.toFixed(2)}  式 A ${cA.toFixed(2)} (${pct(cA, cE)})  式 B ${cB.toFixed(2)} (${pct(cB, cE)})  式 C ${cC.toFixed(2)} (${pct(cC, cE)})  spamCounts ${cS.toFixed(2)} (${pct(cS, cE)})`);
  }
}
const worst = (k, f) => Math.max(...rows.filter(f).map((r) => Math.abs(r[k])));
console.log(`\n=== まとめ (1 個の費用のずれの最大、エンジン比)`);
for (const [name, f] of [["同じ側 (1 つ・2 つ)", (r) => !r.two], ["両側にまたがる", (r) => r.two]]) {
  console.log(`  ${name}: 式 A ${(100 * worst("cA", f)).toFixed(1)}%  式 B ${(100 * worst("cB", f)).toFixed(1)}%  式 C ${(100 * worst("cC", f)).toFixed(1)}%  spamCounts ${(100 * worst("cS", f)).toFixed(1)}%  (増強の回数 式 A ${(100 * worst("augA", f)).toFixed(1)}%・式 C ${(100 * worst("augC", f)).toFixed(1)}%・spamCounts ${(100 * worst("augS", f)).toFixed(1)}%)`);
}
