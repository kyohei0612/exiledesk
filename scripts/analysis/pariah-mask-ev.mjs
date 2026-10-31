/**
 * pariah-mask-ev.mjs — 追放者の仮面 (Pariah Mask、Lv54、回避と ES の兜 = 置き場 Helmets_dex_int) に「ライフ +100 以上 + 元素耐性 36% 以上 を 2 つ」を、
 * エンジンの入口 (applyCurrency) だけで打たせて費用を数える (解析係、2026-10-31、記事編集長の頼み = ブログ pariah-mask (11-13))。
 * 結果は docs/org/math/notes/2026-10-31-pariah-mask.md。型は sacred-focus-ev.mjs と同じ (同じ値段・同じ数え方)。
 *
 *   [BUDGET=0] node scripts/analysis/pariah-mask-ev.mjs [N=2000] [SEED=1] [打ち方,…=chaos,exalt,ess] [ベース,…=pariah]
 *   PROBE=1 node scripts/analysis/pariah-mask-ev.mjs [K=200000] [SEED=1]   … 置き場の兜の並び・候補が同じか・ilvl 54 と 82 の差・1 回で狙いが付く割合・品質 20% の手間
 *   DEF=1   node scripts/analysis/pariah-mask-ev.mjs [N=2000] [SEED=1]     … 完成品の回避・ES (エンジンの表示の式 numbersOf) を 追放者 / 嘲笑 / 飛翔 で比べる
 *
 * ベース: 追放者の仮面 (ilvl 82、ベースの代金は 0)。比べに 嘲笑の仮面 (grinning、置き場の一番上 Lv80)・飛翔の仮面 (soaring、Lv75) も回せる。
 * 狙い (プレ 1 + サフィ 2):
 *   プレ = 最大ライフ +100 以上 (Helmets_dex_int/IncreasedLife の上 3 段 = +100–119 / +120–149 / +150–174、MOD レベル 54 / 60 / 65、重み 1000 ずつ。
 *          または 肉体のグレーターエッセンス の +100–119 = Helmets_dex_int/Essence_IncreasedLife)
 *   サフィ = 火・冷気・雷の耐性 36% 以上 を 2 つ (Helmets_dex_int/{Fire,Cold,Lightning}Resistance の上 2 段 = 36–40% / 41–45%、MOD レベル 71 / 82、重み 1000 ずつ。元素は何でも)
 *   同じ系統の低い段は外れ (グレーターの耐性エッセンス 31–35% も外れ)。ほかの MOD は何でもよい。
 * 打ち方 (状態だけで決まる):
 *   chaos = 錬金 → カオスだけ。
 *   exalt = 錬金 → ライフが欠けてプレに空き → 左側の高貴のお告げ + 上級の高貴 / 耐性が 2 つ無くサフィに空き → 右側の高貴のお告げ + 上級の高貴 /
 *           どちらも空きが無い → 消去 (お告げ無し)。ライフを先。
 *   ess   = 白 → 変成 → 肉体のグレーターエッセンス (マジック → レア、ライフ +100–119 確定)。あとは exalt と同じ (ライフが消えたら左側の高貴で引き直す)。
 * 値段: data-cache/boot/boot-2026-10-22.json (自分のサーバーの /boot.json の写し、2026-10-22T04:00Z、Forbidden Rites、高貴建て)。
 */
import fs from "node:fs";
import { bundleEntry } from "../_bundle-ts.mjs";
import { costOf as costWith, counter, headLine, mean, summarize } from "./_ev-common.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const data = M.loadPatch();
const N = Number(process.argv[2] ?? 2000);
const SEED = Number(process.argv[3] ?? 1);
const WAYS = (process.argv[4] ?? "chaos,exalt,ess").split(",");
const BASES = { pariah: "Pariah Mask", grinning: "Grinning Mask", soaring: "Soaring Mask" };
const JA = JSON.parse(fs.readFileSync("src/i18n/items-ja-client.json", "utf8"));
const PICK = (process.argv[5] ?? "pariah").split(",");
const BUDGET = Number(process.env.BUDGET ?? 0);
const LIMIT = Number(process.env.LIMIT ?? 2000000);

const BOOT = process.env.BOOT ?? "data-cache/boot/boot-2026-10-22.json";
const ROW = new Map(JSON.parse(fs.readFileSync(BOOT, "utf8")).market.items.map((x) => [x.Text, x.CurrentPrice]));
const ESS = "essence:greater:Helmets_dex_int/Essence_IncreasedLife";
const EN = {
  alchemy: "Orb of Alchemy", transmute: "Orb of Transmutation", chaos: "Chaos Orb", annul: "Orb of Annulment", exalt_greater: "Greater Exalted Orb", divine: "Divine Orb",
  scrap: "Armourer's Scrap", fracture: "Fracturing Orb",
  OmenofDextralExaltation: "Omen of Dextral Exaltation", OmenofSinistralExaltation: "Omen of Sinistral Exaltation",
  ess: "Greater Essence of the Body",
};
const PRICES = Object.fromEntries(Object.entries(EN).map(([k, en]) => {
  const p = ROW.get(en);
  if (!(p > 0)) throw new Error(`値段が無い: ${en}`);
  return [k, p];
}));
const costOf = (n) => costWith(n, PRICES);
const keyOf = (cur) => (cur === ESS ? "ess" : cur);

const C = "Helmets_dex_int/";
const LIFE = C + "IncreasedLife", LIFE_E = C + "Essence_IncreasedLife";
const RES = ["FireResistance", "ColdResistance", "LightningResistance"].map((x) => C + x);
const LIFE_MIN = data.mods.get(LIFE).tiers.length - 3; // +100 以上 = index 7・8・9
const RES_MIN = data.mods.get(RES[0]).tiers.length - 2; // 36% 以上 = index 6・7
for (const r of RES) if (data.mods.get(r).tiers.length - 2 !== RES_MIN) throw new Error(`耐性の段の数が違う: ${r}`);
const isLife = (m) => (m.modId === LIFE && m.tierIndex >= LIFE_MIN) || m.modId === LIFE_E; // エッセンスはグレーターだけ打つ
const isRes = (m) => RES.includes(m.modId) && m.tierIndex >= RES_MIN;
const hasLife = (it) => it.prefixes.some(isLife), resN = (it) => it.suffixes.filter(isRes).length;
const held = (it) => (hasLife(it) ? 1 : 0) + Math.min(2, resN(it));

const start = (base, rng, ilvl = 82) => M.startFrom(data, base, ilvl, {}, Math.floor(rng() * 2 ** 31));

/** 次の手 (null = 完成) */
function nextMove(way, it, cap) {
  if (held(it) === 3) return null;
  if (way === "chaos") return "chaos";
  // frac: ライフと耐性 1 つを持ち MOD が 4 つ以上で、まだ固定が無い → フラクチャー (6 つのうちランダムな 1 つが固定、外れも固定されうる)
  if (way === "frac" && hasLife(it) && resN(it) === 1 && it.prefixes.length + it.suffixes.length >= 4 && ![...it.prefixes, ...it.suffixes].some((m) => m.fractured)) return "fracture";
  if (way === "resfirst" || way === "essres") {
    // 耐性 2 つを先に揃え、ライフは後 (揃うまでプレには何も足さない = 消去がプレに当たる数を減らす)
    if (resN(it) < 2) return it.suffixes.length < cap.suffix ? "exaltS" : "annul";
    return it.prefixes.length < cap.prefix ? "exaltP" : "annul";
  }
  if (!hasLife(it) && it.prefixes.length < cap.prefix) return "exaltP";
  if (resN(it) < 2 && it.suffixes.length < cap.suffix) return "exaltS";
  return "annul";
}

function runOne(way, base, rng) {
  let it = start(base, rng), redo = 0;
  const n = {};
  const apply = counter(M, data, n, keyOf);
  const use = (cur, omens = []) => { it = apply(it, cur, rng, omens).item; };
  if (way === "ess" || way === "frac" || way === "essres") {
    // 変成でライフ (同じ系統) が付いたら、そのマジックは捨てて白からやり直す (変成を数える)。エンジンはそのままエッセンスを打つと
    // ライフが 2 つ並ぶ (系統の重なり、ゲームでは確かめていない) ので、その決まりに頼らない
    for (use("transmute"); it.prefixes.some((m) => m.modId === LIFE); use("transmute")) { it = start(base, rng); redo++; }
    use(ESS);
  } else use("alchemy");
  const cap = capOf(it);
  let steps = 0, lostLife = 0, lostRes = 0;
  for (let mv = nextMove(way, it, cap); mv; mv = nextMove(way, it, cap)) {
    if (++steps > LIMIT || (BUDGET > 0 && costOf(n) > BUDGET)) return { done: false, n, it, lostLife, lostRes };
    const hL = hasLife(it), hR = resN(it);
    if (mv === "chaos") use("chaos");
    else if (mv === "fracture") use("fracture");
    else if (mv === "annul") use("annul");
    else if (mv === "exaltP") use("exalt_greater", ["OmenofSinistralExaltation"]);
    else use("exalt_greater", ["OmenofDextralExaltation"]);
    if (hL && !hasLife(it)) lostLife++;
    if (resN(it) < hR) lostRes++;
  }
  return { done: true, n, it, lostLife, lostRes };
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

if (process.env.PROBE) {
  const K = N;
  const rows = JSON.parse(fs.readFileSync("src/services/htc/base-rows.json", "utf8"));
  const sb = JSON.parse(fs.readFileSync("src/services/craft-stage/stage-bases.json", "utf8")).bases;
  const bi = JSON.parse(fs.readFileSync("src/data/base-info.json", "utf8"));
  // (1) 置き場の兜の並び (ルーンフォージ・ルーンマスターは別に数える)
  const all = Object.keys(rows).filter((k) => rows[k] === "Helmets_dex_int").sort((a, b) => (bi[a]?.lv ?? 0) - (bi[b]?.lv ?? 0) || a.localeCompare(b));
  const plain = all.filter((n) => !/^Rune(forged|mastered) /.test(n));
  console.log(`Helmets_dex_int: ${all.length} 個 (ふつう ${plain.length}・ルーンフォージ / ルーンマスター ${all.length - plain.length})`);
  plain.forEach((n, i) => console.log(`  ${String(i + 1).padStart(2)}. ${n} (${JA[n] ?? "?"}) Lv${bi[n]?.lv} 器用 ${bi[n]?.dex} 知性 ${bi[n]?.int}  回避 ${sb[n]?.evasion ?? "-"} / ES ${sb[n]?.es ?? "-"}`));
  // (2) 候補の比べ: 系統・段・重み (空のレア、下限 0)・枠・ソケット・暗黙。ilvl 82 の全部と、追放者の ilvl 54
  const sigOf = (base, ilvl) => {
    const rng = M.mulberry32(SEED);
    const fresh = M.applyCurrency(data, start(base, rng, ilvl), "alchemy", rng).item;
    const cs = M.candidates(data, { ...fresh, prefixes: [], suffixes: [] }, ["prefix", "suffix"], 0, {});
    return { fresh, cs, sig: cs.map((c) => `${c.side}:${c.mod.id}:${c.tiers.map((t) => `${t.index}/${t.w}`).join(",")}`).sort().join("|") };
  };
  const ref = sigOf(BASES.pariah, 82);
  const imp = (b) => (M.htcBaseInfo()[b]?.implicits ?? []).map((i) => i.ja ?? i.en).join(" / ") || "無し";
  console.log(`追放者の仮面 ilvl 82: 部位 ${ref.fresh.cls.id}・候補 ${ref.cs.length} 系統・重み ${ref.cs.reduce((a, c) => a + c.w, 0)}・枠 ${JSON.stringify(capOf(ref.fresh))}・熟練工のソケット ${M.socketCapOf(BASES.pariah, ref.fresh.cls.category)}・暗黙 ${imp(BASES.pariah)}・暗黙 (アイテム) ${JSON.stringify(ref.fresh.implicits ?? [])}`);
  const same = plain.filter((b) => sigOf(b, 82).sig === ref.sig);
  console.log(`ilvl 82 で候補 (系統・段・重み) が追放者と同じ: ${same.length} / ${plain.length}${same.length < plain.length ? `  違う: ${plain.filter((b) => !same.includes(b)).join(", ")}` : ""}`);
  console.log(`  ソケット: ${plain.map((b) => `${b} ${M.socketCapOf(b, "Helmets")}`).join(", ")}`);
  console.log(`  暗黙: ${[...new Set(plain.map(imp))].join(" | ")}`);
  for (const lv of [54, 65, 70, 75, 81]) {
    const lo = sigOf(BASES.pariah, lv);
    const top = (id) => { const c = lo.cs.find((x) => x.mod.id === id); return c ? Math.max(...c.tiers.map((t) => t.index)) : -1; };
    const fmt = (id) => { const t = top(id); const r = data.mods.get(id).tiers[t]?.ranges?.[0]; return `${r ? r.join("–") : "無し"}`; };
    console.log(`  追放者の仮面 ilvl ${lv}: ilvl 82 と同じ ${lo.sig === ref.sig}  ライフの上限 +${fmt(LIFE)}・耐性の上限 ${fmt(RES[0])}%・候補の重み ${lo.cs.reduce((a, c) => a + c.w, 0)}`);
  }
  // (3) 重みの割合 (空のレアから 1 つ引く)
  const rng = M.mulberry32(SEED);
  const empty = { ...ref.fresh, prefixes: [], suffixes: [] };
  for (const [k, f] of [["カオス", M.orbFloor("chaos", "base")], ["上級の高貴", M.orbFloor("exalt", "greater")]]) {
    const cs = M.candidates(data, empty, ["prefix", "suffix"], f, {});
    const side = (s) => cs.filter((c) => c.side === s).reduce((a, c) => a + c.w, 0);
    const w = (id, min) => cs.find((c) => c.mod.id === id)?.tiers.filter((t) => t.index >= min).reduce((a, t) => a + t.w, 0) ?? 0;
    const l = w(LIFE, LIFE_MIN), r = RES.reduce((a, id) => a + w(id, RES_MIN), 0), r1 = w(RES[0], RES_MIN), rAll = w(RES[0], 0);
    console.log(`  ${k} (下限 ${f}): プレ ${side("prefix")} / サフィ ${side("suffix")}  ライフ +100 以上 ${l} (プレの ${(100 * l / side("prefix")).toFixed(2)}%)  耐性 36%+ 3 つ合わせて ${r} (サフィの ${(100 * r / side("suffix")).toFixed(2)}%、1 つの耐性の中で 36%+ は ${(100 * r1 / rAll).toFixed(1)}%)`);
  }
  // (4) エンジンで K 回
  const tryK = (mk, cur, omens) => {
    let l = 0, r1 = 0, r2 = 0, all = 0, fail = 0;
    for (let i = 0; i < K; i++) {
      const res = M.applyCurrency(data, mk(), cur, rng, omens);
      if (!res.applied) { fail++; continue; }
      if (hasLife(res.item)) l++;
      const rn = resN(res.item);
      if (rn >= 1) r1++;
      if (rn >= 2) r2++;
      if (held(res.item) === 3) all++;
    }
    const p = (x) => `${(100 * x / K).toFixed(3)}%`;
    return `ライフ ${p(l)}  耐性 1 つ以上 ${p(r1)}  耐性 2 つ ${p(r2)}  3 つ全部 ${(100 * all / K).toFixed(4)}%${fail ? `  打てない ${fail}` : ""}`;
  };
  const alch = () => M.applyCurrency(data, start(BASES.pariah, rng), "alchemy", rng).item;
  const noAim = () => { let x; do x = alch(); while (held(x) > 0); return x; };
  const mod = (id, side, ti) => M.makeStageMod(data.mods.get(id), side, ti, rng);
  console.log(`  錬金 1 回 (白から): ${tryK(() => start(BASES.pariah, rng), "alchemy", [])}`);
  console.log(`  カオス 1 回 (錬金直後・狙い無し): ${tryK(noAim, "chaos", [])}`);
  console.log(`  左側の高貴 + 上級 1 回 (プレは空): ${tryK(() => empty, "exalt_greater", ["OmenofSinistralExaltation"])}`);
  console.log(`  右側の高貴 + 上級 1 回 (ライフだけ、サフィは空): ${tryK(() => ({ ...empty, prefixes: [mod(LIFE_E, "prefix", 2)] }), "exalt_greater", ["OmenofDextralExaltation"])}`);
  console.log(`  右側の高貴 + 上級 1 回 (ライフ + 火 36%、サフィ 1 つ) → 2 つ目 = 完成: ${tryK(() => ({ ...empty, prefixes: [mod(LIFE_E, "prefix", 2)], suffixes: [mod(RES[0], "suffix", RES_MIN)] }), "exalt_greater", ["OmenofDextralExaltation"])}`);
  console.log(`  右側の高貴 + 上級 1 回 (ライフ + 火 36% + 外れ 1 つ、サフィ 2 つ) → 3 つ目 = 完成: ${tryK(() => ({ ...empty, prefixes: [mod(LIFE_E, "prefix", 2)], suffixes: [mod(RES[0], "suffix", RES_MIN), mod(C + "Intelligence", "suffix", 3)] }), "exalt_greater", ["OmenofDextralExaltation"])}`);
  const magic0 = () => M.applyCurrency(data, start(BASES.pariah, rng), "transmute", rng).item;
  let lifeT = 0;
  for (let i = 0; i < K; i++) if (magic0().prefixes.some((m) => m.modId === LIFE)) lifeT++;
  console.log(`  変成 1 回でライフ (どの段でも) が付く: ${(100 * lifeT / K).toFixed(2)}% (この時はやり直す。エンジンはそのままエッセンスを打つとライフが 2 つ並ぶ)`);
  const magic = () => { let x; do x = magic0(); while (x.prefixes.some((m) => m.modId === LIFE)); return x; };
  console.log(`  肉体のグレーターエッセンス 1 回 (変成直後のマジック): ${tryK(magic, ESS, [])}`);
  // 消去 1 回がライフを巻き込む割合 (エッセンス直後から右側の高貴でサフィを満杯にした所、耐性 2 つ揃っていない物)
  let hit = 0, tot = 0;
  for (let i = 0; i < K / 10; i++) {
    let x = M.applyCurrency(data, magic(), ESS, rng).item;
    while (x.suffixes.length < 3) x = M.applyCurrency(data, x, "exalt_greater", rng, ["OmenofDextralExaltation"]).item;
    if (resN(x) >= 2) continue;
    tot++;
    if (!hasLife(M.applyCurrency(data, x, "annul", rng).item)) hit++;
  }
  console.log(`  消去 1 回 (エッセンス + サフィ満杯・耐性 2 つ未満) でライフが消える: ${(100 * hit / tot).toFixed(1)}% (${tot} 回)`);
  // (5) 品質 20% まで: 防具の欠片を何個 (E-70、1 回で 1 か 2)
  let scraps = 0;
  for (let i = 0; i < 20000; i++) { let x = start(BASES.pariah, rng); while (x.quality < 20) { x = M.applyCurrency(data, x, "scrap", rng).item; scraps++; } }
  console.log(`  品質 0 → 20%: 鎧鍛冶の端材 平均 ${(scraps / 20000).toFixed(2)} 個 (= ${(scraps / 20000 * PRICES.scrap / PRICES.divine).toFixed(3)} 神)`);
  process.exit(0);
}

if (process.env.DEF) {
  const P = await bundleEntry("src/services/craft-stage/stage-props.ts");
  const B = await bundleEntry("src/services/craft-stage/stage-bases.ts");
  const num = (it, base, q) => P.numbersOf({ ...it, base, quality: q });
  const LIST = [BASES.pariah, BASES.soaring, BASES.grinning];
  for (const b of LIST) console.log(`${b} (${JA[b]}): 表示の素の数値 ${JSON.stringify(B.baseStatsOf(b))}`);
  // 防御の MOD を段の端で固定した表 (足し算 = 回避と ES の足し算、増加 = 回避と ES の増加%)
  const FLAT = C + "LocalBaseEvasionRatingAndEnergyShield", INC = C + "LocalEvasionAndEnergyShield";
  const mk = (fe, fs, pc) => {
    const it = start(BASES.pariah, M.mulberry32(1));
    const pre = [];
    if (fe) pre.push({ ...M.makeStageMod(data.mods.get(FLAT), "prefix", 4, M.mulberry32(1)), values: [fe, fs] });
    if (pc) pre.push({ ...M.makeStageMod(data.mods.get(INC), "prefix", 6, M.mulberry32(1)), values: [pc] });
    return { ...it, rarity: "rare", prefixes: pre, suffixes: [] };
  };
  const cell = (it, q) => LIST.map((b) => { const x = num(it, b, q); return `${x.evasion.toFixed(0)}/${x.es.toFixed(0)}`; }).join("  ");
  console.log(`  (回避/ES の順に ${LIST.map((b) => JA[b]).join("  ")})`);
  for (const [label, fe, fs, pc] of [["防御の MOD 無し", 0, 0, 0], ["増加 T1 の真ん中 (96%) だけ", 0, 0, 96], ["足し算 T1 の真ん中 (+87/+28) + 増加 T1 の真ん中 (96%)", 87, 28, 96]]) {
    const it = mk(fe, fs, pc);
    console.log(`  ${label}: 品質 0%: ${cell(it, 0)}   品質 20%: ${cell(it, 20)}`);
  }
  // 完成品 (ess の打ち方、追放者) をそのまま 3 つのベースに載せ替えて比べる
  const rng = M.mulberry32(SEED);
  const done = Array.from({ length: N }, () => runOne("ess", BASES.pariah, rng)).filter((r) => r.done).map((r) => r.it);
  const DEFS = new Set([FLAT, INC, C + "LocalIncreasedEvasionAndEnergyShieldAndLife", C + "LocalIncreasedEvasionAndEnergyShieldAndMana"]);
  const withDef = done.filter((it) => it.prefixes.some((m) => DEFS.has(m.modId))).length;
  console.log(`  完成品 ${done.length} 個のうち、プレに回避と ES の MOD が乗っていた物 ${withDef} 個 (${(100 * withDef / done.length).toFixed(1)}%)`);
  for (const q of [0, 20]) {
    const row = LIST.map((b) => { const xs = done.map((it) => num(it, b, q)); return { b, ev: mean(xs.map((x) => x.evasion)), es: mean(xs.map((x) => x.es)) }; });
    console.log(`  完成品 品質 ${q}%: ${row.map((r) => `${JA[r.b]} 回避 ${r.ev.toFixed(1)} / ES ${r.es.toFixed(1)}`).join("   ")}  (嘲笑 − 追放者: 回避 +${(row[2].ev - row[0].ev).toFixed(1)} (${(100 * (row[2].ev / row[0].ev - 1)).toFixed(1)}%) / ES +${(row[2].es - row[0].es).toFixed(1)} (${(100 * (row[2].es / row[0].es - 1)).toFixed(1)}%))`);
  }
  process.exit(0);
}

console.log(`値段 ${BOOT} (神 = ${PRICES.divine.toFixed(2)} 高貴): ${Object.entries(PRICES).map(([k, v]) => `${k} ${v.toFixed(1)}`).join("  ")}`);
const KEYS = ["alchemy", "transmute", "ess", "fracture", "chaos", "annul", "exalt_greater", "OmenofSinistralExaltation", "OmenofDextralExaltation"];
for (const way of WAYS) for (const key of PICK) {
  const base = BASES[key];
  const t0 = Date.now();
  const rng = M.mulberry32(SEED);
  const rs = Array.from({ length: N }, () => runOne(way, base, rng));
  const s = summarize(rs, costOf);
  console.log(`\n=== ${way} / ${base} (${N} 人, seed ${SEED}, ${((Date.now() - t0) / 1000).toFixed(0)} 秒, 打ち止め ${BUDGET || "無し"})`);
  console.log(headLine(s, N) + `  99% ${s.costs[Math.floor(0.99 * s.costs.length)]?.toFixed(1)}`);
  console.log(`  予算までに完成: ${[1, 2, 5, 10, 25, 50, 100, 250, 500, 1000].map((b) => `${b} 神 ${(100 * s.costs.filter((c) => c <= b).length / N).toFixed(1)}%`).join("  ")}`);
  for (const k of KEYS) {
    const c = mean(s.done.map((r) => r.n[k] ?? 0));
    if (c) console.log(`  ${k.padEnd(30)} ${c.toFixed(2).padStart(10)} 個  ${(c * PRICES[k] / PRICES.divine).toFixed(2).padStart(9)} 神`);
  }
  const lost = (f) => mean(s.done.map((r) => r[f])).toFixed(2);
  console.log(`  消えた回数: ライフ ${lost("lostLife")}  耐性 ${lost("lostRes")}`);
}
