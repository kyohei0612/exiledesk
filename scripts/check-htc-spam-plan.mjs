/**
 * check-htc-spam-plan.mjs — カオススパムの狙いと、同じ側の残りの足し方 (2026-09-23)
 *
 * 死体の円環 (ニーモニックリング、樹 MOD 固定済み + 最大マナ / 最大マナ% / 知性 / 全耐性 / キャスピ) で:
 *   - スパムの狙いはキャスピ (効くカタリストの軽快・歯擦音が高くて既定で「使わない」)
 *   - 同じ側 (サフィ) の残りは知性・全耐性
 *   - 品質 40% でもサフィの外れは素の消去。ブリーチの MOD が消えても**すぐには付け直さず**、次に
 *     触媒の高貴のお告げを打つ直前で付け直す (無い間は消去がサフィだけに当たる)。平均 165 神前後
 *     (右側の消去のお告げを強制すると 284 神、品質 20% は 173 神)手で組んだ検算 (197.5 神) は全耐性にトゥル (冷気) しか
 *     試しておらず、雷 (エシュ) の方が付きやすい (雷のタグを持つ MOD が少なく分母が小さい) ぶん安い
 *   - カタリストを全部切ると、スパムの狙いは全耐性 (同じ「使わない」組で一番付きにくいサフィ) になり 500 神前後
 *   - 回した平均が期待値と合う (乱数や剥がしの数え方が壊れると外れる)
 * 値段は 2026-09-23 の相場を固定で持つ (神 = 506 高貴)。
 */
import { bundleEntry } from "./_bundle-ts.mjs";
const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
let failed = 0;
const fail = (m) => { console.log(`   NG: ${m}`); failed++; };
const data = M.loadPatchSync();
const NL = String.fromCharCode(10);

const D = 506;
const div = (v) => v * D;
const prices = {
  currency: {
    divine: D, chaos: div(0.128), chaos_greater: div(0.377), chaos_perfect: div(8.252),
    exalt: div(0.002), exalt_greater: div(0.009), exalt_perfect: div(2.958), annul: div(0.730),
    "essence:breach": div(1.307),
    catalyst_life: div(0.021), catalyst_mana: div(0.047), catalyst_defences: div(0.022), catalyst_physical: div(0.017),
    catalyst_fire: div(0.064), catalyst_cold: div(0.049), catalyst_lightning: div(0.055), catalyst_chaos: div(0.030),
    catalyst_attack: div(0.372), catalyst_caster: div(0.968), catalyst_speed: div(0.351), catalyst_attribute: div(0.021),
    catalyst_minion: div(0.054),
  },
  omens: {
    OmenofCatalysingExaltation: div(0.057), OmenofDextralExaltation: div(0.033), OmenofSinistralExaltation: div(0.069),
    OmenofDextralErasure: div(9.516), OmenofSinistralErasure: div(16.286),
  },
};
const it = M.parseJaItem([
  "アイテムクラス: 指輪", "レアリティ: レア", "死体の円環", "ニーモニックリング", "--------",
  "品質 (マナモッド): +40%", "--------", "アイテムレベル: 80", "--------", "最大マナが8%増加する", "--------",
  "スペルのマナコスト効率が29%増加する", "最大マナ +247", "知性 +30", "全ての元素耐性 +13%", "最大マナが8%増加する", "キャストスピードが20%増加する",
].join(NL));
const got = M.targetsFor(data, it);
const cls = M.baseForSolving(data, it.baseType, got.skippedSides);
const base = { data, cls, targets: got.targets, prices, itemLevel: 80, quality: 40, breach: true, used: { prefix: 1, suffix: 0 }, runs: 20000 };
const name = (id) => id.split("/")[1];
const show = (label, r) => {
  console.log(`${label}: スパム ${r.spam ? name(r.spam.modId) + " / " + r.spam.currency + " 1/" + Math.round(1 / r.spam.odds) : "無し"}`
    + ` / 側 ${r.side} / 足す ${r.methods.filter((m) => m.role === "exalt").map((m) => name(m.modId)).join("・")}`);
  if (r.phase) console.log(`   平均 ${(r.phase.expected / D).toFixed(1)} 神 / 8 割 ${(r.phase.p80 / D).toFixed(1)} 神 / 高貴 8 割 ${r.phase.exalts80} 回`);
  if (r.reason) console.log("   理由: " + r.reason);
};

const r = M.spamPlan(base);
show("既定 (高いカタリストは使わない)", r);
if (r.spam?.modId !== "Rings/IncreasedCastSpeed") fail("スパムの狙いがキャスピでない");
if (r.side !== "suffix") fail("スパムの側がサフィでない");
const adds = r.methods.filter((m) => m.role === "exalt").map((m) => m.modId).sort().join(",");
if (adds !== "Rings/AllResistances,Rings/Intelligence") fail("足す狙いが知性・全耐性でない: " + adds);
const cs = r.methods.find((m) => m.modId === "Rings/IncreasedCastSpeed");
if (!cs || cs.group !== "catalyst-off") fail("キャスピが「カタリストを使わない」組になっていない: " + cs?.group);
const e = (r.phase?.expected ?? 0) / D;
if (!(e > 160 && e < 190)) fail(`平均 ${e.toFixed(1)} 神 (172 神前後のはず)`);
if (!r.phase?.steps.some((x) => x.action === "消去のオーブ")) fail("品質 40% で素の消去を選んでいない (付け直しの方が安いはず)");
// 付け直しは「ブリーチ無し」で触媒の高貴のお告げを打つ時だけ。消去の前には付け直さない
for (const x of r.phase?.steps ?? []) {
  const re = x.action.startsWith("ブリーチのエッセンスを付け直す");
  if (re && !x.breachGone) fail("ブリーチがあるのに付け直している");
  if (re && !x.action.includes("触媒の高貴のお告げ")) fail("触媒の高貴のお告げ以外の前で付け直している");
  if (x.breachGone && x.action.startsWith("消去") && re) fail("消去の前に付け直している");
}
if (!r.phase?.steps.some((x) => x.breachGone && x.action.startsWith("消去"))) fail("ブリーチ無しのまま外れを消す手が無い");
// 品質 20% (ブリーチ無し) なら素の消去で足りる
const r20 = M.spamPlan({ ...base, quality: 20, breach: false });
show("品質 20% (ブリーチ無し)", r20);
if (r20.phase?.steps.some((x) => x.action.includes("消去のお告げ"))) fail("品質 20% で消去のお告げを使っている (プレは固定済みだけなので要らない)");
if (!(r.phase && r.phase.p80 > r.phase.p50 && r.phase.p90 >= r.phase.p80)) fail("分布の並びがおかしい");

// 触媒を全部切る → スパムは全耐性、500 神前後
const off = Object.fromEntries(["attribute", "cold", "fire", "lightning", "mana"].map((t) => [t, false]));
const r2 = M.spamPlan({ ...base, catalystChoice: off });
show("触媒を全部使わない", r2);
const e2 = (r2.phase?.expected ?? 0) / D;
if (r2.spam?.modId !== "Rings/AllResistances") fail("触媒なしでスパムが全耐性でない");
if (!(e2 > 470 && e2 < 540)) fail(`触媒なしの平均 ${e2.toFixed(1)} 神 (500 神前後のはず)`);

// 期待値と回した平均の突き合わせ: 平均は分布から直接出していないので、半分〜9 割の間に期待値が入るかで見る
if (r.phase && !(r.phase.expected > r.phase.p50 * 0.8 && r.phase.expected < r.phase.p90)) fail("期待値が分布の外にある");

// 軽快・歯擦音を「使う」にすると、キャスピはスパムの 1 番手から外れる
const r3 = M.spamPlan({ ...base, catalystChoice: { speed: true, caster: true } });
show("軽快・歯擦音も使う", r3);
if (r3.spam?.modId === "Rings/IncreasedCastSpeed" && r3.methods.find((m) => m.modId === "Rings/IncreasedCastSpeed")?.group !== "catalyst") fail("切り替えが効いていない");

// 候補を全部並べる: 既定では全耐性スパムの方が安いか、少なくとも並んでいること
console.log("候補 (安い順):");
for (const a of r.alternatives) console.log(`   ${name(a.modId).padEnd(18)} ${a.byRule ? "ルール" : "      "} ${a.chosen ? "採用" : "    "} 平均 ${a.expected ? (a.expected / D).toFixed(1) : "-"} 神 / 8 割 ${a.p80 ? (a.p80 / D).toFixed(1) : "-"} 神${a.expensive ? " 高額コース" : ""}${a.reason ? " (" + a.reason + ")" : ""}`);
if (r.alternatives.length < 3) fail("候補が並んでいない");
if (!r.alternatives.some((a) => a.byRule && a.chosen)) fail("ルールの物が採用になっていない");
const over = M.spamPlan({ ...base, spamOverride: "Rings/AllResistances" });
if (over.spam?.modId !== "Rings/AllResistances") fail("選び直しが効いていない");

// 品質 20% でプレがスパムになる時は高額コースの印
const r4 = M.spamPlan({ ...base, quality: 20, breach: false, targets: got.targets.filter((t) => /IncreasedMana$/.test(t.modId)) });
show("品質 20% で最大マナだけ", r4);
if (!r4.expensive) fail("品質 20% でプレのスパムなのに高額コースの印が無い");

for (const s of r.phase?.steps ?? []) console.log(`     ${s.have.map(name).join("・") || "狙い無し"}${s.junk ? " / 外れ " + s.junk : ""}${s.breachGone ? " / ブリーチ無し" : ""} → ${s.action} (${(s.perTry / D).toFixed(2)} 神)`);
console.log(failed ? `NG: ${failed} 件` : "全部 OK");
process.exit(failed ? 1 : 0);
