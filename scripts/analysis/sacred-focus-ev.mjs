/**
 * sacred-focus-ev.mjs — 聖なるフォーカス (Sacred Focus、Lv75) と タサリオのフォーカス (Tasalian Focus、Lv80) に ES の 2 つ + キャストスピードを、
 * エンジンの入口 (applyCurrency) だけで打たせて費用を数える (解析係、2026-10-31、記事編集長の頼み = ブログ sacred-focus (11-11))。
 * 結果は docs/org/math/notes/2026-10-31-sacred-focus.md
 *
 *   [BUDGET=0] [CRYS=1] node scripts/analysis/sacred-focus-ev.mjs [N=2000] [SEED=1] [打ち方,…=chaos,exalt,alloy,gess] [ベース,…=sacred]
 *   PROBE=1 node scripts/analysis/sacred-focus-ev.mjs [K=200000] [SEED=1]   … フォーカス 4 つの置き場の比べ・1 回で狙いが付く割合・品質 20% の手間
 *   ES=1    node scripts/analysis/sacred-focus-ev.mjs                       … 完成した時の ES (エンジンの表示の式 numbersOf) を 2 つのベースで比べる
 *
 * ベース: 聖なるフォーカス (ilvl 82、ベースの代金は 0)。比べに タサリオ・ルーンフォージの聖なる・ルーンフォージのタサリオ も回せる
 *   (PROBE でエンジンの候補が 4 つとも同じと確かめる)。
 * 狙い (プレ 2 + サフィ 1):
 *   プレ = ES% 増加 T2 以上 (Foci/LocalEnergyShieldPercent の上 2 段 = 80–91% / 92–100%、MOD レベル 60 / 65、重み 1000 ずつ)
 *        + ES の足し算 T2 以上 (Foci/LocalEnergyShield の上 2 段 = +74–80 / +81–90、MOD レベル 65 / 70、重み 1000 ずつ)
 *   サフィ = キャストスピード 25% 以上 (Foci/IncreasedCastSpeed の上 2 段 = 25–28% / 29–32%、MOD レベル 60 / 70、重み 1000 / 500。
 *          または 敏速のグレーターエッセンス の 25–28% (Foci/Essence_IncreasedCastSpeed の Greater)・超越の合金 の 26–31% (Foci/PerfectEssence_IncreasedCastSpeed))
 *   同じ系統の低い段は外れ。ほかの MOD は何でもよい。
 * 打ち方 (状態だけで決まる):
 *   chaos = 錬金 → カオスだけ。
 *   exalt = 錬金 → 欠けた狙いの側に空き → その側のお告げ (左側 = プレ / 右側 = サフィ) + 上級の高貴 (プレを先)。空きが無い → 消去 (お告げ無し)。
 *   alloy = 錬金 → キャストが無い → 超越の合金 (E-51: サフィが満杯ならサフィから消す。満杯でなく ES の狙いを持っていてサフィに MOD があれば
 *           右側の結晶化のお告げを掛けてサフィから消す。CRYS=0 で掛けない)。キャストがあってプレの狙いが欠けている → プレに空きがあれば
 *           左側の高貴のお告げ + 上級の高貴、満杯なら消去 (お告げ無し)。
 *   gess  = 白 → 変成 → 敏速のグレーターエッセンス (マジック → レア、キャスト 25–28% 確定)。あとは alloy と同じ (キャストが消えたら超越の合金で戻す)。
 * 値段: data-cache/boot/boot-2026-10-22.json (自分のサーバーの /boot.json の写し、2026-10-22T04:00Z、Forbidden Rites、高貴建て)。
 */
import fs from "node:fs";
import { bundleEntry } from "../_bundle-ts.mjs";
import { costOf as costWith, counter, headLine, mean, summarize } from "./_ev-common.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const data = M.loadPatch();
const N = Number(process.argv[2] ?? 2000);
const SEED = Number(process.argv[3] ?? 1);
const WAYS = (process.argv[4] ?? "chaos,exalt,alloy,gess").split(",");
const BASES = { sacred: "Sacred Focus", tasalian: "Tasalian Focus", rsacred: "Runeforged Sacred Focus", rtasalian: "Runeforged Tasalian Focus" };
const PICK = (process.argv[5] ?? "sacred").split(",");
const BUDGET = Number(process.env.BUDGET ?? 0);
const CRYS = process.env.CRYS !== "0";
const LIMIT = Number(process.env.LIMIT ?? 2000000);

const BOOT = process.env.BOOT ?? "data-cache/boot/boot-2026-10-22.json";
const ROW = new Map(JSON.parse(fs.readFileSync(BOOT, "utf8")).market.items.map((x) => [x.Text, x.CurrentPrice]));
const ALLOY = "essence:perfect:Foci/PerfectEssence_IncreasedCastSpeed";
const GESS = "essence:greater:Foci/Essence_IncreasedCastSpeed";
const EN = {
  alchemy: "Orb of Alchemy", transmute: "Orb of Transmutation", chaos: "Chaos Orb", annul: "Orb of Annulment", exalt_greater: "Greater Exalted Orb", divine: "Divine Orb",
  scrap: "Armourer's Scrap",
  OmenofDextralExaltation: "Omen of Dextral Exaltation", OmenofSinistralExaltation: "Omen of Sinistral Exaltation", OmenofDextralCrystallisation: "Omen of Dextral Crystallisation",
  alloy: "Transcendent Alloy", gess: "Greater Essence of Alacrity",
};
const PRICES = Object.fromEntries(Object.entries(EN).map(([k, en]) => {
  const p = ROW.get(en);
  if (!(p > 0)) throw new Error(`値段が無い: ${en}`);
  return [k, p];
}));
const costOf = (n) => costWith(n, PRICES);
const keyOf = (cur) => (cur === ALLOY ? "alloy" : cur === GESS ? "gess" : cur);

const PC = "Foci/LocalEnergyShieldPercent", FL = "Foci/LocalEnergyShield", CS = "Foci/IncreasedCastSpeed";
const CS_E = new Set(["Foci/Essence_IncreasedCastSpeed", "Foci/PerfectEssence_IncreasedCastSpeed"]);
const PC_MIN = data.mods.get(PC).tiers.length - 2; // 80% 以上 = index 5・6
const FL_MIN = data.mods.get(FL).tiers.length - 2; // +74 以上 = index 8・9
const CS_MIN = data.mods.get(CS).tiers.length - 2; // 25% 以上 = index 4・5
const isPc = (m) => m.modId === PC && m.tierIndex >= PC_MIN;
const isFl = (m) => m.modId === FL && m.tierIndex >= FL_MIN;
// 敏速のエッセンスはグレーター (25–28%) だけ打つので、エッセンスのキャストは全部狙い
const isCs = (m) => (m.modId === CS && m.tierIndex >= CS_MIN) || CS_E.has(m.modId);
const hasPc = (it) => it.prefixes.some(isPc), hasFl = (it) => it.prefixes.some(isFl), hasCs = (it) => it.suffixes.some(isCs);
const held = (it) => (hasPc(it) ? 1 : 0) + (hasFl(it) ? 1 : 0) + (hasCs(it) ? 1 : 0);

const start = (base, rng) => M.startFrom(data, base, 82, {}, Math.floor(rng() * 2 ** 31));

/** 次の手 (null = 完成) */
function nextMove(way, it, cap) {
  if (held(it) === 3) return null;
  if (way === "chaos") return "chaos";
  const preMiss = !hasPc(it) || !hasFl(it);
  if (way === "alloy" || way === "gess") {
    if (!hasCs(it)) return "alloy";
    return preMiss && it.prefixes.length < cap.prefix ? "exaltP" : "annul";
  }
  if (preMiss && it.prefixes.length < cap.prefix) return "exaltP";
  if (!hasCs(it) && it.suffixes.length < cap.suffix) return "exaltS";
  return "annul";
}

function runOne(way, base, rng) {
  let it = start(base, rng);
  const n = {};
  const apply = counter(M, data, n, keyOf);
  const use = (cur, omens = []) => { it = apply(it, cur, rng, omens).item; };
  if (way === "gess") { use("transmute"); use(GESS); } else use("alchemy");
  const cap = capOf(it);
  let steps = 0, lostPc = 0, lostFl = 0, lostCs = 0, blocked = 0;
  for (let mv = nextMove(way, it, cap); mv; mv = nextMove(way, it, cap)) {
    if (++steps > LIMIT || (BUDGET > 0 && costOf(n) > BUDGET)) return { done: false, n, it, lostPc, lostFl, lostCs, blocked };
    const hP = hasPc(it), hF = hasFl(it), hC = hasCs(it);
    if (mv === "alloy") {
      const guard = CRYS && (hP || hF) && it.suffixes.length > 0 && it.suffixes.length < cap.suffix;
      const r = M.applyCurrency(data, it, ALLOY, rng, guard ? ["OmenofDextralCrystallisation"] : []);
      if (r.applied) {
        n.alloy = (n.alloy ?? 0) + 1;
        for (const o of r.omensUsed ?? []) n[o] = (n[o] ?? 0) + 1;
        it = r.item;
      } else { blocked++; use("annul"); }
    } else if (mv === "chaos") use("chaos");
    else if (mv === "annul") use("annul");
    else if (mv === "exaltP") use("exalt_greater", ["OmenofSinistralExaltation"]);
    else use("exalt_greater", ["OmenofDextralExaltation"]);
    if (hP && !hasPc(it)) lostPc++;
    if (hF && !hasFl(it)) lostFl++;
    if (hC && !hasCs(it)) lostCs++;
  }
  return { done: true, n, it, lostPc, lostFl, lostCs, blocked };
}

/** レアの枠 (暗黙の ±N 込み)。空にしたレアに左側 / 右側の高貴を打って、付けられた数を数える (台本に決め打ちしない、E-24) */
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

/** 表示の数値 (stage-props.ts の numbersOf = (素 + 足し算) × (1 + 増加%) × (1 + 品質%)) */
async function esTools() {
  const P = await bundleEntry("src/services/craft-stage/stage-props.ts");
  const B = await bundleEntry("src/services/craft-stage/stage-bases.ts");
  return { es: (it, base, q) => P.numbersOf({ ...it, base, quality: q })?.es ?? null, stats: (b) => B.baseStatsOf(b) };
}

if (process.env.PROBE) {
  const K = N;
  // (1) フォーカス 4 つの比べ: 候補の系統・重み (空のレア、下限 0)、枠、ソケットの上限、暗黙
  const sig = {};
  for (const [key, base] of Object.entries(BASES)) {
    const rng = M.mulberry32(SEED);
    const fresh = M.applyCurrency(data, start(base, rng), "alchemy", rng).item;
    const cs = M.candidates(data, { ...fresh, prefixes: [], suffixes: [] }, ["prefix", "suffix"], 0, {});
    sig[key] = cs.map((c) => `${c.side}:${c.mod.id}:${c.tiers.map((t) => `${t.index}/${t.w}`).join(",")}`).sort().join("|");
    const imp = (M.htcBaseInfo()[base]?.implicits ?? []).map((i) => i.ja ?? i.en).join(" / ") || "無し";
    console.log(`${base}: 部位 ${fresh.cls.category ?? fresh.cls.id}・候補 ${cs.length} 系統・重み ${cs.reduce((a, c) => a + c.w, 0)}・枠 ${JSON.stringify(capOf(fresh))}・熟練工のソケット ${M.socketCapOf(base, fresh.cls.category)}・暗黙 ${imp}`);
  }
  console.log(`候補 (系統・段・重み) が聖なるフォーカスと同じ: ${Object.keys(BASES).map((k) => `${k} ${sig[k] === sig.sacred}`).join("  ")}`);
  // (2) 重みの割合 (空のレアから 1 つ引く)
  const rng = M.mulberry32(SEED);
  const fresh = M.applyCurrency(data, start(BASES.sacred, rng), "alchemy", rng).item;
  const empty = { ...fresh, prefixes: [], suffixes: [] };
  for (const [k, f] of [["カオス", M.orbFloor("chaos", "base")], ["上級の高貴", M.orbFloor("exalt", "greater")]]) {
    const cs = M.candidates(data, empty, ["prefix", "suffix"], f, {});
    const side = (s) => cs.filter((c) => c.side === s).reduce((a, c) => a + c.w, 0);
    const w = (id, min) => cs.find((c) => c.mod.id === id)?.tiers.filter((t) => t.index >= min).reduce((a, t) => a + t.w, 0) ?? 0;
    const pc = w(PC, PC_MIN), fl = w(FL, FL_MIN), c = w(CS, CS_MIN);
    console.log(`  ${k} (下限 ${f}): プレ ${side("prefix")} / サフィ ${side("suffix")}  ES% T2+ ${pc} (プレの ${(100 * pc / side("prefix")).toFixed(2)}%)  ES 足し算 T2+ ${fl} (${(100 * fl / side("prefix")).toFixed(2)}%)  キャスト 25%+ ${c} (サフィの ${(100 * c / side("suffix")).toFixed(2)}%)`);
  }
  // (3) エンジンで K 回
  const tryK = (mk, cur, omens) => {
    let pc = 0, fl = 0, cs = 0, all = 0, fail = 0;
    for (let i = 0; i < K; i++) {
      const r = M.applyCurrency(data, mk(), cur, rng, omens);
      if (!r.applied) { fail++; continue; }
      if (hasPc(r.item)) pc++;
      if (hasFl(r.item)) fl++;
      if (hasCs(r.item)) cs++;
      if (held(r.item) === 3) all++;
    }
    const p = (x) => `${(100 * x / K).toFixed(3)}%`;
    return `ES% T2+ ${p(pc)}  ES 足し算 T2+ ${p(fl)}  キャスト 25%+ ${p(cs)}  3 つ全部 ${(100 * all / K).toFixed(4)}%${fail ? `  打てない ${fail}` : ""}`;
  };
  const alch = () => M.applyCurrency(data, start(BASES.sacred, rng), "alchemy", rng).item;
  const noAim = () => { let x; do x = alch(); while (held(x) > 0); return x; };
  const mod = (id, side, ti) => M.makeStageMod(data.mods.get(id), side, ti, rng);
  console.log(`  錬金 1 回 (白から): ${tryK(() => start(BASES.sacred, rng), "alchemy", [])}`);
  console.log(`  カオス 1 回 (錬金直後・狙い無し): ${tryK(noAim, "chaos", [])}`);
  console.log(`  左側の高貴 + 上級 1 回 (キャストだけ、プレは空): ${tryK(() => ({ ...empty, suffixes: [mod(CS, "suffix", CS_MIN)] }), "exalt_greater", ["OmenofSinistralExaltation"])}`);
  console.log(`  左側の高貴 + 上級 1 回 (キャスト + ES% T2、プレ 1 つ): ${tryK(() => ({ ...empty, prefixes: [mod(PC, "prefix", PC_MIN)], suffixes: [mod(CS, "suffix", CS_MIN)] }), "exalt_greater", ["OmenofSinistralExaltation"])}`);
  console.log(`  右側の高貴 + 上級 1 回 (ES 2 つだけ、サフィは空): ${tryK(() => ({ ...empty, prefixes: [mod(PC, "prefix", PC_MIN), mod(FL, "prefix", FL_MIN)] }), "exalt_greater", ["OmenofDextralExaltation"])}`);
  console.log(`  超越の合金 1 回 (錬金直後・狙い無し): ${tryK(noAim, ALLOY, [])}`);
  const twoEs = () => { let x; do x = alch(); while (x.suffixes.length < 1 || x.suffixes.length > 2 || held(x) > 0); return { ...x, prefixes: [mod(PC, "prefix", PC_MIN), mod(FL, "prefix", FL_MIN)] }; };
  console.log(`  超越の合金 1 回 (ES 2 つ + サフィ 1〜2 つ、お告げ無し): ${tryK(twoEs, ALLOY, [])}`);
  console.log(`  同じ + 右側の結晶化のお告げ: ${tryK(twoEs, ALLOY, ["OmenofDextralCrystallisation"])}`);
  const magic = () => M.applyCurrency(data, start(BASES.sacred, rng), "transmute", rng).item;
  console.log(`  敏速のグレーターエッセンス 1 回 (変成直後のマジック): ${tryK(magic, GESS, [])}`);
  // (4) 品質 20% まで: 防具の欠片を何個 (E-70、1 回で 1 か 2)
  let scraps = 0;
  for (let i = 0; i < 20000; i++) { let x = start(BASES.sacred, rng); while (x.quality < 20) { x = M.applyCurrency(data, x, "scrap", rng).item; scraps++; } }
  console.log(`  品質 0 → 20%: 防具の欠片 平均 ${(scraps / 20000).toFixed(2)} 個 (= ${(scraps / 20000 * PRICES.scrap / PRICES.divine).toFixed(3)} 神)`);
  process.exit(0);
}

if (process.env.ES) {
  const T = await esTools();
  for (const b of Object.values(BASES)) console.log(`${b}: 表示の素の数値 ${JSON.stringify(T.stats(b))}`);
  // 狙いの段の端 (足し算 / 増加%) で 2 つのベースの ES を並べる
  const mk = (fl, pc) => {
    const it = start(BASES.sacred, M.mulberry32(1));
    const a = { ...M.makeStageMod(data.mods.get(FL), "prefix", FL_MIN, M.mulberry32(1)), values: [fl] };
    const c = { ...M.makeStageMod(data.mods.get(PC), "prefix", PC_MIN, M.mulberry32(1)), values: [pc] };
    return { ...it, rarity: "rare", prefixes: [a, c], suffixes: [] };
  };
  for (const [label, fl, pc] of [["狙いの下限 (+74・80%)", 74, 80], ["T1 の真ん中 (+85・96%)", 85, 96], ["T1 の上限 (+90・100%)", 90, 100], ["ES の MOD 無し", 0, 0]]) {
    const it = mk(fl, pc);
    const row = [0, 20].map((q) => `品質 ${q}%: 聖なる ${T.es(it, BASES.sacred, q).toFixed(1)} / タサリオ ${T.es(it, BASES.tasalian, q).toFixed(1)}`).join("  ");
    console.log(`  ${label}: ${row}`);
  }
  // 完成した物 (alloy の打ち方、聖なる) の ES を、同じ MOD のままタサリオに載せ替えて比べる
  const rng = M.mulberry32(SEED);
  const done = Array.from({ length: N }, () => runOne("alloy", BASES.sacred, rng)).filter((r) => r.done).map((r) => r.it);
  for (const q of [0, 20]) {
    const s = done.map((it) => T.es(it, BASES.sacred, q)), t = done.map((it) => T.es(it, BASES.tasalian, q));
    const srt = (xs) => [...xs].sort((a, b) => a - b);
    console.log(`  完成品 ${done.length} 個 品質 ${q}%: 聖なる 平均 ${mean(s).toFixed(1)} (最小 ${srt(s)[0].toFixed(0)}・最大 ${srt(s).at(-1).toFixed(0)}) / タサリオ 平均 ${mean(t).toFixed(1)} (最小 ${srt(t)[0].toFixed(0)}・最大 ${srt(t).at(-1).toFixed(0)})  差 ${(mean(t) - mean(s)).toFixed(1)} (${(100 * (mean(t) / mean(s) - 1)).toFixed(1)}%)`);
  }
  const third = done.filter((it) => it.prefixes.some((m) => m.modId === "Foci/LocalIncreasedEnergyShieldAndMana")).length;
  console.log(`  3 つ目のプレに ES% + マナ が乗っていた完成品: ${third} / ${done.length}`);
  process.exit(0);
}

console.log(`値段 ${BOOT} (神 = ${PRICES.divine.toFixed(2)} 高貴): ${Object.entries(PRICES).map(([k, v]) => `${k} ${v.toFixed(1)}`).join("  ")}`);
const KEYS = ["alchemy", "transmute", "gess", "chaos", "annul", "exalt_greater", "OmenofSinistralExaltation", "OmenofDextralExaltation", "alloy", "OmenofDextralCrystallisation"];
for (const way of WAYS) for (const key of PICK) {
  const base = BASES[key];
  const t0 = Date.now();
  const rng = M.mulberry32(SEED);
  const rs = Array.from({ length: N }, () => runOne(way, base, rng));
  const s = summarize(rs, costOf);
  console.log(`\n=== ${way} / ${base} (${N} 人, seed ${SEED}, ${((Date.now() - t0) / 1000).toFixed(0)} 秒, 打ち止め ${BUDGET || "無し"}${way === "alloy" || way === "gess" ? `, 結晶化 ${CRYS ? "有り" : "無し"}` : ""})`);
  console.log(headLine(s, N) + `  99% ${s.costs[Math.floor(0.99 * s.costs.length)]?.toFixed(1)}`);
  console.log(`  予算までに完成: ${[1, 2, 5, 10, 25, 50, 100, 250, 500, 1000].map((b) => `${b} 神 ${(100 * s.costs.filter((c) => c <= b).length / N).toFixed(1)}%`).join("  ")}`);
  for (const k of KEYS) {
    const c = mean(s.done.map((r) => r.n[k] ?? 0));
    if (c) console.log(`  ${k.padEnd(30)} ${c.toFixed(2).padStart(10)} 個  ${(c * PRICES[k] / PRICES.divine).toFixed(2).padStart(9)} 神`);
  }
  const lost = (f) => mean(s.done.map((r) => r[f])).toFixed(2);
  console.log(`  消えた回数: ES% ${lost("lostPc")}  ES 足し算 ${lost("lostFl")}  キャスト ${lost("lostCs")}` + (way === "alloy" || way === "gess" ? `  合金が打てなかった ${lost("blocked")}` : ""));
}
