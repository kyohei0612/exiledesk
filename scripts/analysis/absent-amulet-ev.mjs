/**
 * absent-amulet-ev.mjs — 不在のアミュレット (枠 2/2) と ふつうのアミュレット (金のアミュレット、枠 3/3) に、同じ狙い・同じ打ち方を
 * エンジンの入口 (applyCurrency) だけで打たせて費用を比べる (解析係、2026-10-31、記事編集長の頼み = ブログ 9 本目 absent-amulet)。
 * 結果は docs/org/math/notes/2026-10-31-absent-amulet.md
 *
 *   [BUDGET=0] node scripts/analysis/absent-amulet-ev.mjs [N=2000] [SEED=1] [打ち方,…=chaos,exalt,cat,frac] [ベース,…=absent,gold]
 *   PROBE=1 node scripts/analysis/absent-amulet-ev.mjs [K=200000] [SEED=1]   … 1 回で狙いが付く割合 (重みの割合と、エンジンで K 回打った数)
 *
 * ベース: 不在のアミュレット (Absent Amulet、Lv50、暗黙 プレ -1・サフィ -1 = レアで 2/2) と
 *   金のアミュレット (Gold Amulet、Lv35、暗黙 レアリティ。枠を変えない首飾りで一番上のレベル、暗黙のタグ drop は狙いにもキャスターのカタリストにも関係しない)。
 *   どちらも ilvl 82。置き場は同じ Amulets (PROBE で重みの合計まで同じと確かめる)。
 * 始め: 白 (ノーマル) → 錬金 (レア 4 MOD。不在は必ず 2/2 で満杯)。錬金の代金も入れる。ベースの代金は 0。
 * 狙い (サフィックス): 全てのスペルスキルのレベル T1 (+3、GlobalIncreaseSpellSkillGemLevel の 3 段目、ilvl 75、重み 100)
 *   と キャストスピード T2 以上 (IncreasedCastSpeed の上 2 段 = 22–28%、ilvl 60 / 66、重み 800 ずつ)。プレフィックスは何でもよい。
 *   同じ系統の低い段 (+1・+2、キャスト 21% 以下) は外れ (系統が埋まって狙いが付かない)。
 * 打ち方 (状態だけで決まる。どのベースにも同じ決まり):
 *   chaos = カオスだけ。
 *   exalt = サフィックスに空きがある → 右側の高貴のお告げ + 上級の高貴。満杯で未完成 → 消去 (お告げ無し。プレフィックスに当たれば空くだけ)。
 *   cat   = exalt と同じだが、高貴の前に歯擦音のカタリスト (キャスター) で品質 20% まで上げ、触媒の高貴のお告げも掛ける
 *           (キャスターのタグ = スペルレベル・キャストスピードの重みが 5 倍、E-32。品質は高貴で全部消えるので毎回上げ直す)。
 *   frac  = スペル T1 までカオス → フラクチャー → 固定がスペル T1 なら exalt の手、ほかなら白から作り直す (下の nextMove)。
 * 値段: data-cache/boot/boot-2026-10-22.json (自分のサーバーの /boot.json の写し、2026-10-22T04:00Z、Forbidden Rites、高貴建て。神 = 781.93)。
 */
import fs from "node:fs";
import { bundleEntry } from "../_bundle-ts.mjs";
import { costOf as costWith, counter, headLine, mean, summarize } from "./_ev-common.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const data = M.loadPatch();
const N = Number(process.argv[2] ?? 2000);
const SEED = Number(process.argv[3] ?? 1);
const WAYS = (process.argv[4] ?? "chaos,exalt,cat,frac").split(",");
const BASES = { absent: "Absent Amulet", gold: "Gold Amulet" };
const PICK = (process.argv[5] ?? "absent,gold").split(",");
const BUDGET = Number(process.env.BUDGET ?? 0);
const LIMIT = 400000; // 1 人の手の上限 (堂々巡りの見張り)

const BOOT = process.env.BOOT ?? "data-cache/boot/boot-2026-10-22.json";
const ROW = new Map(JSON.parse(fs.readFileSync(BOOT, "utf8")).market.items.map((x) => [x.Text, x.CurrentPrice]));
const EN = {
  alchemy: "Orb of Alchemy", chaos: "Chaos Orb", annul: "Orb of Annulment", exalt_greater: "Greater Exalted Orb", divine: "Divine Orb",
  OmenofDextralExaltation: "Omen of Dextral Exaltation", OmenofCatalysingExaltation: "Omen of Catalysing Exaltation", catalyst_caster: "Sibilant Catalyst", fracture: "Fracturing Orb",
};
const PRICES = Object.fromEntries(Object.entries(EN).map(([k, en]) => {
  const p = ROW.get(en);
  if (!(p > 0)) throw new Error(`値段が無い: ${en}`);
  return [k, p];
}));
const costOf = (n) => costWith(n, PRICES);

const SP = "Amulets/GlobalIncreaseSpellSkillGemLevel", CS = "Amulets/IncreasedCastSpeed";
const SP_MIN = data.mods.get(SP).tiers.length - 1; // T1 = 3 段目 (index 2)
const CS_MIN = data.mods.get(CS).tiers.length - 2; // T2 以上 = index 4・5
const isSp = (m) => m.modId === SP && m.tierIndex >= SP_MIN;
const isCs = (m) => m.modId === CS && m.tierIndex >= CS_MIN;
const isAim = (m) => isSp(m) || isCs(m);
const held = (it) => (it.suffixes.some(isSp) ? 1 : 0) + (it.suffixes.some(isCs) ? 1 : 0);

function start(base, rng) {
  const it = M.startFrom(data, base, 82, {}, Math.floor(rng() * 2 ** 31));
  return it;
}

const allOf = (it) => [...it.prefixes, ...it.suffixes];
const fracOf = (it) => allOf(it).find((m) => m.fractured);
/**
 * 次の手 (null = 完成)。frac = スペル T1 をフラクチャーで守る:
 *   フラクチャーがまだ無い間はカオス (錬金の 4 MOD のまま回るので、いつでもフラクチャーを打てる)。
 *   スペル T1 が付いたらフラクチャーのオーブ (4 MOD から等しく 1 つ、E-40・E-42)。
 *   固定がスペル T1 に付いた後は exalt と同じ (右側の高貴 + 上級 / 満杯なら消去。スペル T1 はもう消えない)。
 *   固定がほかの MOD に付いた (3/4) → 白から作り直す (守れないスペル T1 を持ったまま消去を続けるより安い。FRAC_KEEP=1 で作り直さず続ける)
 */
const FRAC_KEEP = !!process.env.FRAC_KEEP;
function nextMove(way, it, cap) {
  if (held(it) === 2) return null;
  if (way === "chaos") return "chaos";
  if (way === "frac") {
    const f = fracOf(it);
    if (!f) return it.suffixes.some(isSp) && allOf(it).length >= 4 ? "fracture" : "chaos";
    if (!isSp(f) && !FRAC_KEEP) return "restart";
  }
  return it.suffixes.length < cap ? "exalt" : "annul";
}

function runOne(way, base, rng) {
  let it = start(base, rng);
  const n = {};
  const apply = counter(M, data, n);
  const use = (cur, omens = [], hint = {}) => { it = apply(it, cur, rng, omens, hint).item; };
  use("alchemy");
  const cap = capOf(it);
  let steps = 0, lostAll = 0, lostSp = 0, restarts = 0, fracSp = 0;
  for (let mv = nextMove(way, it, cap); mv; mv = nextMove(way, it, cap)) {
    if (++steps > LIMIT || (BUDGET > 0 && costOf(n) > BUDGET)) return { done: false, n, lostAll, lostSp, restarts, fracSp };
    const before = held(it), hadSp = it.suffixes.some(isSp);
    if (mv === "restart") { it = start(base, rng); use("alchemy"); restarts++; continue; }
    if (mv === "fracture") { use("fracture"); if (isSp(fracOf(it))) fracSp++; continue; }
    if (mv === "chaos") use("chaos");
    else if (mv === "annul") use("annul");
    else if (way === "cat") {
      while (!(it.qualityTag === "caster" && it.quality >= 20)) use("catalyst_caster", [], { oneCatalyst: true });
      use("exalt_greater", ["OmenofCatalysingExaltation", "OmenofDextralExaltation"]);
    } else use("exalt_greater", ["OmenofDextralExaltation"]);
    if (before > 0 && held(it) === 0) lostAll++;
    if (hadSp && !it.suffixes.some(isSp)) lostSp++;
  }
  return { done: true, n, lostAll, lostSp, restarts, fracSp };
}

/** レアのサフィックスの枠 (暗黙の ±N 込み)。空にしたレアに右側の高貴を打って、付けられた数を数える (台本に決め打ちしない、E-24) */
function capOf(it) {
  let x = { ...it, prefixes: [], suffixes: [] }, k = 0;
  const rng = M.mulberry32(1);
  for (; k < 6; k++) { const r = M.applyCurrency(data, x, "exalt", rng, ["OmenofDextralExaltation"]); if (!r.applied) break; x = r.item; }
  return k;
}

if (process.env.PROBE) {
  const K = N;
  const floors = { chaos: M.orbFloor("chaos", "base"), exalt_greater: M.orbFloor("exalt", "greater") };
  const boost = { test: (m) => (m.tags ?? []).includes("caster"), mult: 5 };
  for (const [key, base] of Object.entries(BASES)) {
    const rng = M.mulberry32(SEED);
    const fresh = M.applyCurrency(data, start(base, rng), "alchemy", rng).item;
    const empty = { ...fresh, prefixes: [], suffixes: [] };
    console.log(`\n=== ${base} (サフィックスの枠 ${capOf(fresh)})`);
    // 重みの割合 (空のレア。どの MOD も付いていない時の 1 つの MOD の引き)
    for (const [k, f] of Object.entries(floors)) for (const b of k === "chaos" ? [null] : [null, boost]) {
      const cs = M.candidates(data, empty, ["prefix", "suffix"], f, b ? { boost: b } : {});
      const all = cs.reduce((a, c) => a + c.w, 0), suf = cs.filter((c) => c.side === "suffix").reduce((a, c) => a + c.w, 0);
      const w = (id, min) => cs.find((c) => c.mod.id === id)?.tiers.filter((t) => t.index >= min).reduce((a, t) => a + t.w, 0) ?? 0;
      const sp = w(SP, SP_MIN), csw = w(CS, CS_MIN);
      console.log(`  ${k}${b ? " + 触媒 20%" : ""} (下限 ${f}): 重み 全部 ${all} / サフィ ${suf}  スペル T1 ${sp} (全部の ${(100 * sp / all).toFixed(3)}%・サフィの ${(100 * sp / suf).toFixed(3)}%)  キャスト T2+ ${csw} (全部の ${(100 * csw / all).toFixed(2)}%・サフィの ${(100 * csw / suf).toFixed(2)}%)`);
    }
    // エンジンで K 回: 錬金直後からカオス 1 回 / キャスト T2+ を持ちほか外れで満杯からカオス 1 回 / キャスト T2+ を持ちサフィに空き 1 つから右側の高貴 1 回
    const tryK = (mk, cur, omens, hint = {}) => {
      let sp = 0, cs = 0, both = 0;
      for (let i = 0; i < K; i++) {
        const r = M.applyCurrency(data, mk(), cur, rng, omens, hint);
        if (!r.applied) throw new Error(r.reason);
        const s = r.item.suffixes;
        if (s.some(isSp)) sp++;
        if (s.some(isCs)) cs++;
        if (held(r.item) === 2) both++;
      }
      return `スペル T1 ${(100 * sp / K).toFixed(3)}%  キャスト T2+ ${(100 * cs / K).toFixed(2)}%  両方 ${(100 * both / K).toFixed(3)}%`;
    };
    const csMod = (r) => M.makeStageMod(data.mods.get(CS), "suffix", 5, r);
    const noAim = () => { let x; do x = M.applyCurrency(data, start(base, rng), "alchemy", rng).item; while (x.suffixes.some(isAim)); return x; };
    const castFull = () => { // キャスト T1 + 外れで満杯 (錬金の 4 MOD の形のまま、サフィの 1 つをキャスト T1 に替える)
      let x; do x = M.applyCurrency(data, start(base, rng), "alchemy", rng).item; while (!x.suffixes.length || x.suffixes.some(isAim) || x.suffixes.some((m) => m.modId === CS));
      const s = [...x.suffixes]; s[0] = csMod(rng);
      return { ...x, suffixes: s };
    };
    const castOpen = () => ({ ...empty, suffixes: [csMod(rng)] });
    console.log(`  カオス 1 回 (錬金直後・狙い無し): ${tryK(noAim, "chaos", [])}`);
    console.log(`  カオス 1 回 (キャスト T1 + 外れ、錬金の 4 MOD の形): ${tryK(castFull, "chaos", [])}`);
    console.log(`  右側の高貴 + 上級 1 回 (キャスト T1 だけ、サフィに空き): ${tryK(castOpen, "exalt_greater", ["OmenofDextralExaltation"])}`);
    const castOpenQ = () => ({ ...castOpen(), quality: 20, qualityTag: "caster" });
    console.log(`  同じ + 触媒 (キャスター 20%): ${tryK(castOpenQ, "exalt_greater", ["OmenofCatalysingExaltation", "OmenofDextralExaltation"])}`);
  }
  process.exit(0);
}

console.log(`値段 ${BOOT} (神 = ${PRICES.divine.toFixed(2)} 高貴): ${Object.entries(PRICES).map(([k, v]) => `${k} ${v.toFixed(1)}`).join("  ")}`);
const KEYS = ["alchemy", "chaos", "fracture", "annul", "exalt_greater", "OmenofDextralExaltation", "OmenofCatalysingExaltation", "catalyst_caster"];
for (const way of WAYS) for (const key of PICK) {
  const base = BASES[key];
  const t0 = Date.now();
  const rng = M.mulberry32(SEED);
  const rs = Array.from({ length: N }, () => runOne(way, base, rng));
  const s = summarize(rs, costOf);
  console.log(`\n=== ${way} / ${base} (${N} 人, seed ${SEED}, ${((Date.now() - t0) / 1000).toFixed(0)} 秒, 打ち止め ${BUDGET || "無し"})`);
  console.log(headLine(s, N) + `  99% ${s.costs[Math.floor(0.99 * s.costs.length)]?.toFixed(1)}`);
  // 打ち止め無しで回した時、その予算までに完成していた人の割合 (完成率の目安)
  console.log(`  予算までに完成: ${[250, 500, 1000, 2000, 5000].map((b) => `${b} 神 ${(100 * s.costs.filter((c) => c <= b).length / N).toFixed(1)}%`).join("  ")}`);
  for (const k of KEYS) {
    const c = mean(s.done.map((r) => r.n[k] ?? 0));
    if (c) console.log(`  ${k.padEnd(28)} ${c.toFixed(2).padStart(10)} 個  ${(c * PRICES[k] / PRICES.divine).toFixed(2).padStart(9)} 神`);
  }
  console.log(`  狙いが全部消えた ${mean(s.done.map((r) => r.lostAll)).toFixed(2)} 回  スペル T1 が消えた ${mean(s.done.map((r) => r.lostSp)).toFixed(2)} 回` + (way === "frac" ? `  作り直し ${mean(s.done.map((r) => r.restarts)).toFixed(2)} 回  スペル T1 が固定になった人 ${(100 * mean(s.done.map((r) => (r.fracSp ? 1 : 0)))).toFixed(1)}%` : ""));
}
