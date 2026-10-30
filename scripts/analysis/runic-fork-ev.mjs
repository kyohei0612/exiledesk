/**
 * runic-fork-ev.mjs — ルーニックフォーク (Runic Fork、Lv65 のワンド) にキャスター向けの狙いを、エンジンの入口 (applyCurrency) だけで
 * 打たせて費用を数える (解析係、2026-10-31、記事編集長の頼み = ブログ runic-fork (11-09))。
 * 結果は docs/org/math/notes/2026-10-31-runic-fork.md
 *
 *   [BUDGET=0] node scripts/analysis/runic-fork-ev.mjs [N=2000] [SEED=1] [打ち方,…=chaos,exalt,ess] [ベース,…=fork]
 *   PROBE=1 node scripts/analysis/runic-fork-ev.mjs [K=200000] [SEED=1]   … ワンド 4 本の置き場の比べと、1 回で狙いが付く割合
 *
 * ベース: ルーニックフォーク (ilvl 82、ベースの代金は 0)。比べに ルーンマスターのルーニックフォーク・決闘のワンド・捻じれたワンド も回せる
 *   (PROBE でエンジンの候補が 4 本とも同じと確かめる)。
 * 始め: 白 (ノーマル) → 錬金 (レア 4 MOD)。錬金の代金も入れる。
 * 狙い (プレとサフィにまたがる):
 *   プレ = スペルダメージ T2 以上 (Wands/WeaponSpellDamage の上 2 段 = Glyphic 90–104% / Runic 105–119%、MOD レベル 70 / 80、重み 100 / 50)
 *   サフィ = 全てのスペルスキルのレベル +3 以上 (Wands/GlobalIncreaseSpellSkillGemLevelWeapon の上 2 段 = +3 / +4、MOD レベル 55 / 78、重み 100 / 50。
 *            または 魔法のパーフェクトエッセンス の +3 = Wands/PerfectEssence_IncreaseSocketedGemLevel)
 *   同じ系統の低い段 (スペル +1・+2、スペルダメージ 89% 以下) は外れ。ほかの MOD は何でもよい。
 * 打ち方 (状態だけで決まる):
 *   chaos = カオスだけ。
 *   exalt = 欠けた狙いの側に空き → その側のお告げ (左側 = プレ / 右側 = サフィ) + 上級の高貴 (プレを先)。空きが無い → 消去 (お告げ無し)。
 *   ess   = スペル +3 以上が無い → 魔法のパーフェクトエッセンス (サフィが満杯ならサフィを 1 つ消してから +3、E-51。プレは触らない)。
 *           スペル +3 があってスペルダメージが無い → プレに空きがあれば 左側の高貴のお告げ + 上級の高貴、満杯なら消去 (お告げ無し)。
 *           消去が +3 を消したら、またエッセンス。エッセンスが打てなければ消去。
 * 値段: data-cache/boot/boot-2026-10-22.json (自分のサーバーの /boot.json の写し、2026-10-22T04:00Z、Forbidden Rites、高貴建て。神 = 781.93)。
 */
import fs from "node:fs";
import { bundleEntry } from "../_bundle-ts.mjs";
import { costOf as costWith, counter, headLine, mean, summarize } from "./_ev-common.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const data = M.loadPatch();
const N = Number(process.argv[2] ?? 2000);
const SEED = Number(process.argv[3] ?? 1);
const WAYS = (process.argv[4] ?? "chaos,exalt,ess").split(",");
const BASES = { fork: "Runic Fork", rune: "Runemastered Runic Fork", duel: "Dueling Wand", twist: "Twisted Wand" };
const PICK = (process.argv[5] ?? "fork").split(",");
const BUDGET = Number(process.env.BUDGET ?? 0);
// 1 人の手の上限 (堂々巡りの見張り)。カオスだけは 1 人平均 約 10 万手なので、40 万手だと 2% ほどが止まる → 既定 200 万手
const LIMIT = Number(process.env.LIMIT ?? 2000000);

const BOOT = process.env.BOOT ?? "data-cache/boot/boot-2026-10-22.json";
const ROW = new Map(JSON.parse(fs.readFileSync(BOOT, "utf8")).market.items.map((x) => [x.Text, x.CurrentPrice]));
const ESS = "essence:perfect:Wands/PerfectEssence_IncreaseSocketedGemLevel";
const EN = {
  alchemy: "Orb of Alchemy", chaos: "Chaos Orb", annul: "Orb of Annulment", exalt_greater: "Greater Exalted Orb", divine: "Divine Orb",
  OmenofDextralExaltation: "Omen of Dextral Exaltation", OmenofSinistralExaltation: "Omen of Sinistral Exaltation", ess_sorcery: "Perfect Essence of Sorcery",
};
const PRICES = Object.fromEntries(Object.entries(EN).map(([k, en]) => {
  const p = ROW.get(en);
  if (!(p > 0)) throw new Error(`値段が無い: ${en}`);
  return [k, p];
}));
const costOf = (n) => costWith(n, PRICES);
const keyOf = (cur) => (cur === ESS ? "ess_sorcery" : cur);

const SL = "Wands/GlobalIncreaseSpellSkillGemLevelWeapon", SL_E = "Wands/PerfectEssence_IncreaseSocketedGemLevel", SD = "Wands/WeaponSpellDamage";
const SL_MIN = data.mods.get(SL).tiers.length - 2; // +3 以上 = index 2・3
const SD_MIN = data.mods.get(SD).tiers.length - 2; // T2 以上 = index 6・7
const isSl = (m) => (m.modId === SL && m.tierIndex >= SL_MIN) || m.modId === SL_E;
const isSd = (m) => m.modId === SD && m.tierIndex >= SD_MIN;
const hasSl = (it) => it.suffixes.some(isSl), hasSd = (it) => it.prefixes.some(isSd);
const held = (it) => (hasSl(it) ? 1 : 0) + (hasSd(it) ? 1 : 0);

const start = (base, rng) => M.startFrom(data, base, 82, {}, Math.floor(rng() * 2 ** 31));

/** 次の手 (null = 完成) */
function nextMove(way, it, cap) {
  if (held(it) === 2) return null;
  if (way === "chaos") return "chaos";
  if (way === "ess") {
    if (!hasSl(it)) return "ess";
    return it.prefixes.length < cap.prefix ? "exaltP" : "annul";
  }
  if (!hasSd(it) && it.prefixes.length < cap.prefix) return "exaltP";
  if (!hasSl(it) && it.suffixes.length < cap.suffix) return "exaltS";
  return "annul";
}

function runOne(way, base, rng) {
  let it = start(base, rng);
  const n = {};
  const apply = counter(M, data, n, keyOf);
  const use = (cur, omens = []) => { it = apply(it, cur, rng, omens).item; };
  use("alchemy");
  const cap = capOf(it);
  let steps = 0, lostSl = 0, lostSd = 0, essBlocked = 0;
  for (let mv = nextMove(way, it, cap); mv; mv = nextMove(way, it, cap)) {
    if (++steps > LIMIT || (BUDGET > 0 && costOf(n) > BUDGET)) return { done: false, n, lostSl, lostSd, essBlocked };
    const hadSl = hasSl(it), hadSd = hasSd(it);
    if (mv === "ess") {
      const r = M.applyCurrency(data, it, ESS, rng, []);
      if (r.applied) { n.ess_sorcery = (n.ess_sorcery ?? 0) + 1; it = r.item; } else { essBlocked++; use("annul"); }
    } else if (mv === "chaos") use("chaos");
    else if (mv === "annul") use("annul");
    else if (mv === "exaltP") use("exalt_greater", ["OmenofSinistralExaltation"]);
    else use("exalt_greater", ["OmenofDextralExaltation"]);
    if (hadSl && !hasSl(it)) lostSl++;
    if (hadSd && !hasSd(it)) lostSd++;
  }
  return { done: true, n, lostSl, lostSd, essBlocked };
}

/** レアの枠 (暗黙の ±N 込み)。空にしたレアに左側 / 右側の高貴を打って、付けられた数を数える (台本に決め打ちしない、E-24) */
function capOf(it) {
  const out = {};
  for (const [side, omen] of [["prefix", "OmenofSinistralExaltation"], ["suffix", "OmenofDextralExaltation"]]) {
    let x = { ...it, prefixes: [], suffixes: [] }, k = 0;
    const rng = M.mulberry32(1);
    for (; k < 6; k++) { const r = M.applyCurrency(data, x, "exalt", rng, [omen]); if (!r.applied) break; x = r.item; }
    out[side] = k;
  }
  return out;
}

if (process.env.PROBE) {
  const K = N;
  // (1) ワンド 4 本の比べ: 候補の系統・重み (空のレア、下限 0)、枠、ソケットの上限
  const sig = {};
  for (const [key, base] of Object.entries(BASES)) {
    const rng = M.mulberry32(SEED);
    const fresh = M.applyCurrency(data, start(base, rng), "alchemy", rng).item;
    const cs = M.candidates(data, { ...fresh, prefixes: [], suffixes: [] }, ["prefix", "suffix"], 0, {});
    sig[key] = cs.map((c) => `${c.side}:${c.mod.id}:${c.tiers.map((t) => `${t.index}/${t.w}`).join(",")}`).sort().join("|");
    const imp = (M.htcBaseInfo()[base]?.implicits ?? []).map((i) => i.ja ?? i.en).join(" / ") || "無し";
    console.log(`${base}: 部位 ${fresh.cls.category}・候補 ${cs.length} 系統・重み ${cs.reduce((a, c) => a + c.w, 0)}・枠 ${JSON.stringify(capOf(fresh))}・熟練工のソケット ${M.socketCapOf(base, fresh.cls.category)}・暗黙 ${imp}`);
  }
  console.log(`候補 (系統・段・重み) がルーニックフォークと同じ: ${Object.keys(BASES).map((k) => `${k} ${sig[k] === sig.fork}`).join("  ")}`);
  // (2) 重みの割合 (空のレアから 1 つ引く)
  const rng = M.mulberry32(SEED);
  const fresh = M.applyCurrency(data, start(BASES.fork, rng), "alchemy", rng).item;
  const empty = { ...fresh, prefixes: [], suffixes: [] };
  for (const [k, f] of [["カオス", M.orbFloor("chaos", "base")], ["上級の高貴", M.orbFloor("exalt", "greater")]]) {
    const cs = M.candidates(data, empty, ["prefix", "suffix"], f, {});
    const side = (s) => cs.filter((c) => c.side === s).reduce((a, c) => a + c.w, 0);
    const w = (id, min) => cs.find((c) => c.mod.id === id)?.tiers.filter((t) => t.index >= min).reduce((a, t) => a + t.w, 0) ?? 0;
    const sd = w(SD, SD_MIN), sl = w(SL, SL_MIN), sl4 = w(SL, SL_MIN + 1);
    console.log(`  ${k} (下限 ${f}): プレ ${side("prefix")} / サフィ ${side("suffix")}  スペルダメージ T2+ ${sd} (プレの ${(100 * sd / side("prefix")).toFixed(3)}%)  スペル +3 以上 ${sl} (サフィの ${(100 * sl / side("suffix")).toFixed(3)}%、+4 だけ ${(100 * sl4 / side("suffix")).toFixed(3)}%)`);
  }
  // (3) エンジンで K 回
  const tryK = (mk, cur, omens) => {
    let sl = 0, sd = 0, both = 0, fail = 0;
    for (let i = 0; i < K; i++) {
      const r = M.applyCurrency(data, mk(), cur, rng, omens);
      if (!r.applied) { fail++; continue; }
      if (hasSl(r.item)) sl++;
      if (hasSd(r.item)) sd++;
      if (held(r.item) === 2) both++;
    }
    return `スペル +3 以上 ${(100 * sl / K).toFixed(3)}%  スペルダメージ T2+ ${(100 * sd / K).toFixed(3)}%  両方 ${(100 * both / K).toFixed(4)}%${fail ? `  打てない ${fail}` : ""}`;
  };
  const alch = () => M.applyCurrency(data, start(BASES.fork, rng), "alchemy", rng).item;
  const noAim = () => { let x; do x = alch(); while (held(x) > 0); return x; };
  const slMod = (r) => M.makeStageMod(data.mods.get(SL), "suffix", SL_MIN, r);
  const sdMod = (r) => M.makeStageMod(data.mods.get(SD), "prefix", SD_MIN, r);
  console.log(`  カオス 1 回 (錬金直後・狙い無し): ${tryK(noAim, "chaos", [])}`);
  const sdOnly = () => { let x; do x = alch(); while (!x.prefixes.length || held(x) > 0 || x.prefixes.some((m) => m.modId === SD)); const p = [...x.prefixes]; p[0] = sdMod(rng); return { ...x, prefixes: p }; };
  console.log(`  カオス 1 回 (スペルダメージ T2 + 外れ、錬金の 4 MOD の形) → 完成: ${tryK(sdOnly, "chaos", [])}`);
  console.log(`  上級の高貴 + 左側 1 回 (スペル +3 だけ、プレは空): ${tryK(() => ({ ...empty, suffixes: [slMod(rng)] }), "exalt_greater", ["OmenofSinistralExaltation"])}`);
  console.log(`  上級の高貴 + 右側 1 回 (スペルダメージ T2 だけ、サフィは空): ${tryK(() => ({ ...empty, prefixes: [sdMod(rng)] }), "exalt_greater", ["OmenofDextralExaltation"])}`);
  console.log(`  魔法のパーフェクトエッセンス 1 回 (錬金直後・狙い無し): ${tryK(noAim, ESS, [])}`);
  const sdFull = () => { let x; do x = alch(); while (x.suffixes.length < 3 || held(x) > 0); const p = [...x.prefixes]; p[0] = sdMod(rng); return { ...x, prefixes: p.length ? p : [sdMod(rng)] }; };
  console.log(`  同じ (スペルダメージ T2 + サフィ 3 つ満杯): ${tryK(sdFull, ESS, [])}`);
  process.exit(0);
}

console.log(`値段 ${BOOT} (神 = ${PRICES.divine.toFixed(2)} 高貴): ${Object.entries(PRICES).map(([k, v]) => `${k} ${v.toFixed(1)}`).join("  ")}`);
const KEYS = ["alchemy", "chaos", "annul", "exalt_greater", "OmenofSinistralExaltation", "OmenofDextralExaltation", "ess_sorcery"];
for (const way of WAYS) for (const key of PICK) {
  const base = BASES[key];
  const t0 = Date.now();
  const rng = M.mulberry32(SEED);
  const rs = Array.from({ length: N }, () => runOne(way, base, rng));
  const s = summarize(rs, costOf);
  console.log(`\n=== ${way} / ${base} (${N} 人, seed ${SEED}, ${((Date.now() - t0) / 1000).toFixed(0)} 秒, 打ち止め ${BUDGET || "無し"})`);
  console.log(headLine(s, N) + `  99% ${s.costs[Math.floor(0.99 * s.costs.length)]?.toFixed(1)}`);
  console.log(`  予算までに完成: ${[1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000].map((b) => `${b} 神 ${(100 * s.costs.filter((c) => c <= b).length / N).toFixed(1)}%`).join("  ")}`);
  for (const k of KEYS) {
    const c = mean(s.done.map((r) => r.n[k] ?? 0));
    if (c) console.log(`  ${k.padEnd(28)} ${c.toFixed(2).padStart(10)} 個  ${(c * PRICES[k] / PRICES.divine).toFixed(2).padStart(9)} 神`);
  }
  console.log(`  スペル +3 が消えた ${mean(s.done.map((r) => r.lostSl)).toFixed(2)} 回  スペルダメージ T2+ が消えた ${mean(s.done.map((r) => r.lostSd)).toFixed(2)} 回` + (way === "ess" ? `  エッセンスが打てなかった ${mean(s.done.map((r) => r.essBlocked)).toFixed(2)} 回` : ""));
}
