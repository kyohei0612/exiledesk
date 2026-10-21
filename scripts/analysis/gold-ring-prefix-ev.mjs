/**
 * gold-ring-prefix-ev.mjs — 金の指輪の見本 (サフィックス 3 つ済み・P1 スペルダメージ T2 フラクチャー) のプレフィックス側で、
 * P2 = アイテムレアリティ (プレフィックス Rings/ItemFoundRarityIncreasePrefix) T1 を付けるまでの道を比べる (解析君、2026-10-22、ブラック 4 代目の頼み)。
 * 結果は docs/org/math/notes/2026-10-22-gold-ring-prefix.md
 *
 *   [BUDGET=2000] node scripts/analysis/gold-ring-prefix-ev.mjs [N=2000] [SEED=1]
 *
 * 打つのは全部エンジンの入口 (applyCurrency)。台本は次の手を決めるだけ。
 * 始め: 金の指輪 ilvl 82 レア。サフィックス = レアリティ T1・キャストスピード T2・全耐性 T2 (見本の「T2 以上」の下限で置く)、
 *   プレフィックス = スペルダメージ T2 (創生の樹、重み 0 なので makeStageMod で置く) をフラクチャー。費用 0。
 * 道 (P3 の冒涜は回さない):
 *   1  = 左側の高貴のお告げ + 上級の高貴 → 外れなら 左側の抹消のお告げ + 完全のカオス を当たるまで (シミュ部長の案)
 *   2  = 素の高貴 → 削減のお告げ + 完全のカオス を当たるまで (オーナーの言葉の読み。削減 = Omen of Whittling)。
 *        削減は「一番 MOD レベルの低い非固定の MOD」を消すので、サフィックスの狙いを消したらそこで「壊れた」として止める (やり直しは数えない)
 *   2b = 素の高貴 → 左側の抹消のお告げ + 完全のカオス を当たるまで (2 の「左側」を抹消と読んだ物)
 *   2c = 素の高貴 → 左側の抹消 + 削減 + 完全のカオス を当たるまで (「左側で削減」をそのまま 2 枚と読んだ物)
 */
import { bundleEntry } from "../_bundle-ts.mjs";
import { costOf as costIn, counter, headLine, mean, summarize } from "./_ev-common.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const N = Number(process.argv[2] ?? 2000);
const SEED = Number(process.argv[3] ?? 1);
const BUDGET = Number(process.env.BUDGET ?? 2000);
const LIMIT = 20000;
const data = M.loadPatch();

/** 自分のサーバーの /boot.json (2026-10-22 に取得、中の時刻 2026-10-21T17:00:49Z、Forbidden Rites、高貴建て。神 = 807.07) */
const PRICES = {
  divine: 807.074, exalt: 1, exalt_greater: 13.380, chaos_perfect: 5922.686,
  OmenofSinistralExaltation: 90.130, OmenofSinistralErasure: 16063.627, OmenofWhittling: 11035.036,
};
const costOf = (n) => costIn(n, PRICES);

const SD = data.mods.get("Rings/Special_genesis_tree_caster_SpellDamage");
const P2 = "Rings/ItemFoundRarityIncreasePrefix";
const SUFS = [["Rings/ItemFoundRarityIncrease", "T1"], ["Rings/IncreasedCastSpeed", "T2"], ["Rings/AllResistances", "T2"]];
const top = (id, down) => (m) => m.modId === id && m.tierIndex >= data.mods.get(id).tiers.length - down;
const hit = (it) => it.prefixes.some(top(P2, 1));
const sufOk = (it) => SUFS.every(([id, t]) => it.suffixes.some(top(id, Number(t.slice(1)))));

function start(rng) {
  const it = M.startFrom(data, "Gold Ring", 82, { rarity: "rare", mods: SUFS.map(([mod, tier]) => ({ mod, tier })) }, Math.floor(rng() * 2 ** 31));
  return M.withMod(it, { ...M.makeStageMod(SD, "prefix", SD.tiers.length - 2, rng), fractured: true });
}

const ROUTES = {
  1: { first: ["exalt_greater", ["OmenofSinistralExaltation"]], spam: ["chaos_perfect", ["OmenofSinistralErasure"]] },
  2: { first: ["exalt", []], spam: ["chaos_perfect", ["OmenofWhittling"]] },
  "2b": { first: ["exalt", []], spam: ["chaos_perfect", ["OmenofSinistralErasure"]] },
  "2c": { first: ["exalt", []], spam: ["chaos_perfect", ["OmenofSinistralErasure", "OmenofWhittling"]] },
};

function runOne(rng, route) {
  let it = start(rng);
  if (!sufOk(it) || it.prefixes.length !== 1) throw new Error("始めの形が違う");
  const n = {};
  const apply = counter(M, data, n);
  const removed = {};
  let steps = 0;
  const use = ([cur, omens]) => {
    const r = apply(it, cur, rng, omens);
    for (const x of r.removed ?? []) { const k = `${x.side}:${x.modId.split("/")[1]}`; removed[k] = (removed[k] ?? 0) + 1; }
    it = r.item;
  };
  use(route.first);
  while (!hit(it)) {
    if (!sufOk(it)) return { done: false, broke: true, n, removed };
    if (++steps > LIMIT || (BUDGET > 0 && costOf(n) > BUDGET)) return { done: false, n, removed };
    use(route.spam);
  }
  if (!sufOk(it)) return { done: false, broke: true, n, removed };
  return { done: true, n, removed };
}

const t0 = Date.now();
for (const key of (process.env.ROUTES ?? "1,2,2b,2c").split(",")) {
  const rng = M.mulberry32(SEED);
  const rs = Array.from({ length: N }, () => runOne(rng, ROUTES[key]));
  const s = summarize(rs, costOf), { done } = s;
  const broke = rs.filter((r) => r.broke);
  console.log(`\n=== 道 ${key}: ${ROUTES[key].first[0]}${ROUTES[key].first[1].length ? " + " + ROUTES[key].first[1].join(" + ") : ""} → ${ROUTES[key].spam[1].join(" + ")} + ${ROUTES[key].spam[0]} (${N} 人, 打ち止め ${BUDGET} 神)`);
  console.log(headLine(s, N) + `  壊れた (サフィの狙いが消えた) ${(100 * broke.length / N).toFixed(1)}%  打ち止め ${N - done.length - broke.length} 人`);
  for (const k of ["exalt", "exalt_greater", "OmenofSinistralExaltation", "chaos_perfect", "OmenofSinistralErasure", "OmenofWhittling"]) {
    const c = mean(done.map((r) => r.n[k] ?? 0));
    if (c) console.log(`  ${k.padEnd(28)} ${c.toFixed(2).padStart(8)} 個  ${(c * PRICES[k] / PRICES.divine).toFixed(2).padStart(8)} 神 (完成した人)`);
  }
  const tot = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.removed)) tot[k] = (tot[k] ?? 0) + v;
  const all = Object.values(tot).reduce((a, b) => a + b, 0) || 1;
  console.log(`  消えた物 (全員): ${Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / all).toFixed(1)}%`).join("・")}`);
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
