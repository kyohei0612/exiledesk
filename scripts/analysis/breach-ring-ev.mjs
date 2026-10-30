/**
 * breach-ring-ev.mjs — ブリーチの指輪 (Breach Ring、Lv40、暗黙「品質の最大値 +20%」) と 金の指輪 (Gold Ring) を、品質で伸びる値と
 * 「耐性 T1 を 2 つ + ライフ T1」を揃える費用で比べる (解析係、2026-10-31、記事編集長の頼み = ブログ breach-ring (11-12))。
 * 結果は docs/org/math/notes/2026-10-31-breach-ring.md
 *
 *   TABLE=1 node scripts/analysis/breach-ring-ev.mjs                 … 品質 0 / 20 / 40 / 45% の値の表 (エンジンの boostedMod)・どのカタリストが効くか・ふつうの指輪の何段目と同じか
 *   PROBE=1 node scripts/analysis/breach-ring-ev.mjs [K=100000] [SEED=1] … 品質の上限・候補が同じか・品質を上げるカタリストの数・品質が消える手・触媒の高貴 1 回で耐性が付く割合
 *   [BUDGET=0] node scripts/analysis/breach-ring-ev.mjs [N=2000] [SEED=1] [打ち方,…=exalt,cat,chaos] [ベース,…=breach,gold]
 *
 * ベース: ブリーチの指輪 / 金の指輪 (比べに 洗練されたブリーチリング = refined)。ilvl 82、ベースの代金は 0 (取引所のベースの値段の差は見ていない)。
 * 狙い:
 *   サフィ = 火・冷気・雷の単体耐性 T1 (Rings/{Fire,Cold,Lightning}Resistance の一番上の段 41–45%、MOD レベル 82) を 2 つ (元素は何でも)
 *   プレ   = 最大ライフ T1 (Rings/IncreasedLife の一番上の段 +100–119、MOD レベル 54)
 *   同じ系統の低い段は外れ。ほかの MOD は何でもよい。
 * 打ち方 (状態だけで決まる):
 *   exalt = 錬金 → ライフが無くプレに空き → 左側の高貴のお告げ + 上級の高貴 / 耐性 T1 が 2 つ無くサフィに空き → 右側の高貴のお告げ + 上級の高貴 /
 *           どちらも空きが無い → 消去 (お告げ無し)。品質はずっと 0、最後に仕上げの品質を載せる。
 *   cat   = exalt と同じ順だが、高貴のたびにカタリストで品質を上限まで上げて 触媒の高貴のお告げ を重ねる (品質は使い切る、E-32)。
 *           ライフ = 肉体のカタリスト、耐性 = まだ T1 が無く系統も空いている元素のうち一番安いカタリスト (ゾフ < エシュ < トゥル)。
 *   chaos = 錬金 → カオスだけ。
 *   仕上げ (どの打ち方も): 持っている耐性 T1 の元素のうち一番安いカタリストで品質を上限 (金 20 / ブリーチ 40 / 洗練 45) まで上げる。
 * カタリスト 1 個の品質: エンジンの既定 (+1% か +2% の等分、other-specs.ts の CATALYST の owner 欄)。ONE=1 で 1 個 +1% (費用の安全側、QUALITY_PER_CATALYST)。
 * 値段: data-cache/boot/boot-2026-10-22.json (自分のサーバーの /boot.json の写し、2026-10-22T04:00Z、Forbidden Rites、高貴建て)。
 */
import fs from "node:fs";
import { bundleEntry } from "../_bundle-ts.mjs";
import { costOf as costWith, counter, headLine, mean, summarize } from "./_ev-common.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const C = await bundleEntry("src/services/craft-stage/stage-core.ts");
const Q = await bundleEntry("src/services/htc/quality.ts");
const data = M.loadPatch();
const N = Number(process.argv[2] ?? 2000);
const SEED = Number(process.argv[3] ?? 1);
const WAYS = (process.argv[4] ?? "exalt,cat,chaos").split(",");
const BASES = { breach: "Breach Ring", gold: "Gold Ring", refined: "Refined Breach Ring" };
const JA = { "Breach Ring": "ブリーチの指輪", "Gold Ring": "金の指輪", "Refined Breach Ring": "洗練されたブリーチリング" };
const PICK = (process.argv[5] ?? "breach,gold").split(",");
const BUDGET = Number(process.env.BUDGET ?? 0);
const ONE = process.env.ONE === "1";
const LIMIT = Number(process.env.LIMIT ?? 2000000);

const BOOT = process.env.BOOT ?? "data-cache/boot/boot-2026-10-22.json";
const ROW = new Map(JSON.parse(fs.readFileSync(BOOT, "utf8")).market.items.map((x) => [x.Text, x.CurrentPrice]));
const EN = {
  alchemy: "Orb of Alchemy", chaos: "Chaos Orb", annul: "Orb of Annulment", exalt_greater: "Greater Exalted Orb", divine: "Divine Orb",
  OmenofDextralExaltation: "Omen of Dextral Exaltation", OmenofSinistralExaltation: "Omen of Sinistral Exaltation", OmenofCatalysingExaltation: "Omen of Catalysing Exaltation",
  catalyst_fire: "Xoph's Catalyst", catalyst_cold: "Tul's Catalyst", catalyst_lightning: "Esh's Catalyst", catalyst_life: "Flesh Catalyst", catalyst_chaos: "Chayula's Catalyst",
  breach_ess: "Essence of the Breach",
};
const PRICES = Object.fromEntries(Object.entries(EN).map(([k, en]) => {
  const p = ROW.get(en);
  if (!(p > 0)) throw new Error(`値段が無い: ${en}`);
  return [k, p];
}));
const costOf = (n) => costWith(n, PRICES);
const div = (ex) => ex / PRICES.divine;

const LIFE = "Rings/IncreasedLife";
const RES = { fire: "Rings/FireResistance", cold: "Rings/ColdResistance", lightning: "Rings/LightningResistance" };
const top = (id) => data.mods.get(id).tiers.length - 1;
/** AIM=t2: 狙いを「耐性 T2 以上 2 つ + ライフ T2 以上」に緩める (ブリーチ 40% の T2 = 金 20% の T1 と同じ幅か見るため)。PROBE / TABLE は T1 のまま */
const AIM = process.env.AIM ?? "t1";
const LOW = AIM === "t2" ? 1 : 0;
const isLife = (m) => m.modId === LIFE && m.tierIndex >= top(LIFE) - LOW;
const resT1 = (it) => Object.entries(RES).filter(([, id]) => it.suffixes.some((m) => m.modId === id && m.tierIndex >= top(id) - LOW)).map(([el]) => el);
const resFamilyTaken = (it, el) => it.suffixes.some((m) => m.modId === RES[el]);
const hasLife = (it) => it.prefixes.some(isLife);
const done = (it) => hasLife(it) && resT1(it).length >= 2;
const BY_PRICE = Object.keys(RES).sort((a, b) => PRICES[`catalyst_${a}`] - PRICES[`catalyst_${b}`]);

const start = (base, rng) => M.startFrom(data, base, 82, {}, Math.floor(rng() * 2 ** 31));
const hint = ONE ? { oneCatalyst: true } : {};

/** カタリストで品質を上限まで上げる (使った数を n に)。上限はエンジン (maxQualityOf) */
function fill(it, tag, rng, n) {
  const key = `catalyst_${tag}`;
  for (let k = 0; k < 200; k++) {
    const r = M.applyCurrency(data, it, key, rng, [], hint);
    if (!r.applied) break;
    n[key] = (n[key] ?? 0) + 1;
    it = r.item;
  }
  return it;
}

/** レアの枠。空にしたレアに左側 / 右側の高貴を打って付いた数を数える (台本に決め打ちしない) */
function capOf(it) {
  const out = {};
  for (const [side, omen] of [["prefix", "OmenofSinistralExaltation"], ["suffix", "OmenofDextralExaltation"]]) {
    let x = { ...it, rarity: "rare", prefixes: [], suffixes: [] }, k = 0;
    const rng = M.mulberry32(1);
    for (; k < 6; k++) { const r = M.applyCurrency(data, x, "exalt", rng, [omen]); if (!r.applied) break; x = r.item; }
    out[side] = k;
  }
  return out;
}

function nextMove(way, it, cap) {
  if (done(it)) return null;
  if (way === "chaos") return "chaos";
  if (!hasLife(it) && it.prefixes.length < cap.prefix) return "exaltP";
  if (resT1(it).length < 2 && it.suffixes.length < cap.suffix) return "exaltS";
  return "annul";
}

function runOne(way, base, rng) {
  let it = start(base, rng);
  const n = {};
  const apply = counter(M, data, n);
  const use = (cur, omens = []) => { it = apply(it, cur, rng, omens).item; };
  use("alchemy");
  const cap = capOf(it);
  let steps = 0, lostLife = 0, lostRes = 0;
  for (let mv = nextMove(way, it, cap); mv; mv = nextMove(way, it, cap)) {
    if (++steps > LIMIT || (BUDGET > 0 && costOf(n) > BUDGET)) return { done: false, n, it };
    const hL = hasLife(it), hR = resT1(it).length;
    if (mv === "chaos") use("chaos");
    else if (mv === "annul") use("annul");
    else if (way === "cat") {
      const tag = mv === "exaltP" ? "life" : BY_PRICE.find((el) => !resFamilyTaken(it, el)) ?? BY_PRICE[0];
      it = fill(it, tag, rng, n);
      use("exalt_greater", ["OmenofCatalysingExaltation", mv === "exaltP" ? "OmenofSinistralExaltation" : "OmenofDextralExaltation"]);
    } else use("exalt_greater", [mv === "exaltP" ? "OmenofSinistralExaltation" : "OmenofDextralExaltation"]);
    if (hL && !hasLife(it)) lostLife++;
    if (resT1(it).length < hR) lostRes++;
  }
  // 仕上げ: 持っている耐性 T1 の元素のうち一番安いカタリストで上限まで
  const fin = {};
  const finTag = BY_PRICE.find((el) => resT1(it).includes(el));
  const q0 = it.qualityTag === finTag ? it.quality : 0;
  it = fill(it, finTag, rng, fin);
  for (const [k, v] of Object.entries(fin)) n[k] = (n[k] ?? 0) + v;
  return { done: true, n, it, lostLife, lostRes, fin: costOf(fin), finCount: Object.values(fin).reduce((a, b) => a + b, 0), q0, finTag };
}

/** エンジンで MOD の値を盛る (stage-core の boostedMod = 品質の種類のタグを持つ MOD に displayedValue の切り捨て) */
function shown(base, id, side, ti, v, q, tag) {
  const mod = { ...M.makeStageMod(data.mods.get(id), side, ti, M.mulberry32(1)), values: [v] };
  const it0 = M.startFrom(data, base, 82, {}, 1);
  const it = { ...it0, rarity: "rare", quality: q, qualityTag: tag, prefixes: side === "prefix" ? [mod] : [], suffixes: side === "suffix" ? [mod] : [] };
  const b = C.boostedMod(it, mod, data);
  return b ? b.values[0] : v;
}

if (process.env.TABLE) {
  const ROWS = [
    ["火耐性", RES.fire, "suffix", "fire"], ["冷気耐性", RES.cold, "suffix", "cold"], ["雷耐性", RES.lightning, "suffix", "lightning"],
    ["混沌耐性", "Rings/ChaosResistance", "suffix", "chaos"], ["全元素耐性", "Rings/AllResistances", "suffix", "fire"],
    ["最大ライフ", LIFE, "prefix", "life"], ["最大マナ", "Rings/IncreasedMana", "prefix", "mana"], ["キャストスピード", "Rings/IncreasedCastSpeed", "suffix", "speed"],
    ["知性", "Rings/Intelligence", "suffix", "attribute"], ["レアリティ (サフィ)", "Rings/ItemFoundRarityIncrease", "suffix", null],
  ];
  // (1) どのカタリストが効くか: 13 種を全部 40% で掛けて、伸びるかをエンジンに聞く
  console.log("## どのカタリストで伸びるか (ブリーチの指輪・品質 40%、エンジンの boostedMod で一番上の段の上限が伸びるか)");
  for (const [ja, id, side] of ROWS) {
    const ti = top(id), v = data.mods.get(id).tiers[ti].ranges[0][1];
    const ok = M.CATALYSTS.filter((c) => shown(BASES.breach, id, side, ti, v, 40, c.tag) !== v).map((c) => `${c.ja} (${c.tag})`);
    console.log(`  ${ja} (${id}、タグ ${JSON.stringify(data.mods.get(id).tags)}): ${ok.join("・") || "無し"}`);
  }
  // (2) 段ごとの値 (下限・上限)
  console.log("\n## 段ごとの値 (素 → 品質 20 / 40 / 45%、切り捨て込み。T1 が一番上)");
  for (const [ja, id, side, tag] of ROWS) {
    const ts = data.mods.get(id).tiers;
    console.log(`\n### ${ja} (${id})`);
    for (let ti = ts.length - 1; ti >= 0; ti--) {
      const [lo, hi] = ts[ti].ranges[0];
      const at = (q) => `${shown(BASES.breach, id, side, ti, lo, q, tag)}–${shown(BASES.breach, id, side, ti, hi, q, tag)}`;
      // 手で displayedValue と照らす
      const hand = (q) => `${Q.displayedValue(lo, q)}–${Q.displayedValue(hi, q)}`;
      const same = !tag || [20, 40, 45].every((q) => at(q) === hand(q));
      console.log(`  T${ts.length - ti} (MOD Lv ${ts[ti].ilvl}, 重み ${ts[ti].weight}): 素 ${lo}–${hi} / 20% ${at(20)} / 40% ${at(40)} / 45% ${at(45)}${same ? "" : `  (手の式と違う: ${hand(20)} / ${hand(40)})`}`);
    }
  }
  // (3) ブリーチ 40% の段 ↔ 金 20% / 金 0% の段
  console.log("\n## ブリーチの指輪 40% の各段は、金の指輪 (20%・0%) の何段目と同じか (幅の重なりで)");
  for (const [ja, id, side, tag] of ROWS.filter((r) => r[3])) {
    const ts = data.mods.get(id).tiers, L = ts.length;
    const rng = (base, ti, q) => [shown(base, id, side, ti, ts[ti].ranges[0][0], q, tag), shown(base, id, side, ti, ts[ti].ranges[0][1], q, tag)];
    const lines = [];
    for (let ti = L - 1; ti >= Math.max(0, L - 4); ti--) {
      const [a, b] = rng(BASES.breach, ti, 40);
      const near = (q) => {
        const hits = [];
        for (let tj = L - 1; tj >= 0; tj--) { const [c, d] = rng(BASES.gold, tj, q); if (a <= d && c <= b) hits.push(`T${L - tj} ${c}–${d}`); }
        const [c1, d1] = rng(BASES.gold, L - 1, q);
        return hits.length ? hits.join("・") : a > d1 ? `T1 (${c1}–${d1}) より上` : "無し";
      };
      lines.push(`ブリーチ T${L - ti} @40% ${a}–${b} ↔ 金 @20% ${near(20)} / 金 @0% ${near(0)}`);
    }
    console.log(`  ${ja}:\n    ${lines.join("\n    ")}`);
  }
  process.exit(0);
}

if (process.env.PROBE) {
  const K = Number(process.argv[2] ?? 100000);
  const rng = M.mulberry32(SEED);
  // (1) 上限・候補・枠・暗黙
  const sig = {};
  for (const [key, base] of Object.entries(BASES)) {
    const it = start(base, rng);
    const a = M.applyCurrency(data, it, "alchemy", rng).item;
    const cs = M.candidates(data, { ...a, prefixes: [], suffixes: [] }, ["prefix", "suffix"], 0, {});
    sig[key] = cs.map((c) => `${c.side}:${c.mod.id}:${c.tiers.map((t) => `${t.index}/${t.w}`).join(",")}`).sort().join("|");
    const imp = (M.htcBaseInfo()[base]?.implicits ?? []).map((i) => i.ja ?? i.en).join(" / ") || "無し";
    console.log(`${JA[base]} (${base}): 品質の上限 ${M.maxQualityOf(it)}%・候補 ${cs.length} 系統・重み ${cs.reduce((x, c) => x + c.w, 0)}・枠 ${JSON.stringify(capOf(a))}・暗黙 ${imp}`);
  }
  console.log(`候補 (系統・段・重み) が金の指輪と同じ: ${Object.keys(BASES).map((k) => `${k} ${sig[k] === sig.gold}`).join("  ")}`);
  // (2) カタリストの数 (0 → 上限)
  for (const base of Object.values(BASES)) for (const one of [false, true]) {
    let tot = 0;
    const R = 20000;
    for (let i = 0; i < R; i++) {
      let it = M.applyCurrency(data, start(base, rng), "alchemy", rng).item;
      for (let k = 0; k < 200; k++) { const r = M.applyCurrency(data, it, "catalyst_fire", rng, [], one ? { oneCatalyst: true } : {}); if (!r.applied) break; it = r.item; tot++; }
    }
    const c = tot / R;
    console.log(`  ${JA[base]} 品質 0 → 上限: ゾフのカタリスト 平均 ${c.toFixed(2)} 個 (${one ? "1 個 +1%" : "1 個 +1% か +2%"}) = ${div(c * PRICES.catalyst_fire).toFixed(3)} 神 (トゥル ${div(c * PRICES.catalyst_cold).toFixed(3)}・エシュ ${div(c * PRICES.catalyst_lightning).toFixed(3)}・肉体 ${div(c * PRICES.catalyst_life).toFixed(3)})`);
  }
  // (3) 品質が消える手 (品質 40% の火のブリーチの指輪に打つ)
  const rare = () => {
    let it = M.applyCurrency(data, start(BASES.breach, rng), "alchemy", rng).item;
    it = M.applyCurrency(data, it, "qset:40:fire", rng).item;
    return { ...it, prefixes: it.prefixes.slice(0, 1), suffixes: it.suffixes.slice(0, 1) };
  };
  for (const [label, cur, om] of [["カオス", "chaos", []], ["消去", "annul", []], ["高貴", "exalt", []], ["上級の高貴 + 右側の高貴", "exalt_greater", ["OmenofDextralExaltation"]],
    ["上級の高貴 + 触媒の高貴 + 右側の高貴", "exalt_greater", ["OmenofCatalysingExaltation", "OmenofDextralExaltation"]], ["神のオーブ", "divine", []], ["トゥルのカタリスト (種類を変える)", "catalyst_cold", []], ["ゾフのカタリスト (同じ種類・上限)", "catalyst_fire", []]]) {
    const it = rare();
    const r = M.applyCurrency(data, it, cur, rng, om);
    console.log(`  品質 40% (火) に ${label}: ${r.applied ? `品質 ${r.item.quality}% (${r.item.qualityTag})` : `打てない (${r.reason})`}`);
  }
  // (4) 1 回で耐性が付く割合 (プレ 1 つ・サフィ 0 のレア)。触媒の高貴 + 右側の高貴 + 上級の高貴、ゾフ (火) の品質 0 / 20 / 40 / 45
  const sfx = (q) => {
    const total = M.candidates(data, (() => { const it = M.applyCurrency(data, start(BASES.breach, rng), "alchemy", rng).item; return { ...it, prefixes: [], suffixes: [] }; })(), ["suffix"], M.orbFloor("exalt", "greater"), {});
    return total;
  };
  const cs = sfx();
  const W = cs.reduce((a, c) => a + c.w, 0);
  const t1 = (id) => cs.find((c) => c.mod.id === id)?.tiers.filter((t) => t.index === top(id)).reduce((a, t) => a + t.w, 0) ?? 0;
  console.log(`  上級の高貴の下限 ${M.orbFloor("exalt", "greater")}: サフィの重み ${W}、火耐性 T1 ${t1(RES.fire)} (${(100 * t1(RES.fire) / W).toFixed(2)}%)・火耐性の系統 ${cs.find((c) => c.mod.id === RES.fire).w}`);
  for (const q of [0, 20, 40, 45]) {
    let anyFire = 0, fireT1 = 0, anyT1 = 0;
    for (let i = 0; i < K; i++) {
      let it = M.applyCurrency(data, start(q === 45 ? BASES.refined : BASES.breach, rng), "alchemy", rng).item;
      it = { ...it, prefixes: [], suffixes: [] };
      if (q > 0) it = M.applyCurrency(data, it, `qset:${q}:fire`, rng).item;
      const r = M.applyCurrency(data, it, "exalt_greater", rng, q > 0 ? ["OmenofCatalysingExaltation", "OmenofDextralExaltation"] : ["OmenofDextralExaltation"]);
      const s = r.item.suffixes[0];
      if (s?.modId === RES.fire) { anyFire++; if (s.tierIndex === top(RES.fire)) fireT1++; }
      if (s && Object.values(RES).includes(s.modId) && s.tierIndex === top(s.modId)) anyT1++;
    }
    const p = (x) => `${(100 * x / K).toFixed(2)}%`;
    console.log(`  品質 ${q}% (火) で 右側の高貴${q ? " + 触媒の高貴" : ""} + 上級の高貴 1 回: 火耐性 ${p(anyFire)}・火耐性 T1 ${p(fireT1)}・どれかの単体耐性 T1 ${p(anyT1)}`);
  }
  // ライフ T1 (プレ)
  for (const q of [0, 20, 40]) {
    let hit = 0;
    for (let i = 0; i < K; i++) {
      let it = M.applyCurrency(data, start(BASES.breach, rng), "alchemy", rng).item;
      it = { ...it, prefixes: [], suffixes: [] };
      if (q > 0) it = M.applyCurrency(data, it, `qset:${q}:life`, rng).item;
      const r = M.applyCurrency(data, it, "exalt_greater", rng, q > 0 ? ["OmenofCatalysingExaltation", "OmenofSinistralExaltation"] : ["OmenofSinistralExaltation"]);
      if (r.item.prefixes.some(isLife)) hit++;
    }
    console.log(`  品質 ${q}% (ライフ) で 左側の高貴${q ? " + 触媒の高貴" : ""} + 上級の高貴 1 回: ライフ T1 ${(100 * hit / K).toFixed(2)}%`);
  }
  process.exit(0);
}

console.log(`値段 ${BOOT} (神 = ${PRICES.divine.toFixed(2)} 高貴): ${Object.entries(PRICES).map(([k, v]) => `${k} ${v.toFixed(1)}`).join("  ")}`);
const KEYS = ["alchemy", "chaos", "annul", "exalt_greater", "OmenofSinistralExaltation", "OmenofDextralExaltation", "OmenofCatalysingExaltation", "catalyst_life", "catalyst_fire", "catalyst_lightning", "catalyst_cold"];
for (const way of WAYS) for (const key of PICK) {
  const base = BASES[key];
  const t0 = Date.now();
  const rng = M.mulberry32(SEED);
  const rs = Array.from({ length: N }, () => runOne(way, base, rng));
  const s = summarize(rs, costOf);
  console.log(`\n=== ${way} / ${JA[base]} (狙い ${AIM}, ${N} 人, seed ${SEED}, ${((Date.now() - t0) / 1000).toFixed(0)} 秒, 打ち止め ${BUDGET || "無し"}, カタリスト ${ONE ? "1 個 +1%" : "+1% か +2%"})`);
  console.log(headLine(s, N) + `  99% ${s.costs[Math.floor(0.99 * s.costs.length)]?.toFixed(1)}`);
  const fin = mean(s.done.map((r) => r.fin)), fc = mean(s.done.map((r) => r.finCount));
  console.log(`  うち仕上げの品質 (上限まで): ${fc.toFixed(2)} 個 ${fin.toFixed(3)} 神  /  仕上げ抜き 平均 ${(s.m - fin).toFixed(2)} 神`);
  console.log(`  予算までに完成: ${[1, 2, 5, 10, 25, 50, 100, 250].map((b) => `${b} 神 ${(100 * s.costs.filter((c) => c <= b).length / N).toFixed(1)}%`).join("  ")}`);
  for (const k of KEYS) {
    const c = mean(s.done.map((r) => r.n[k] ?? 0));
    if (c) console.log(`  ${k.padEnd(30)} ${c.toFixed(2).padStart(10)} 個  ${div(c * PRICES[k]).toFixed(2).padStart(9)} 神`);
  }
  console.log(`  消えた回数: ライフ ${mean(s.done.map((r) => r.lostLife)).toFixed(2)}  耐性 T1 ${mean(s.done.map((r) => r.lostRes)).toFixed(2)}`);
  // 完成品の仕上げ後の値 (エンジンの boostedMod)
  const res = [], other = [], life = [];
  for (const r of s.done) {
    for (const m of r.it.suffixes) {
      if (m.modId === RES[r.finTag] && m.tierIndex >= top(m.modId) - LOW) res.push(C.boostedMod(r.it, m, data)?.values[0] ?? m.values[0]);
      else if (Object.values(RES).includes(m.modId) && m.tierIndex >= top(m.modId) - LOW) other.push(C.boostedMod(r.it, m, data)?.values[0] ?? m.values[0]);
    }
    for (const m of r.it.prefixes) if (isLife(m)) life.push(C.boostedMod(r.it, m, data)?.values[0] ?? m.values[0]);
  }
  const els = {};
  for (const r of s.done) { const k = resT1(r.it).sort().join("+"); els[k] = (els[k] ?? 0) + 1; }
  const srt = (xs) => [...xs].sort((a, b) => a - b);
  console.log(`  仕上げ後: 伸ばした耐性 平均 ${mean(res).toFixed(1)} (${srt(res)[0]}–${srt(res).at(-1)})・もう 1 つの耐性 平均 ${mean(other).toFixed(1)} (${srt(other)[0]}–${srt(other).at(-1)}、伸びない)・ライフ 平均 ${mean(life).toFixed(1)} (素のまま)  元素の組 ${JSON.stringify(els)}`);
}
