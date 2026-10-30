/**
 * chaos-same-mod-back.mjs — カオスで消した MOD が同じ 1 回でまた付く割合を数える (計算係、2026-10-31。ブログ「カオスで消した MOD は同じ 1 回でまた付く」の数字)
 *
 *   node scripts/analysis/chaos-same-mod-back.mjs [K=200000] [SEED=7]
 *
 * 決まり: E-30 (カオス = 消す + 付ける。消した MOD と同じ物・同じ段もまた付きうる)。根拠 docs/org/research/notes/2026-10-26-chaos-reroll-same-mod.md。
 * エンジン: check-coe-chaos.mjs と同じ品を startFrom で作り、applyCurrency (本物の打つ処理) で K 回打つ。1 回ごとに消えた MOD と付いた MOD を比べ
 *   (a) 同じ MOD・同じ段 (b) 同じ MOD で別の段 (b') 同じ系統 (family) の別の MOD (c) 別の系統 (d) 何も付かない に分ける。消えた MOD ごとの内訳も出す。
 * CoE: check-coe-chaos.mjs の coePool と同じく、消える MOD ごとに「それを外したアイテム」の getFilteredModPool の重みを CoE のコードで取り、
 *   同じ key (= 同じ段) / 同じ modgroup の別の key / それ以外 の割合を出す。全体は消える MOD を等しく平均 (CoE の poe2_chaos は消す MOD を等しく選ぶ)。
 */
import { createRequire } from "node:module";
import { bundleEntry } from "../_bundle-ts.mjs";

const require = createRequire(import.meta.url);
const COE = require("./_coe-load.cjs");
const M = await bundleEntry("scripts/analysis/_coe-odds-entry.ts");
const K = Number(process.argv[2] ?? 200000);
const SEED = Number(process.argv[3] ?? 7);
const data = M.loadPatch();

COE.run(`var __keyOf = Object.fromEntries(coedata.mods.entries.map((m) => [m.key, m.id]));`);
/** CoE: keys の MOD を付けたアイテムの置き場で、key `back` と同じ物・同じ modgroup の別の段・それ以外の重みの割合 */
function coeBack(itemId, keys, floor, back) {
  COE.said.length = 0;
  try {
    return COE.run(`(() => {
      const emu = new GameEmulator(true); Emulator = emu;
      const item = new GameItem(${itemId}, 82, 0);
      item.rarity = ItemRarity.RARE;
      emu.setItem(item);
      emu.setModpool(ModsManager.categorizeModpool(ModsManager.getModpool(item._classId, true, true)));
      for (const k of ${JSON.stringify(keys)}) item.addModifier(__keyOf[k]);
      const pool = ModsManager.getFilteredModPool(emu._modpool, null, item, ${floor ? `emu.minimumModifier(${floor})` : "new rollAffixParameters"});
      const byId = Object.fromEntries(coedata.mods.entries.map((m) => [String(m.id), m]));
      const me = byId[String(__keyOf[${JSON.stringify(back)}])];
      let same = 0, group = 0;
      for (const [id, w] of Object.entries(pool.raw)) {
        if (String(id) === String(me.id)) same += w;
        else if (byId[id].group == me.group) group += w;
      }
      return [same / pool.totalWeight, group / pool.totalWeight];
    })()`);
  } catch (e) { throw new Error(`CoE: ${e.message} / ${COE.said.join(" | ").slice(0, 300)}`); }
}

/** エンジン: K 回打って、消えた MOD ごとに付いた MOD を分ける */
function engineRun(c, currency) {
  const rng = M.mulberry32(SEED);
  const base = M.startFrom(data, c.base, 82, { rarity: "rare", mods: c.mods.map((m) => ({ mod: m.mod, tier: m.tier, ...(m.fractured ? { fractured: true } : {}) })) }, 3);
  const by = {};
  for (let i = 0; i < K; i++) {
    const r = M.applyCurrency(data, base, currency, rng, []);
    if (!r.applied) throw new Error(r.reason);
    if ((r.removed ?? []).length !== 1 || (r.added ?? []).length > 1) throw new Error(`1 つ消して 1 つ付けるはず: 消 ${r.removed?.length} 付 ${r.added?.length}`);
    const x = r.removed[0], a = r.added?.[0];
    const b = (by[x.modId] ??= { n: 0, same: 0, tier: 0, fam: 0, other: 0, none: 0, x });
    b.n++;
    if (!a) b.none++;
    else if (a.modId === x.modId && a.tierIndex === x.tierIndex) b.same++;
    else if (a.modId === x.modId) b.tier++;
    else if (data.mods.get(a.modId).family === data.mods.get(x.modId).family) b.fam++;
    else b.other++;
  }
  return by;
}

const pct = (p) => `${(100 * p).toFixed(3)}%`;
const ci = (p, n) => 1.96 * Math.sqrt(p * (1 - p) / n);
const pm = (p, n) => `${pct(p)} ±${(100 * ci(p, n)).toFixed(3)}`;

/** CoE の置き場の key (check-coe-chaos.mjs と同じ。段の数が同じ事を確かめ、T1 = 一番大きい番号) */
const poolKeys = {};
function keysOf(itemId) {
  return (poolKeys[itemId] ??= COE.run(`(() => {
    const emu = new GameEmulator(true); Emulator = emu;
    const item = new GameItem(${itemId}, 82, 0); item.rarity = ItemRarity.RARE; emu.setItem(item);
    emu.setModpool(ModsManager.categorizeModpool(ModsManager.getModpool(item._classId, true, true)));
    const byId = Object.fromEntries(coedata.mods.entries.map((m) => [String(m.id), m.key]));
    return Object.keys(ModsManager.getFilteredModPool(emu._modpool, null, item, new rollAffixParameters).raw).map((id) => byId[id]);
  })()`));
}
function mod(itemId, id, tier, coeGroup, opt = {}) {
  const n = data.mods.get(id).tiers.length;
  const t = Number(tier.slice(1));
  const keys = keysOf(itemId).filter((k) => new RegExp(`^${coeGroup}\\d+_?$`).test(k)).sort((a, b) => parseInt(a.slice(coeGroup.length)) - parseInt(b.slice(coeGroup.length)));
  if (keys.length !== n) throw new Error(`${id}: 段の数がエンジン ${n} / CoE ${keys.length}`);
  return { mod: id, tier, coe: keys[n - t], tierIndex: n - t, ...opt };
}

const MS = mod(3004, "Boots_dex/MovementVelocity", "T1", "MovementVelocity", { fractured: true });
const F1 = mod(3004, "Boots_dex/FireResistance", "T1", "FireResist", { ja: "火の耐性 T1" });
const LIFE = mod(3004, "Boots_dex/IncreasedLife", "T3", "IncreasedLife", { ja: "ライフ T3" });
const DEX = mod(3004, "Boots_dex/Dexterity", "T2", "Dexterity", { ja: "器用さ T2" });
const R1 = mod(2592, "Rings/ItemFoundRarityIncrease", "T1", "ItemFoundRarityIncrease", { ja: "レアリティ T1" });
const CS1 = mod(2592, "Rings/IncreasedCastSpeed", "T1", "CastSpeedJewellery", { ja: "キャストスピード T1" });
const CASES = [
  { name: "靴 A: ドレイクスキンブーツ ilvl 82 (移動速度 T1 フラクチャー・火 T1・ライフ T3・器用 T2)", itemId: 3004, base: "Drakeskin Boots", mods: [MS, F1, LIFE, DEX] },
  { name: "金の指輪 ilvl 82 (レアリティ T1・キャストスピード T1)", itemId: 2592, base: "Gold Ring", mods: [R1, CS1] },
];

const t0 = Date.now();
console.log(`カオス 1 回で「消えた MOD」と「付いた MOD」を比べる。エンジン = ${K} 回 (seed ${SEED}、± は 95% の幅)、CoE = 消える MOD ごとの重みの割合 (正確)`);
console.log(`(a) 同じ MOD・同じ段  (b) 同じ MOD の別の段  (b') 同じ系統の別の MOD  (c) 別の系統  (d) 何も付かない`);
for (const c of CASES) {
  console.log(`\n=== ${c.name}`);
  const free = c.mods.filter((m) => !m.fractured);
  for (const [label, cur, floor] of [["通常のカオス", "chaos", 0], ["上級のカオス", "chaos_greater", 35], ["完全のカオス", "chaos_perfect", 50]]) {
    const by = engineRun(c, cur);
    console.log(`--- ${label}`);
    const tot = { n: 0, same: 0, tier: 0, fam: 0, other: 0, none: 0 };
    let coeSame = 0, coeGroup = 0;
    for (const x of free) {
      const b = by[x.mod] ?? { n: 0, same: 0, tier: 0, fam: 0, other: 0, none: 0 };
      for (const k of Object.keys(tot)) tot[k] += b[k];
      const [cs, cg] = coeBack(c.itemId, c.mods.filter((m) => m !== x).map((m) => m.coe), floor, x.coe);
      coeSame += cs / free.length; coeGroup += cg / free.length;
      const n = b.n || 1;
      console.log(`  ${x.ja.padEnd(14)} 消えた ${b.n} 回 (${pct(b.n / K)})  (a) ${pm(b.same / n, n)} [CoE ${pct(cs)}]  (b) ${pm(b.tier / n, n)} [CoE ${pct(cg)}]  (b') ${pct(b.fam / n)}  (c) ${pct(b.other / n)}  (d) ${pct(b.none / n)}`);
    }
    const others = Object.keys(by).filter((k) => !free.some((m) => m.mod === k));
    if (others.length) console.log(`  ⚠ 消えてはいけない MOD が消えた: ${others.join(", ")}`);
    console.log(`  ${"全体".padEnd(14)} ${K} 回  (a) ${pm(tot.same / K, K)} [CoE ${pct(coeSame)}]  (b) ${pm(tot.tier / K, K)} [CoE ${pct(coeGroup)}]  (b') ${pct(tot.fam / K)}  (c) ${pct(tot.other / K)}  (d) ${pct(tot.none / K)}`);
  }
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
