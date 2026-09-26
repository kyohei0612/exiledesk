/**
 * check-htc-sim-route.mjs — 作り方のツリーを回すシミュレーター (sim-route.ts, 2026-09-24)
 *
 * 死体の円環 (ニーモニックリング、品質 20%) に近い組み方を人が組んだとして回す:
 *   1. カオス / 狙い: キャスピ                                   → ○ 2、× 1
 *   2. 完全の高貴 + 右側 + 適応 / 狙い: 知性・全耐性、残す: キャスピ → ○ 4、× 3
 *   3. 消去 + 右側 / 残す: キャスピ、外れ無し                     → ○ 2、× 8 (キャスピが消えた)
 *   4. 完全の高貴 + 右側 + 適応 / 残す: キャスピ・知性・全耐性     → ○ 完成、× 5
 *   5. 消去 + 右側 / 残す: キャスピ、外れ無し                     → ○ 4、× 6
 *   6. 確認 / 残す: キャスピ                                      → ○ 7、× 8
 *   7. 消去 + 右側 / 残す: キャスピ、外れ無し                     → ○ 4、× 8
 *   8. 確認 / 外せる MOD 1 つ以下                                 → ○ 1、× 9 (スパムからやり直す前に剥がす)
 *   9. 消去                                                       → 8
 * 最後まで行けること、平均が有限で、予算内の確率が 0〜1、行き先が未設定の手で止まることを見る。
 */
import { bundleEntry } from "./_bundle-ts.mjs";
import { D, prices } from "./_htc-test-prices.mjs";
const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
let failed = 0;
const fail = (m) => { console.log(`   NG: ${m}`); failed++; };
const data = M.loadPatchSync();
const cls = M.itemBaseFor(data, "Mnemonic Ring");
const ctx = { data, cls, prices, itemLevel: 80, limits: { prefix: 3, suffix: 3 }, catalystOk: () => true };
const start = { breach: false, slots: [{ modId: null, side: "prefix", fixed: true, label: "樹 MOD" }, { modId: null, side: "suffix", fixed: false }] };
const CS = "Rings/IncreasedCastSpeed", INT = "Rings/Intelligence", RES = "Rings/AllResistances";
const ex = { kind: "exalt", tier: "exalt_perfect", side: "suffix", catalyst: "attribute" };
const an = { kind: "annul", side: "suffix" };
const nodes = [
  { id: "1", action: { kind: "chaos", tier: "chaos" }, targets: [{ modId: CS, minTier: 3 }], keep: [], clean: false, onHit: "2", onMiss: "1" },
  { id: "2", action: ex, targets: [{ modId: INT, minTier: 6 }, { modId: RES, minTier: 3 }], keep: [CS], clean: false, onHit: "4", onMiss: "3" },
  { id: "3", action: an, targets: [], keep: [CS], clean: true, onHit: "2", onMiss: "8" },
  { id: "4", action: ex, targets: [{ modId: INT, minTier: 6 }, { modId: RES, minTier: 3 }], keep: [CS, INT, RES], clean: false, onHit: "done", onMiss: "5" },
  { id: "5", action: an, targets: [], keep: [CS], clean: true, onHit: "4", onMiss: "6" },
  { id: "6", action: { kind: "check" }, targets: [], keep: [CS], clean: false, onHit: "7", onMiss: "8" },
  { id: "7", action: an, targets: [], keep: [CS], clean: true, onHit: "4", onMiss: "8" },
  { id: "8", action: { kind: "check" }, targets: [], keep: [], clean: false, maxMods: 1, onHit: "1", onMiss: "9" },
  { id: "9", action: { kind: "annul", side: null }, targets: [], keep: [], clean: false, onHit: "8", onMiss: "8" },
];
const r = M.simulateTree({ ctx, start, nodes, runs: 3000, budget: 300 * D });
console.log(`完成 ${(r.pDone * 100).toFixed(1)}% / 平均 ${(r.expected / D).toFixed(1)} 神 / 半分 ${(r.p50 / D).toFixed(1)} / 8 割 ${(r.p80 / D).toFixed(1)} / 300 神以内 ${(r.pBudget * 100).toFixed(1)}%`);
for (const p of r.perNode) console.log(`   手 ${p.id}: 平均 ${p.tries.toFixed(1)} 回 / ${(p.cost / D).toFixed(1)} 神`);
for (const x of r.stops) console.log(`   止まった: ${x.reason} ${(x.p * 100).toFixed(1)}%`);
if (!(r.pDone > 0.95)) fail("最後まで行けていない");
if (!(r.expected > 0 && Number.isFinite(r.expected))) fail("平均が出ていない");
if (!(r.pBudget >= 0 && r.pBudget <= r.pDone)) fail("予算内の確率がおかしい");
// 最初の手はカオス 1/79 前後
const h = M.simHelpers(ctx, nodes);
if (!(r.perNode[0].tries > 40)) fail("カオスの回数が少なすぎる");
// 使えるカレンシー: 枠が満杯なら高貴は打てない、外せる物が無ければ消去は打てない
const full = { breach: false, slots: [...start.slots, { modId: CS, side: "suffix", fixed: false }, { modId: INT, side: "suffix", fixed: false }] };
if (!h.usable(full, ex)) fail("サフィが満杯なのに右側の高貴が打てることになっている");
if (!h.usable({ breach: false, slots: [start.slots[0]] }, an)) fail("外せる物が無いのに消去が打てることになっている");
// 行き先が未設定なら止まる
const cut = M.simulateTree({ ctx, start, nodes: [{ ...nodes[0], onHit: null }], runs: 200 });
if (!(cut.pDone === 0 && cut.stops[0]?.reason.includes("未設定"))) fail("未設定の行き先で止まっていない");
// 自動の行き先 (オーナーの例): スパム → 触媒 1 回目 → 触媒 2 回目、外れたら右側の消去で「自動」
{
  const auto = [
    { id: "a1", action: { kind: "chaos", tier: "chaos" }, targets: [{ modId: CS, minTier: 3 }], keep: [], clean: false, onHit: "a2", onMiss: "a1" },
    { id: "a2", action: ex, targets: [{ modId: INT, minTier: 6 }, { modId: RES, minTier: 3 }], keep: [CS], clean: false, onHit: "a3", onMiss: "a4" },
    { id: "a3", action: ex, targets: [{ modId: INT, minTier: 6 }, { modId: RES, minTier: 3 }], keep: [CS, INT, RES], clean: false, onHit: "done", onMiss: "a4" },
    { id: "a4", action: an, targets: [], keep: [], clean: false, onHit: "auto", onMiss: "auto" },
  ];
  const ra = M.simulateTree({ ctx, start, nodes: auto, runs: 2000, budget: 300 * D });
  console.log(`自動: 完成 ${(ra.pDone * 100).toFixed(1)}% / 平均 ${(ra.expected / D).toFixed(1)} 神 / 8 割 ${(ra.p80 / D).toFixed(1)} 神 / 止まった ${ra.stops.map((x) => x.reason).join(", ") || "無し"}`);
  for (const p of ra.perNode) console.log(`   手 ${p.id}: 平均 ${p.tries.toFixed(1)} 回 / ${(p.cost / D).toFixed(1)} 神`);
  if (!(ra.pDone > 0.99)) fail("自動の行き先で最後まで行けていない");
}
// 消えたら終わりの MOD (keep、2026-09-24): サフィの樹 MOD を触らない作り方 (右側の高貴 + 右側の消去だけ) なら消えない。
// 側の無いカオスを打つと消えて止まる
{
  const kstart = { breach: false, slots: [{ modId: null, side: "prefix", fixed: false, keep: true, label: "樹 MOD (触らない)" }, { modId: null, side: "suffix", fixed: false }] };
  const safe = [
    { id: "k1", action: ex, targets: [{ modId: INT, minTier: 6 }], keep: [], clean: false, onHit: "done", onMiss: "k2" },
    { id: "k2", action: an, targets: [], keep: [], clean: false, onHit: "auto", onMiss: "auto" },
  ];
  const rs = M.simulateTree({ ctx, start: kstart, nodes: safe, runs: 1000 });
  const lost = (r) => r.stops.filter((x) => x.reason.includes("消えたら終わり")).reduce((a, x) => a + x.p, 0);
  console.log(`触らない MOD (右側だけで作る): 完成 ${(rs.pDone * 100).toFixed(1)}% / 消えた ${(lost(rs) * 100).toFixed(1)}%`);
  if (lost(rs) > 0) fail("右側だけで作っているのに、左の触らない MOD が消えた");
  if (!(rs.pDone > 0.99)) fail("右側だけで作って最後まで行けていない");
  const risky = [{ id: "c1", action: { kind: "chaos", tier: "chaos" }, targets: [{ modId: CS, minTier: 3 }], keep: [], clean: false, onHit: "done", onMiss: "c1" }];
  const rr = M.simulateTree({ ctx, start: kstart, nodes: risky, runs: 1000 });
  console.log(`触らない MOD (側の無いカオス): 完成 ${(rr.pDone * 100).toFixed(1)}% / 消えた ${(lost(rr) * 100).toFixed(1)}%`);
  if (!(lost(rr) > 0.2)) fail("側の無いカオスで触らない MOD が消えていない (消えたら止まるはず)");
}
// 側のお告げは効く時だけ払う (2026-09-26 オーナー承認)。効かない形では、お告げ有りと無しで値段も動き (同じ乱数で同じ結果) も同じ
{
  const O = (k) => prices.omens[k] ?? prices.currency[k];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const applySame = (st, a, b, tag) => {
    const ra = M.mulberry32(5), rb = M.mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const x = h.apply(st, { id: "x", action: a, targets: [], keep: [], clean: false, onHit: null, onMiss: null }, ra);
      const y = h.apply(st, { id: "x", action: b, targets: [], keep: [], clean: false, onHit: null, onMiss: null }, rb);
      if (!same(x, y)) { fail(`${tag}: お告げ有りと無しで打った結果が違う`); return; }
    }
  };
  // プレが満杯 (樹 MOD + 外れ 2 つ) → 右側の高貴なお告げは効かない
  const preFull = { breach: false, slots: [start.slots[0], { modId: null, side: "prefix", fixed: false, family: "IncreasedLife" }, { modId: null, side: "prefix", fixed: false }, { modId: CS, side: "suffix", fixed: false }] };
  const exS = { kind: "exalt", tier: "exalt_perfect", side: "suffix", catalyst: null }, ex0 = { ...exS, side: null };
  const pS = h.priceOf(preFull, exS), p0 = h.priceOf(preFull, ex0);
  console.log(`高貴 (プレ満杯): 右側のお告げ付き ${(pS / D).toFixed(3)} 神 / 無し ${(p0 / D).toFixed(3)} 神`);
  if (pS !== p0) fail("反対側が満杯なのに右側の高貴なお告げの代が掛かっている");
  applySame(preFull, exS, ex0, "高貴 (プレ満杯)");
  // 反対側に枠があれば払う
  const pOpen = h.priceOf(start, { ...exS, side: "prefix" }) - h.priceOf(start, { ...ex0 });
  if (Math.abs(pOpen - O("OmenofSinistralExaltation")) > 1e-9) fail("反対側に枠があるのに左側の高貴なお告げの代が掛かっていない");
  // 消去: 外せる物がサフィにしか無い → 右側の消去のお告げは効かない。両側にあれば払う
  const sufOnly = { breach: false, slots: [start.slots[0], { modId: null, side: "suffix", fixed: false }, { modId: CS, side: "suffix", fixed: false }] };
  const anS = { kind: "annul", side: "suffix" }, an0 = { kind: "annul", side: null };
  if (h.priceOf(sufOnly, anS) !== h.priceOf(sufOnly, an0)) fail("外せる物がサフィだけなのに右側の消去のお告げの代が掛かっている");
  applySame(sufOnly, anS, an0, "消去 (サフィだけ)");
  const both = { ...sufOnly, slots: [...sufOnly.slots, { modId: null, side: "prefix", fixed: false }] };
  if (Math.abs(h.priceOf(both, anS) - h.priceOf(both, an0) - O("OmenofDextralAnnulment")) > 1e-9) fail("両側に外せる物があるのに右側の消去のお告げの代が掛かっていない");
  // 抹消のお告げ付きのカオスも同じ
  const chS = { kind: "chaos", tier: "chaos", side: "suffix" }, ch0 = { kind: "chaos", tier: "chaos", side: null };
  if (h.priceOf(sufOnly, chS) !== h.priceOf(sufOnly, ch0)) fail("外せる物がサフィだけなのに抹消のお告げの代が掛かっている");
  applySame(sufOnly, chS, ch0, "カオス (サフィだけ)");
  if (!(h.priceOf(both, chS) > h.priceOf(both, ch0))) fail("両側に外せる物があるのに抹消のお告げの代が掛かっていない");
  // 冒涜: サフィに枠がありプレが満杯 → ネクロマンシーは効かない
  const de = { kind: "desecrate", side: "suffix", bone: "desecrate", echoes: false };
  if (h.omenNeeded({ ...preFull, slots: preFull.slots.slice(0, 3) }, de)) fail("プレが満杯なのに右側のネクロマンシーが要ることになっている");
  if (!h.omenNeeded(sufOnly, de)) fail("プレに枠があるのに右側のネクロマンシーが要らないことになっている");
  console.log("側のお告げ: 効かない形では代を取らない / 動きも同じ");
}
console.log(failed ? `NG: ${failed} 件` : "全部 OK");
process.exit(failed ? 1 : 0);
