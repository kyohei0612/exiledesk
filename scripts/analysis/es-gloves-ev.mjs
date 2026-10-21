/**
 * es-gloves-ev.mjs — ES の手袋 (知性、ilvl 82) のプレフィックス 3 つを、金の指輪の打ち方 C を左右逆にした形でエンジンに打たせる (解析君、2026-10-21)。
 * 結果は docs/org/math/notes/2026-10-21-es-gloves-ev.md
 *
 *   [ORB=exalt|exalt_greater|exalt_perfect] [RUNE="Serle's Triumph,Kolr's Hunt"] [BUDGET=2000] node scripts/analysis/es-gloves-ev.mjs [N=300] [SEED=1]
 *
 * 打つのは全部エンジンの入口 (applyCurrency)。台本は次の手を決めるだけ (nextMove)。
 * ベース: サイレーンスケイルの手袋 (Sirenscale Gloves、ES 54・レベル 80、知性の手袋で ilvl 82 の一番上の ES)。
 * 始め: サフィックスに投射物スキルのレベル +2 (Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level の 2 段目、レベル 65) をフラクチャー
 *   (普通の置き場に無く startFrom が断るので makeStageMod で置く) + 上級の高貴 1 個の乱数の MOD (費用 0)。
 * 狙い (プレフィックス): 最大 ES (ローカル固定) T2+ / ES 増加 % (ローカル) T2+ / 最大マナ T2+。サフィックスは何でもよい。
 * 打ち方: 狙いが無い → カオス。狙いがあって外れのプレフィックス (狙いの系統の低い段も) がある → 消去 (お告げ無し)。
 *   足りない狙い → 左側の高貴 + ORB (カタリストは指輪・アミュレットだけなので手袋では打てない。触媒の高貴も品質が無いので打てない)
 */
import { bundleEntry } from "../_bundle-ts.mjs";
import { costOf as costIn, counter, headLine, mean, PRICES as BOOT, summarize } from "./_ev-common.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const N = Number(process.argv[2] ?? 300);
const SEED = Number(process.argv[3] ?? 1);
const ORB = process.env.ORB ?? "exalt_greater";
const BUDGET = Number(process.env.BUDGET ?? 2000);
/**
 * RUNE="Serle's Triumph,Kolr's Hunt" など (カンマ区切り): 始めにソケットをルーンの数だけ + ルーンを差す (サム 10-21)。ルーン代は費用に入れない (値段を別に書く)。
 * コルの狩りを差すとマークスマン MOD が置き場に入るので、投射物 +2 は startFrom でフラクチャー済みに付けられる (無い時は makeStageMod で置く)
 */
const RUNES = process.env.RUNE ? process.env.RUNE.split(",") : [];
const RUNE = RUNES.join(" + ") || null;
const LIMIT = 20000;
const data = M.loadPatch();

// 値段は _ev-common の /boot.json (2026-10-20)。サフィックスの形 (SUF) で使う物は下で足す
const PRICES = { ...BOOT };
const DIV = PRICES.divine;
const BASE = "Sirenscale Gloves";
const PROJ = data.mods.get("Gloves_int/Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level");
const T = { F: "Gloves_int/LocalEnergyShield", P: "Gloves_int/LocalEnergyShieldPercent", M: "Gloves_int/IncreasedMana" };
const KEYS = Object.keys(T);
const need = (k, m) => m.modId === T[k] && m.tierIndex >= data.mods.get(m.modId).tiers.length - 2;
const isTarget = (m) => KEYS.some((k) => need(k, m));
const has = (it, k) => it.prefixes.some((m) => need(k, m));

function start(rng) {
  const kolr = RUNES.includes("Kolr's Hunt");
  let it = M.startFrom(data, BASE, 82, { rarity: "rare", ...(RUNES.length ? { sockets: RUNES.length, runes: RUNES } : {}), ...(kolr ? { mods: [{ mod: PROJ.id, tier: "T1", fractured: true }] } : {}) }, Math.floor(rng() * 2 ** 31));
  if (!kolr) it = M.withMod(it, { ...M.makeStageMod(PROJ, "suffix", 1, rng), fractured: true });
  return M.applyCurrency(data, it, "exalt_greater", rng).item;
}

function nextMove(it) {
  const got = KEYS.filter((k) => has(it, k));
  if (got.length === KEYS.length) return null;
  if (!got.length) return { kind: "chaos" };
  if (it.prefixes.some((m) => !m.fractured && !isTarget(m))) return { kind: "annul" };
  return { kind: "exalt" };
}

const costOf = (n) => costIn(n, PRICES);

function runOne(rng) {
  let it = start(rng);
  const n = {};
  let steps = 0, lostAll = 0, wasted = 0;
  const apply = counter(M, data, n);
  const use = (cur, omens = []) => { const r = apply(it, cur, rng, omens); it = r.item; return r; };
  for (let mv = nextMove(it); mv; mv = nextMove(it)) {
    if (++steps > LIMIT || (BUDGET > 0 && costOf(n) > BUDGET)) return { done: false, n, lostAll, wasted };
    const before = KEYS.filter((k) => has(it, k)).length;
    if (mv.kind === "chaos") use("chaos");
    else if (mv.kind === "annul") {
      const r = use("annul");
      // 消去がサフィックス (カオスの時に付いた物) に当たって外れのプレフィックスが残った回数
      if (r.removed?.every((m) => m.side === "suffix")) wasted++;
    } else use(ORB, ["OmenofSinistralExaltation"]);
    const after = KEYS.filter((k) => has(it, k)).length;
    if (before > 0 && after === 0) lostAll++;
  }
  return { done: true, n, lostAll, wasted, suffixes: it.suffixes.length };
}

/**
 * SUF=X|Y (サム 10-21、ES 手袋のサフィックス): コルの狩りだけ差す (セールの凱旋は無し = サフィックス 3 枠)。始め = プレフィックス 3 つ (ES 固定・ES%・最大マナ、T2 で置く)
 * + 投射物 +2 (F)。X = クリティカルヒット率 T2+ (マークスマン) + クリティカルダメージボーナス T2+。Y = クリダメ T2+ + アーケインサージ (冒涜、保存された肋骨)。
 * ANNUL=plain: 外れはお告げ無しの消去 (プレフィックスに当たったら、消えた狙いを左側の高貴 + 上級で作り直す・外れのプレフィックスも消去)。
 * ANNUL=dextral: 外れのサフィックスは右側の消去のお告げ + 消去 (サフィックスだけ)。足すのは右側の高貴 + 上級。カオスは使わない。
 * ANNUL=light: 外れが冒涜 MOD なら光のお告げ + 消去 (冒涜 MOD だけ消える)、それ以外の外れは右側の消去のお告げ + 消去。
 * ANNUL=whittle (オーナー 10-21「削減とか、下限 T2 付いてる前提でカオスのサフィ試してな」): 外れのサフィックスは 削減のお告げ + CHAOS (chaos / chaos_greater / chaos_perfect)
 *   = 一番 MOD レベルの低い非固定の MOD を消して 1 つ足す。冒涜の外れは光のお告げ + 消去。消えたプレフィックスは左側の高貴 + 上級で作り直し、外れのプレフィックスは素の消去
 * EXS=exalt_greater|exalt_perfect: サフィックスの狙い (クリダメ) を足す高貴 (既定 上級)。案 1 (オーナー 10-21) = ANNUL=light ECHO=1 EXS=... (クリダメが付いてから冒涜)
 * ANNUL=bait (案 2): 外れのサフィックスは 削減 + CHAOS で入れ替え続ける。次の削減が狙い (プレ・クリダメ) を消す並び (一番レベルの低い非固定の MOD が狙い) の時は、
 *   先に 右側の結晶化 + 拡張の合金 (サフィックス、MOD レベル 25) で外れのサフィックスを餌に替えてから削減する。冒涜の外れは光のお告げ + 消去
 * PTIER=T1: 始めのプレフィックス 3 つを T1 で置く (既定 T2。削減で消えるかは MOD レベルで決まるので、その感度を見る)
 * ECHO=1: 発現の 3 つにアーケインサージが無ければ、深淵の反響のお告げで 1 回だけ引き直す (エンジンの 2 組目の候補)
 * 冒涜: プレフィックスが 3 つ埋まった時だけ (未発現の枠はサフィックスに入る)。発現は 3 つの候補にアーケインサージがあればそれ、無ければ 1 番 (外れ → 消去)
 */
const BAIT = "essence:perfect:Gloves_int/PerfectEssence_RemnantPickupRadius"; // 拡張の合金 (サフィックス、MOD レベル 25)
if (process.env.SUF) {
  const SUFK = process.env.SUF, AN = process.env.ANNUL ?? "plain";
  Object.assign(PRICES, { desecrate: 6.749, OmenofDextralExaltation: 35.576, OmenofDextralAnnulment: 9408.082, OmenofLight: 6730.815, OmenofAbyssalEchoes: 61.603 });
  const ECHO = !!process.env.ECHO;
  const CHAOS = process.env.CHAOS ?? "chaos";
  Object.assign(PRICES, { OmenofWhittling: 8789.335, chaos_greater: 215.419, chaos_perfect: 5299.748, OmenofDextralCrystallisation: 274.322, [BAIT]: 116.499 });
  const EXS = process.env.EXS ?? "exalt_greater";
  const S = SUFK === "X"
    ? { CC: { id: "Gloves_int/Rune_marksman_CriticalStrikeChanceIncrease", down: 2 }, CD: { id: "Gloves_int/CriticalStrikeMultiplier", down: 2 } }
    : { CD: { id: "Gloves_int/CriticalStrikeMultiplier", down: 2 }, AS: { id: "Gloves_int/ArcaneSurgeOnCrit", down: 1, desecrated: true } };
  const okS = (m) => Object.values(S).some((s) => m.modId === s.id && !m.unrevealed && m.tierIndex >= data.mods.get(s.id).tiers.length - s.down);
  const hasS = (it, k) => it.suffixes.some((m) => m.modId === S[k].id && okS(m));
  const startS = (rng) => M.startFrom(data, BASE, 82, { rarity: "rare", sockets: 1, runes: ["Kolr's Hunt"],
    mods: [{ mod: PROJ.id, tier: "T1", fractured: true }, ...KEYS.map((k) => ({ mod: T[k], tier: process.env.PTIER ?? "T2" }))] }, Math.floor(rng() * 2 ** 31));
  const nextS = (it) => {
    if (it.suffixes.some((m) => m.unrevealed)) return { kind: "reveal" };
    const pMiss = KEYS.filter((k) => !has(it, k)), sMiss = Object.keys(S).filter((k) => !hasS(it, k));
    if (!pMiss.length && !sMiss.length) return null;
    if (AN === "bait") {
      const junkD = it.suffixes.some((m) => m.desecrated && !okS(m));
      if (junkD) return { kind: "annulS" };
      if (it.prefixes.some((m) => !isTarget(m))) return { kind: "annulP" };
      if (pMiss.length) return { kind: "exaltP" };
      if (it.suffixes.some((m) => !m.fractured && !okS(m))) return { kind: "wspam" };
      if (sMiss.includes("CD")) return { kind: "exaltS" };
      return { kind: "desecrate" };
    }
    // 削減の時は外れのプレフィックスを先に (削減は一番レベルの低い物を消すので、外れのプレが残っているとそちらを消して堂々巡りになる)
    if (AN === "whittle" && it.prefixes.some((m) => !isTarget(m))) return { kind: "annulP" };
    if (it.suffixes.some((m) => !m.fractured && !okS(m))) return { kind: "annulS" };
    if (it.prefixes.some((m) => !isTarget(m))) return { kind: "annulP" };
    if (pMiss.length) return { kind: "exaltP" };
    const k = sMiss[0];
    return S[k].desecrated ? { kind: "desecrate" } : { kind: "exaltS" };
  };
  const runS = (rng) => {
    let it = startS(rng);
    const n = {};
    let steps = 0, pLost = 0, sLost = 0;
    let bait = 0;
    const wh = { j: 0, s: 0, p: 0, pj: 0 }; // 削減で消えた物: 外れのサフィ / サフィの狙い / プレの狙い / 外れのプレ
    const apply = counter(M, data, n, (cur) => (cur.startsWith("reveal") ? "reveal" : cur));
    const use = (cur, omens = [], r2 = rng) => { const r = apply(it, cur, r2, omens); it = r.item; return r; };
    for (let mv = nextS(it); mv; mv = nextS(it)) {
      if (++steps > LIMIT || (BUDGET > 0 && costOf(n) > BUDGET)) return { done: false, n, pLost, sLost, wh, bait };
      let r;
      if (mv.kind === "reveal") {
        const seed = Math.floor(rng() * 2 ** 31);
        const offers = M.revealOffers(data, it, M.mulberry32(seed));
        const i = offers.first.findIndex((m) => m.modId === S.AS?.id);
        const j = offers.reroll.findIndex((m) => m.modId === S.AS?.id);
        if (i >= 0 || !ECHO) r = use(`reveal:${i >= 0 ? i + 1 : 1}`, [], M.mulberry32(seed));
        else r = use(`reveal:${j >= 0 ? j + 1 : 1}:reroll`, ["OmenofAbyssalEchoes"], M.mulberry32(seed));
      } else if (mv.kind === "annulS") {
        const junk = it.suffixes.filter((m) => !m.fractured && !okS(m));
        if (AN === "whittle" && !junk.some((m) => m.desecrated)) {
          r = use(CHAOS, ["OmenofWhittling"]);
          const x = r.removed?.[0];
          wh[x && x.side === "prefix" ? (isTarget(x) ? "p" : "pj") : x && okS(x) ? "s" : "j"]++;
        } else r = use("annul", (AN === "light" || AN === "bait") && junk.some((m) => m.desecrated) ? ["OmenofLight"] : AN === "plain" ? [] : ["OmenofDextralAnnulment"]);
      }
      else if (mv.kind === "annulP") r = use("annul");
      else if (mv.kind === "exaltP") r = use("exalt_greater", ["OmenofSinistralExaltation"]);
      else if (mv.kind === "exaltS") r = use(EXS, ["OmenofDextralExaltation"]);
      else if (mv.kind === "wspam") {
        // 削減が消すのは一番 MOD レベルの低い非固定の MOD (エンジンの whittleTargets と同じ数え方: 未発現は 1)
        const free = [...it.prefixes, ...it.suffixes].filter((m) => !m.fractured);
        const lv = (m) => (m.unrevealed ? 1 : m.modLevel);
        const low = Math.min(...free.map(lv));
        const lowest = free.filter((m) => lv(m) === low);
        if (lowest.some((m) => isTarget(m) || okS(m))) {
          r = use(BAIT, ["OmenofDextralCrystallisation"]);
          bait++;
        } else {
          r = use(CHAOS, ["OmenofWhittling"]);
          const x = r.removed?.[0];
          wh[x && x.side === "prefix" ? (isTarget(x) ? "p" : "pj") : x && okS(x) ? "s" : "j"]++;
        }
      }
      else r = use("desecrate");
      for (const m of r.removed ?? []) { if (m.side === "prefix" && isTarget(m)) pLost++; if (m.side === "suffix" && okS(m)) sLost++; }
    }
    return { done: true, n, pLost, sLost, wh, bait };
  };
  const rng = M.mulberry32(SEED);
  const rs = Array.from({ length: N }, () => runS(rng));
  const sum = summarize(rs, costOf), { done } = sum;
  const avg = mean;
  console.log(`=== ES 手袋のサフィックス ${SUFK} / 消去 ${AN}${AN === "whittle" || AN === "bait" ? ` + ${CHAOS}` : ""} / 高貴 ${EXS}${ECHO ? " / 反響で引き直し" : ""} (${N} 人, 打ち止め ${BUDGET} 神)`);
  console.log(headLine(sum, N));
  for (const k of ["annul", "OmenofWhittling", "chaos", "chaos_greater", "chaos_perfect", "OmenofDextralAnnulment", "OmenofLight", "OmenofAbyssalEchoes", "OmenofDextralCrystallisation", BAIT, "exalt_greater", "exalt_perfect", "OmenofDextralExaltation", "OmenofSinistralExaltation", "desecrate", "reveal"]) {
    const c = avg(done.map((r) => r.n[k] ?? 0));
    console.log(`  ${k.padEnd(28)} ${c.toFixed(2).padStart(9)} 個  ${(c * (PRICES[k] ?? 0) / DIV).toFixed(2).padStart(8)} 神`);
  }
  if (AN === "whittle" || AN === "bait") {
    const tot = { j: 0, s: 0, p: 0, pj: 0 };
    for (const r of rs) for (const k of Object.keys(tot)) tot[k] += r.wh[k];
    const all = Object.values(tot).reduce((x, y) => x + y, 0) || 1;
    console.log(`  削減が消した物 (全員 ${all} 回): 外れのサフィ ${(100 * tot.j / all).toFixed(1)}%・クリダメ ${(100 * tot.s / all).toFixed(1)}%・プレの狙い ${(100 * tot.p / all).toFixed(1)}%・外れのプレ ${(100 * tot.pj / all).toFixed(1)}%  1 人あたり削減 ${(all / N).toFixed(1)} 回`);
  }
  if (AN === "bait") console.log(`  餌 (右側の結晶化 + 拡張の合金) 1 人 ${avg(done.map((r) => r.bait)).toFixed(2)} 回 (全員 ${avg(rs.map((r) => r.bait)).toFixed(2)} 回)`);
  if (AN === "whittle" || AN === "bait") console.log(`  削減で消えた物 (1 人平均): 外れのサフィ ${avg(done.map((r) => r.wh.j)).toFixed(2)}・クリダメ ${avg(done.map((r) => r.wh.s)).toFixed(2)}・プレの狙い ${avg(done.map((r) => r.wh.p)).toFixed(2)}・外れのプレ ${avg(done.map((r) => r.wh.pj)).toFixed(2)} 回 (全員 ${avg(rs.map((r) => r.wh.p)).toFixed(2)} 回プレの狙い)`);
  console.log(`  消えた狙い (消去・削減): プレフィックス ${avg(done.map((r) => r.pLost)).toFixed(2)} 回・サフィックス ${avg(done.map((r) => r.sLost)).toFixed(2)} 回`);
  process.exit(0);
}

const t0 = Date.now();
const rng = M.mulberry32(SEED);
const rs = Array.from({ length: N }, () => runOne(rng));
const s = summarize(rs, costOf), { done } = s;
console.log(`=== ES の手袋 / 左側の高貴 + ${ORB}${RUNE ? ` / ルーン ${RUNE}` : ""} (${N} 人, ${((Date.now() - t0) / 1000).toFixed(0)} 秒, 打ち止め ${BUDGET} 神)`);
console.log(headLine(s, N));
for (const k of ["chaos", "annul", ORB, "OmenofSinistralExaltation"]) {
  const c = mean(done.map((r) => r.n[k] ?? 0));
  console.log(`  ${k.padEnd(28)} ${c.toFixed(2).padStart(9)} 個  ${(c * PRICES[k] / DIV).toFixed(2).padStart(8)} 神`);
}
console.log(`  狙いが全部消えた ${mean(done.map((r) => r.lostAll)).toFixed(2)} 回  消去がサフィックスに当たった ${mean(done.map((r) => r.wasted)).toFixed(2)} 回  完成時の非固定のサフィックス ${mean(done.map((r) => r.suffixes - 1)).toFixed(2)} 個`);
