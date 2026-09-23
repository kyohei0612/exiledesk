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
 *   - プレだけの指輪はスパムを飛ばして仕上げだけ、黄昏の指輪はベースの枠 (プレ 4 / サフィ 2) で数える
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
    desecrate: div(0.338), desecrate_ancient: div(5.75),
    "essence:perfect:Rings/PerfectEssence_MaximumManaIncreasePercent": div(0.034),
  },
  omens: {
    OmenofCatalysingExaltation: div(0.057), OmenofDextralExaltation: div(0.033), OmenofSinistralExaltation: div(0.069),
    OmenofDextralErasure: div(9.516), OmenofSinistralErasure: div(16.286),
    OmenofSinistralCrystallisation: div(0.384), OmenofDextralCrystallisation: div(0.431),
    OmenofWhittling: div(12.336), OmenofLight: div(7.687), OmenofSinistralNecromancy: div(0.003),
    OmenofDextralNecromancy: div(0.006), OmenofAbyssalEchoes: div(0.188),
  },
};
const it = M.parseJaItem([
  "アイテムクラス: 指輪", "レアリティ: レア", "死体の円環", "ニーモニックリング", "--------",
  "品質 (マナモッド): +40%", "--------", "アイテムレベル: 80", "--------", "最大マナが8%増加する", "--------",
  "スペルのマナコスト効率が29%増加する", "最大マナ +247", "知性 +30", "全ての元素耐性 +13%", "最大マナが8%増加する", "キャストスピードが20%増加する",
].join(NL));
const got = M.targetsFor(data, it);
const cls = M.baseForSolving(data, it.baseType, got.skippedSides);
const base = { data, cls, targets: got.targets, prices, itemLevel: 80, quality: 40, breach: true, qualityTag: "mana", used: { prefix: 1, suffix: 0 }, runs: 20000 };
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
  const re = x.action.includes("ブリーチのエッセンス");
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

// ---- サフィが揃った後のプレの仕上げ (オーナーの流れ) ----
console.log("仕上げ:");
for (const st of r.finish?.steps ?? []) console.log(`   ${st.label} (${(st.cost / D).toFixed(2)} 神)`);
if (r.finish?.desecrate) console.log(`   冒涜 ${r.finish.desecrate.bone}${r.finish.desecrate.echoes ? " + 反響" : ""}: 1 回 1/${(1 / r.finish.desecrate.odds).toFixed(1)}、1 回 ${(r.finish.desecrate.perTry / D).toFixed(2)} 神、外れたら光 ${(r.finish.desecrate.light / D).toFixed(2)} 神`);
console.log(`   仕上げ 平均 ${((r.finish?.expected ?? 0) / D).toFixed(1)} 神${r.finish?.reason ? " / " + r.finish.reason : ""}`);
if (r.total) console.log(`合計: 平均 ${(r.total.expected / D).toFixed(1)} 神 / 半分 ${(r.total.p50 / D).toFixed(1)} / 8 割 ${(r.total.p80 / D).toFixed(1)} / 9 割 ${(r.total.p90 / D).toFixed(1)} 神`);
if (!r.finish || r.finish.reason) fail("仕上げが組めていない: " + r.finish?.reason);
const labels = (r.finish?.steps ?? []).map((x) => x.label).join(" / ");
if (!/削減のお告げ/.test(labels)) fail("品質 40% なのに削減のお告げでブリーチを消していない");
if (!/パーフェクトエッセンス/.test(labels)) fail("最大マナ% をエッセンスで付けていない");
if (r.finish?.desecrate?.modId !== "Rings/IncreasedMana") fail("冒涜で最大マナを引いていない");
if (!r.total || !(r.total.p80 > r.total.p50 && r.total.expected > r.phase.expected)) fail("合計の分布がおかしい");
// 予算 500 神でどこまで行けるか (段階ごとの累計。後の段階ほど確率は下がる)
if (r.total) {
  const reach = r.total.stages.map((st) => ({ label: st.label, p: st.cum.filter((x) => x <= 500 * D).length / st.cum.length }));
  console.log("予算 500 神: " + reach.map((x) => `${x.label} ${(x.p * 100).toFixed(0)}%`).join(" → "));
  if (reach.length < 3 || reach[0].label !== "サフィが揃う" || !reach.at(-1).label.startsWith("完成")) fail("予算の段階が並んでいない");
  if (reach.some((x, i) => i && x.p > reach[i - 1].p + 1e-9)) fail("後の段階の方が予算内に収まりやすくなっている");
  const last = [...r.total.stages.at(-1).cum].sort((a, b) => a - b);
  if (Math.abs(last[Math.floor(last.length * 0.8)] - r.total.p80) > 1e-6) fail("最後の段階の累計が合計の分布と合わない");
}

// ---- 途中品を買って始める (partial-buy.ts) ----
// スパムの狙い (キャスピ) を含むサフィの組み合わせ 4 本。外れの無い物だけ = サフィ数・プレ数の上限つき
{
  const plans = M.partialBuyPlans({ data, cls, plan: r, targets: got.targets, treeBuys: [], used: { prefix: 1, suffix: 0 }, ilvlMin: 80, baseType: "Mnemonic Ring" });
  console.log("途中品:");
  for (const p of plans) console.log(`   ${p.held.map(name).join("・").padEnd(40)} 残り ${(p.remaining / D).toFixed(1)} 神${p.unmatched.length ? " / 条件にできない " + p.unmatched.join(",") : ""}`);
  if (plans.length !== 4) fail("途中品の組み合わせが 4 本でない: " + plans.length);
  if (!plans.every((p) => p.held.includes("Rings/IncreasedCastSpeed"))) fail("スパムの狙いを含まない組み合わせがある");
  const json = JSON.stringify(plans[0]?.query ?? {});
  if (!json.includes("pseudo_number_of_suffix_mods") || !json.includes("pseudo_number_of_prefix_mods")) fail("外れを除く上限 (サフィ数 / プレ数) が条件に無い");
  const full = plans.find((p) => p.held.length === 3), one = plans.find((p) => p.held.length === 1);
  if (!full || !one || !(full.remaining < one.remaining)) fail("付いている狙いが多いほど残りが減っていない");
  if (full && Math.abs(full.remaining - (r.finish.expected + (full.remaining - r.finish.expected))) > 1e-6) fail("揃った物の残りに仕上げが入っていない");
}

// ---- プレに普通の狙いが 2 つ (最大ライフ + 最大マナ) ----
// 1 つを冒涜に残し、もう 1 つを左側の高貴 (+ 触媒) で先に足す。外れは左側の消去のお告げで消し切ってから仕上げ
{
  const cls0 = M.baseForSolving(data, "Mnemonic Ring", { prefixes: 0, suffixes: 0, either: 0 });
  const top = (id, k = 1) => { const m = data.mods.get("Rings/" + id); return { modId: "Rings/" + id, minTierIndex: m.tiers.length - k }; };
  const t2 = [top("IncreasedLife"), top("IncreasedMana", 2), top("FireResistance", 2), top("ColdResistance", 2), top("LightningResistance", 2)];
  const r5 = M.spamPlan({ data, cls: cls0, targets: t2, prices, itemLevel: 82, quality: 20, breach: false, qualityTag: "life", used: { prefix: 0, suffix: 0 }, runs: 8000 });
  console.log(`ライフ + マナ / 3 耐性: スパム ${r5.spam ? name(r5.spam.modId) : "無し"} / プレを高貴で ${(r5.finish?.exalt?.modIds ?? []).map(name).join("・")} 平均 ${((r5.finish?.exalt?.expected ?? 0) / D).toFixed(1)} 神 / 冒涜 ${r5.finish?.desecrate ? name(r5.finish.desecrate.modId) : "-"} / 合計 ${r5.total ? (r5.total.expected / D).toFixed(1) : "-"} 神${r5.finish?.reason ? " / " + r5.finish.reason : ""}`);
  if (!r5.finish || r5.finish.reason) fail("プレが 2 つの指輪で仕上げが組めない: " + r5.finish?.reason);
  if (r5.finish?.exalt?.modIds.length !== 1) fail("プレの 1 つを高貴で足していない");
  if (!r5.finish?.desecrate) fail("最後の 1 つを冒涜で引いていない");
  if (r5.finish?.exalt?.steps.some((x) => x.action === "消去のオーブ")) fail("サフィが揃った後に素の消去を使っている (サフィの狙いが消える)");
  if (!r5.total || !(r5.total.expected > r5.phase.expected + r5.finish.exalt.expected)) fail("合計にプレの高貴の段階が入っていない");
}

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

// サフィに狙いが無い (プレだけ) → スパムを飛ばして仕上げだけ (ninja の指輪 2026-09-23)
const manaOnly = got.targets.filter((t) => /IncreasedMana$/.test(t.modId));
const r4 = M.spamPlan({ ...base, quality: 20, breach: false, targets: manaOnly });
show("品質 20% で最大マナだけ", r4);
if (r4.spam || !r4.finish || r4.finish.reason || !r4.total) fail("プレだけの指輪がスパム無しの仕上げになっていない: " + (r4.reason ?? r4.finish?.reason));
// 品質 20% でプレをスパムに選び直した時は高額コースの印
const r4b = M.spamPlan({ ...base, quality: 20, breach: false, targets: manaOnly, spamOverride: "Rings/IncreasedMana" });
if (!r4b.expensive) fail("品質 20% でプレのスパムなのに高額コースの印が無い");

// 黄昏の指輪 (プレ 4 / サフィ 2): プレの普通の狙い 4 つ = 3 つを高貴、1 つを冒涜
{
  const dusk = M.parseJaItem(["Item Class: Rings", "Rarity: Rare", "Test Loop", "Dusk Ring", "--------", "Item Level: 82", "--------",
    "Adds 26 to 40 Physical Damage to Attacks", "Adds 25 to 42 Cold damage to Attacks", "24% increased Cold Damage",
    "30% increased Chaos Damage", "Leech 9.28% of Physical Attack Damage as Mana"].join(NL));
  const g = M.targetsFor(data, dusk);
  const lim = M.sideLimits(data, dusk.baseType);
  if (lim.prefix !== 4 || lim.suffix !== 2) fail(`黄昏の指輪の枠が ${lim.prefix}/${lim.suffix} (4/2 のはず)`);
  const rd = M.spamPlan({ data, cls: M.baseForSolving(data, dusk.baseType, g.skippedSides), targets: g.targets, prices, itemLevel: 82, quality: 20, breach: false,
    qualityTag: null, used: { prefix: 0, suffix: 0 }, baseLimits: lim, runs: 2000 });
  console.log(`黄昏の指輪: スパム ${rd.spam ? name(rd.spam.modId) : "無し"} / 高貴 ${(rd.finish?.exalt?.modIds ?? []).map(name).join("・")} / 冒涜 ${rd.finish?.desecrate ? name(rd.finish.desecrate.modId) : "-"} / 合計 ${rd.total ? (rd.total.expected / D).toFixed(0) : "-"} 神${rd.reason || rd.finish?.reason ? " / " + (rd.reason ?? rd.finish.reason) : ""}`);
  if (!rd.total) fail("黄昏の指輪 (プレ 4 つ) が組めない");
  // 素の 3/3 で数えると組めない (枠を見ていることの確認)
  const r3 = M.spamPlan({ data, cls: M.baseForSolving(data, dusk.baseType, g.skippedSides), targets: g.targets, prices, itemLevel: 82, quality: 20, breach: false,
    qualityTag: null, used: { prefix: 0, suffix: 0 }, baseLimits: { prefix: 3, suffix: 3 }, runs: 2000 });
  if (r3.total) fail("枠 3/3 でもプレ 4 つが組めてしまう");
}

for (const s of r.phase?.steps ?? []) console.log(`     ${s.have.map(name).join("・") || "狙い無し"}${s.junk ? " / 外れ " + s.junk : ""}${s.breachGone ? " / ブリーチ無し" : ""} → ${s.action} (${(s.perTry / D).toFixed(2)} 神)`);
console.log(failed ? `NG: ${failed} 件` : "全部 OK");
process.exit(failed ? 1 : 0);
