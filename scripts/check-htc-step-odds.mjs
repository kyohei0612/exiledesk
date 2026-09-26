/**
 * check-htc-step-odds.mjs — 1 手ずつ、次に作る MOD の打ち方と確率 (step-odds.ts, 2026-09-24)
 *
 * 死体の円環 (ニーモニックリング、品質 40%) の途中:
 *   樹 MOD (プレ、固定済み) + キャスピ + 全耐性 + ブリーチの MOD、次に知性を狙う
 * 同じ状態の手 (完全の高貴 + 右側の高貴なお告げ + 触媒 + 適応) が 19% (前のスパムの組み立てと同じ確率) になること。一番安い手が適応のカタリストの高貴であること (外れの消去込みの平均で並べる)。
 * 外れを消す手・カオス・エッセンス・冒涜も出ること。
 */
import { bundleEntry } from "./_bundle-ts.mjs";
import { D, prices } from "./_htc-test-prices.mjs";
const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
let failed = 0;
const fail = (m) => { console.log(`   NG: ${m}`); failed++; };
const data = M.loadPatchSync();
const cls = M.itemBaseFor(data, "Mnemonic Ring");
const h = M.stepHelpers({ data, cls, prices, itemLevel: 80, limits: { prefix: 3, suffix: 3 }, catalystOk: (tag) => (prices.currency[`catalyst_${tag}`] ?? Infinity) / D < 0.2 });
const state = { breach: true, slots: [
  { modId: null, side: "prefix", fixed: true, label: "樹 MOD" },
  { modId: "Rings/IncreasedCastSpeed", side: "suffix", fixed: false },
  { modId: "Rings/AllResistances", side: "suffix", fixed: false },
] };
const ms = h.methodsFor(state, "Rings/Intelligence", 6);
for (const m of ms.slice(0, 5)) console.log(`   ${m.label}: 1 回 ${(m.p * 100).toFixed(1)}% / ${(m.perTry / D).toFixed(2)} 神 / 平均 ${(m.avg / D).toFixed(1)} 神${m.note ? " / " + m.note : ""}`);
// 一番安い手はカタリスト (適応) を使う高貴。平均は外れの消去を込み (素の高貴が一番安く見えないこと)
const best = ms[0];
if (!best || best.kind !== "exalt" || !best.label.includes("適応")) fail("一番安い手が適応のカタリストの高貴になっていない: " + best?.label);
if (!(best?.loseRisk > 0)) fail("外れた後の消去で狙いが消える確率が出ていない");
// 同じ手 (完全 + 右側 + 適応) の確率は 19% (前のスパムの組み立てで出ていた値)
const same = ms.find((m) => m.label.startsWith("高貴なオーブ (完全) + 右側の高貴なお告げ + 触媒の高貴のお告げ + 適応"));
if (!same || Math.abs(same.p - 0.19) > 0.01) fail(`完全 + 適応の知性の確率が ${same ? (same.p * 100).toFixed(1) : "-"}% (19% のはず)`);
if (!ms.some((m) => m.kind === "chaos" && m.note)) fail("カオスの手 (付いた狙いが消えうる断り付き) が無い");
if (!ms.some((m) => m.kind === "desecrate")) fail("冒涜の手が無い");
// エッセンス: 最大マナ% はプレ。プレの外せる物はブリーチの MOD だけ
const es = h.methodsFor(state, "Rings/PerfectEssence_MaximumManaIncreasePercent", 0);
console.log(`エッセンス: ${es.map((m) => `${m.label} (${m.note ?? ""})`).join(" / ")}`);
if (es[0]?.kind !== "essence" || es[0].p !== 1) fail("パーフェクトエッセンスが確定の手になっていない");
// 外れを消す: サフィに外れを 1 つ足すと、右側の消去のお告げで 1/3
const s2 = { ...state, slots: [...state.slots, { modId: null, side: "suffix", fixed: false }] };
const cl = h.cleanups(s2);
console.log("外れを消す: " + cl.map((x) => `${x.label} ${(x.pJunk * 100).toFixed(0)}%`).join(" / "));
const dex = cl.find((x) => x.label.includes("右側"));
if (!dex || Math.abs(dex.pJunk - 1 / 3) > 1e-9) fail("右側の消去のお告げで外れが消える確率が 1/3 でない");
if (h.room(s2, "suffix")) fail("サフィ 3 つで枠が空いていることになっている");
if (h.methodsFor(s2, "Rings/Intelligence", 6).some((m) => m.kind === "exalt")) fail("枠が無いのに高貴の手が出ている");
console.log(failed ? `NG: ${failed} 件` : "全部 OK");
process.exit(failed ? 1 : 0);
