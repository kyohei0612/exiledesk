/**
 * split-amulet-ev.mjs — 片側だけ枠が減る首飾り (歪んだアミュレット 3/2・悲嘆のアミュレット 2/3) と 金のアミュレット (3/3) に、
 * 同じ狙い・同じ打ち方をエンジンの入口 (applyCurrency) だけで打たせて費用を比べる
 * (解析係、2026-10-31、記事編集長の頼み = ブログ distorted-lament-amulet (11-10))。
 * 結果は docs/org/math/notes/2026-10-31-split-amulet.md。作りと値段は absent-amulet-ev.mjs (11-08 の記事の元) の写し。
 *
 *   node scripts/analysis/split-amulet-ev.mjs [N=2000] [SEED=1] [打ち方,…=exalt,frac] [ベース,…=distorted,lament,gold] [狙い,…=A,B]
 *   PROBE=1 node scripts/analysis/split-amulet-ev.mjs [K=200000] [SEED=1]   … 枠・白からの打てる物・1 回で狙いが付く割合
 *
 * ベース (どれも ilvl 82、ベースの代金は 0): 歪んだ Distorted Amulet (暗黙 サフィ -1 = レアで 3/2)、悲嘆 Lament Amulet (Lv42、プレ -1 = 2/3)、
 *   金 Gold Amulet (Lv35、暗黙 レアリティ = 3/3)。置き場はどれも Amulets。
 * 始め: 白 → 錬金 (レア 4 MOD)。錬金の代金も入れる。
 * 狙い (aims の先頭が「なかなか付かない方」= frac で守る物):
 *   A (プレ寄り) = スピリット T1 (BaseSpirit の 5 段目、MOD レベル 54、重み 400) + ES T2 以上 (EnergyShield の上 2 段、70 / 80、1000 ずつ) [プレ]
 *                  + キャストスピード T2 以上 [サフィ]
 *   B (サフィ寄り) = 全てのスペルスキルのレベル T1 (+3、重み 100) + キャストスピード T2 以上 (800 ずつ) [サフィ] + ES T2 以上 [プレ]
 *   B0 (サフィ 2 つだけ) = B からプレを抜いた物 (= 11-08 の記事と同じ狙い)
 *   同じ系統の低い段は外れ (系統が埋まって狙いが付かない)。
 * 打ち方 (状態だけで決まる。どのベースにも同じ決まり):
 *   exalt = まだ無い狙いのうち先頭 (付きにくい方) だけを追う: その側に空きがある → その側の高貴のお告げ (右側 = サフィ・左側 = プレ)
 *           + 上級の高貴。その側が満杯 → 消去 (お告げ無し)。先頭が付いたら次の狙いへ。
 *           (SPREAD=1 で「空きのある側の狙いをどれでも先に足す」古い決まり。試しの 50 人で狙い B が 2〜4 倍高く、40 万手で止まる人も出た)
 *   frac  = 先頭の狙いが付くまでカオス (錬金の 4 MOD のまま) → フラクチャー (4 MOD から 1/4) → 固定が先頭の狙いなら exalt の手、
 *           ほかなら白から作り直す。
 *   chaos = カオスだけ (重いので既定では回さない)。
 * 値段: data-cache/boot/boot-2026-10-22.json (2026-10-22T04:00Z、Forbidden Rites、高貴建て。神 = 781.93)。
 * 同じ seed なら、ベースが違っても乱数の並びがほぼ揃う (エンジンが手ごとに同じ数だけ引く)。ベースの差だけが出る比べ方になる
 *   (例: B0 の exalt seed 2 で悲嘆と金が 2,087.75 / 2,087.39 神)。seed を替えた 2 本はそれぞれ別の並び。
 */
import fs from "node:fs";
import { bundleEntry } from "../_bundle-ts.mjs";
import { costOf as costWith, counter, headLine, mean, summarize } from "./_ev-common.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const data = M.loadPatch();
const N = Number(process.argv[2] ?? 2000);
const SEED = Number(process.argv[3] ?? 1);
const WAYS = (process.argv[4] ?? "exalt,frac").split(",");
const BASES = { distorted: "Distorted Amulet", lament: "Lament Amulet", gold: "Gold Amulet" };
const PICK = (process.argv[5] ?? "distorted,lament,gold").split(",");
const AIMSET = (process.argv[6] ?? "A,B").split(",");
const LIMIT = 400000; // 1 人の手の上限 (堂々巡りの見張り)

const BOOT = process.env.BOOT ?? "data-cache/boot/boot-2026-10-22.json";
const ROW = new Map(JSON.parse(fs.readFileSync(BOOT, "utf8")).market.items.map((x) => [x.Text, x.CurrentPrice]));
const EN = {
  alchemy: "Orb of Alchemy", chaos: "Chaos Orb", annul: "Orb of Annulment", exalt_greater: "Greater Exalted Orb", divine: "Divine Orb",
  OmenofDextralExaltation: "Omen of Dextral Exaltation", OmenofSinistralExaltation: "Omen of Sinistral Exaltation", fracture: "Fracturing Orb",
};
const PRICES = Object.fromEntries(Object.entries(EN).map(([k, en]) => {
  const p = ROW.get(en);
  if (!(p > 0)) throw new Error(`値段が無い: ${en}`);
  return [k, p];
}));
const costOf = (n) => costWith(n, PRICES);

/** 狙い 1 つ = 系統の id と、何段目から上なら良いか (index)。側はエンジンのデータ (mod.type) から */
const aim = (id, fromTop, label) => {
  const mod = data.mods.get(id);
  if (!mod) throw new Error(`MOD が無い: ${id}`);
  return { id, min: mod.tiers.length - fromTop, side: mod.type, label };
};
const SPIRIT = aim("Amulets/BaseSpirit", 1, "スピリット T1");
const ES = aim("Amulets/EnergyShield", 2, "ES T2+");
const SP = aim("Amulets/GlobalIncreaseSpellSkillGemLevel", 1, "スペル T1");
const CS = aim("Amulets/IncreasedCastSpeed", 2, "キャスト T2+");
const AIMS = { A: [SPIRIT, ES, CS], B: [SP, CS, ES], B0: [SP, CS] };

const sideList = (it, side) => (side === "prefix" ? it.prefixes : it.suffixes);
const hits = (a) => (m) => m.modId === a.id && m.tierIndex >= a.min;
const has = (it, a) => sideList(it, a.side).some(hits(a));
const heldN = (it, aims) => aims.filter((a) => has(it, a)).length;
const allOf = (it) => [...it.prefixes, ...it.suffixes];
const fracOf = (it) => allOf(it).find((m) => m.fractured);
const start = (base, rng) => M.startFrom(data, base, 82, {}, Math.floor(rng() * 2 ** 31));
const OMEN = { prefix: "OmenofSinistralExaltation", suffix: "OmenofDextralExaltation" };

/** レアのその側の枠 (暗黙の ±N 込み)。空にしたレアにその側の高貴を打って、付けられた数を数える (台本に決め打ちしない、E-24) */
function capOf(it, side) {
  let x = { ...it, prefixes: [], suffixes: [] }, k = 0;
  const rng = M.mulberry32(1);
  for (; k < 6; k++) { const r = M.applyCurrency(data, x, "exalt", rng, [OMEN[side]]); if (!r.applied) break; x = r.item; }
  return k;
}

/** SPREAD=1 = 空きのある側の狙いをどれでも先に足す古い決まり (先頭の側が満杯でも、ほかの側に空きがあれば高貴)。比べる用 */
const SPREAD = !!process.env.SPREAD;
/** 次の手 (null = 完成)。上の頭書きの決まり */
function nextMove(way, it, aims, cap) {
  if (heldN(it, aims) === aims.length) return null;
  if (way === "chaos") return "chaos";
  if (way === "frac") {
    const f = fracOf(it);
    if (!f) return has(it, aims[0]) && allOf(it).length >= 4 ? "fracture" : "chaos";
    if (!hits(aims[0])(f)) return "restart";
  }
  const a = aims.find((x) => !has(it, x)); // まだ無い狙いのうち先頭 (付きにくい方) だけを追う
  if (SPREAD) { for (const x of aims) if (!has(it, x) && sideList(it, x.side).length < cap[x.side]) return `exalt:${x.side}`; return "annul"; }
  return sideList(it, a.side).length < cap[a.side] ? `exalt:${a.side}` : "annul";
}

function runOne(way, base, aims, rng) {
  let it = start(base, rng);
  const n = {};
  const apply = counter(M, data, n);
  const use = (cur, omens = []) => { it = apply(it, cur, rng, omens).item; };
  use("alchemy");
  const cap = { prefix: capOf(it, "prefix"), suffix: capOf(it, "suffix") };
  let steps = 0, lostAny = 0, lostRare = 0, restarts = 0, fracRare = 0;
  for (let mv = nextMove(way, it, aims, cap); mv; mv = nextMove(way, it, aims, cap)) {
    if (++steps > LIMIT) return { done: false, n, lostAny, lostRare, restarts, fracRare };
    const before = aims.map((a) => has(it, a));
    if (mv === "restart") { it = start(base, rng); use("alchemy"); restarts++; continue; }
    if (mv === "fracture") { use("fracture"); if (hits(aims[0])(fracOf(it))) fracRare++; continue; }
    if (mv === "chaos") use("chaos");
    else if (mv === "annul") use("annul");
    else use("exalt_greater", [OMEN[mv.slice(6)]]);
    const after = aims.map((a) => has(it, a));
    lostAny += before.filter((b, i) => b && !after[i]).length;
    if (before[0] && !after[0]) lostRare++;
  }
  return { done: true, n, lostAny, lostRare, restarts, fracRare };
}

if (process.env.PROBE) {
  const K = N;
  const rng = M.mulberry32(SEED);
  const floors = { chaos: M.orbFloor("chaos", "base"), exalt_greater: M.orbFloor("exalt", "greater") };
  for (const [key, base] of Object.entries(BASES)) {
    const w = start(base, rng);
    const fresh = M.applyCurrency(data, w, "alchemy", rng).item;
    const empty = { ...fresh, prefixes: [], suffixes: [] };
    console.log(`\n=== ${base} (枠 プレ ${capOf(fresh, "prefix")} / サフィ ${capOf(fresh, "suffix")})`);
    // 白から 1 つ打てるか (変成 → 増強 / 富 / 錬金)
    const magic = M.applyCurrency(data, w, "transmute", rng);
    const aug = M.applyCurrency(data, magic.item, "augment", rng);
    console.log(`  変成 → P${magic.item.prefixes.length} S${magic.item.suffixes.length}  増強 ${aug.applied ? "打てる" : `打てない (${aug.reason})`}`);
    // 錬金の 4 MOD の分かれ方
    const split = {};
    for (let i = 0; i < 20000; i++) { const x = M.applyCurrency(data, w, "alchemy", rng).item; const k = `P${x.prefixes.length}S${x.suffixes.length}`; split[k] = (split[k] ?? 0) + 1; }
    console.log(`  錬金 2 万回の形: ${Object.entries(split).sort().map(([k, v]) => `${k} ${(v / 200).toFixed(1)}%`).join("  ")}`);
    // 重みの割合 (空のレアから 1 つの MOD の引き。カオス = 両側、上級の高貴 + お告げ = その側だけ)
    for (const [k, f] of Object.entries(floors)) {
      const cs = M.candidates(data, empty, ["prefix", "suffix"], f, {});
      const all = cs.reduce((a, c) => a + c.w, 0);
      const sideW = (s) => cs.filter((c) => c.side === s).reduce((a, c) => a + c.w, 0);
      const wOf = (a) => cs.find((c) => c.mod.id === a.id)?.tiers.filter((t) => t.index >= a.min).reduce((s, t) => s + t.w, 0) ?? 0;
      const line = [SPIRIT, ES, SP, CS].map((a) => `${a.label} ${wOf(a)} (全部の ${(100 * wOf(a) / all).toFixed(3)}%・${a.side === "prefix" ? "プレ" : "サフィ"}の ${(100 * wOf(a) / sideW(a.side)).toFixed(3)}%)`);
      console.log(`  ${k} (下限 ${f}): 重み 全部 ${all} / プレ ${sideW("prefix")} / サフィ ${sideW("suffix")}\n    ${line.join("\n    ")}`);
    }
    // エンジンで K 回: 錬金直後 (狙い無し) にカオス 1 回 → 各狙いが付いた割合
    const noAim = () => { let x; do x = M.applyCurrency(data, start(base, rng), "alchemy", rng).item; while (heldN(x, [SPIRIT, ES, SP, CS]) > 0); return x; };
    const cnt = [0, 0, 0, 0];
    for (let i = 0; i < K; i++) { const r = M.applyCurrency(data, noAim(), "chaos", rng).item; [SPIRIT, ES, SP, CS].forEach((a, j) => { if (has(r, a)) cnt[j]++; }); }
    console.log(`  カオス 1 回 (錬金直後・狙い無し、${K} 回): ${[SPIRIT, ES, SP, CS].map((a, j) => `${a.label} ${(100 * cnt[j] / K).toFixed(3)}%`).join("  ")}`);
  }
  process.exit(0);
}

console.log(`値段 ${BOOT} (神 = ${PRICES.divine.toFixed(2)} 高貴): ${Object.entries(PRICES).map(([k, v]) => `${k} ${v.toFixed(1)}`).join("  ")}`);
const KEYS = ["alchemy", "chaos", "fracture", "annul", "exalt_greater", "OmenofSinistralExaltation", "OmenofDextralExaltation"];
for (const set of AIMSET) for (const way of WAYS) for (const key of PICK) {
  const base = BASES[key], aims = AIMS[set];
  const t0 = Date.now();
  const rng = M.mulberry32(SEED);
  const rs = Array.from({ length: N }, () => runOne(way, base, aims, rng));
  const s = summarize(rs, costOf);
  console.log(`\n=== ${set} (${aims.map((a) => a.label).join(" + ")}) / ${way} / ${base} (${N} 人, seed ${SEED}, ${((Date.now() - t0) / 1000).toFixed(0)} 秒)`);
  console.log(headLine(s, N) + `  99% ${s.costs[Math.floor(0.99 * s.costs.length)]?.toFixed(1)}`);
  console.log(`  予算までに完成: ${[100, 250, 500, 1000, 2000, 5000].map((b) => `${b} 神 ${(100 * s.costs.filter((c) => c <= b).length / N).toFixed(1)}%`).join("  ")}`);
  for (const k of KEYS) {
    const c = mean(s.done.map((r) => r.n[k] ?? 0));
    if (c) console.log(`  ${k.padEnd(28)} ${c.toFixed(2).padStart(10)} 個  ${(c * PRICES[k] / PRICES.divine).toFixed(2).padStart(9)} 神`);
  }
  console.log(`  狙いが消えた ${mean(s.done.map((r) => r.lostAny)).toFixed(2)} 回 (うち ${aims[0].label} ${mean(s.done.map((r) => r.lostRare)).toFixed(2)} 回)` + (way === "frac" ? `  作り直し ${mean(s.done.map((r) => r.restarts)).toFixed(2)} 回  ${aims[0].label} が固定になった人 ${(100 * mean(s.done.map((r) => (r.fracRare ? 1 : 0)))).toFixed(1)}%` : ""));
}
