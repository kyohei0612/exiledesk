#!/usr/bin/env node
/**
 * check-craft-stage.mjs — クラフトステージ (1 手の抽選) の検算 (2026-09-27、ADR-001)
 *
 * 見ること:
 *   1. 同じ手順 JSON なら同じ結果 JSON (seed が 1 手ごとに決まる)。POE2Tube の見本の手順が 白 → 青 → 青 → 黄 になる
 *   2. でたらめな手を何千回も打っても規則が崩れない: レアリティの移り方、枠 (マジック 1 / 1、レアはベースの上限)、同じ系統が
 *      2 つ付かない、段がアイテムレベル以下で強さの下限以上、数値が段の範囲の中、打てない手は何も変えない
 *   3. 計算機の確率と実演の頻度が一致する: 同じ状態・同じカレンシーで、計算機の addNormalAffixProbability と、
 *      applyCurrency を多数回引いた MOD ごとの頻度の差が小さい
 *   node scripts/check-craft-stage.mjs
 */
import { readFileSync } from "node:fs";
import { bundleEntry } from "./_bundle-ts.mjs";

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
let failed = 0;
const ng = (msg) => { console.log(`   NG: ${msg}`); failed++; };
const META = { prices: { transmute: 1, augment: 1, regal: 1 }, exiledeskVersion: "test", patch: "0.5.0", league: null, generatedAt: "2026-09-27T00:00:00Z" };

// ---- 1. 見本の手順: 同じ結果になるか、白 → 青 → 青 → 黄 ----
{
  const plan = JSON.parse(readFileSync("C:/Users/kyohei/POE2Tube/contracts/examples/plan-transmute-augment-regal.json", "utf8"));
  const a = M.runPlan(data, plan, META);
  const b = M.runPlan(data, plan, META);
  if (JSON.stringify(a) !== JSON.stringify(b)) ng("同じ手順なのに結果が違う");
  const rar = [a.steps[0].before.rarity, ...a.steps.map((s) => s.after.rarity)].join(" → ");
  console.log(`見本 (${plan.title}): ${rar} / 最後の MOD ${a.final.prefixes.length + a.final.suffixes.length} つ / seed ${a.steps.map((s) => s.seed).join(",")}`);
  if (rar !== "normal → magic → magic → rare") ng(`レアリティの移り方が違う: ${rar}`);
  if (a.final.prefixes.length + a.final.suffixes.length !== 3) ng("MOD が 3 つでない");
  if (a.steps.some((s, i) => i > 0 && JSON.stringify(s.before) !== JSON.stringify(a.steps[i - 1].after))) ng("before が前の after と違う");
  for (const m of [...a.final.prefixes, ...a.final.suffixes]) console.log(`   ${m.side === "prefix" ? "プレ" : "サフィ"} ${m.tier_name} ${m.text_ja}  (${m.text_en})`);
}

// ---- 2. でたらめな手で規則が崩れないか ----
const KEYS = ["transmute", "transmute_greater", "augment", "augment_perfect", "regal", "regal_greater", "exalt", "exalt_greater", "exalt_perfect", "chaos", "chaos_perfect", "annul", "alchemy"];
const FLOOR = { transmute: [0, 55, 70], augment: [0, 55, 70], regal: [0, 35, 50], exalt: [0, 35, 50], chaos: [0, 35, 50], alchemy: [0, 0, 0], annul: [0, 0, 0] };
const floorOf = (k) => { const [kind, s] = k.split("_"); return (FLOOR[kind] ?? [0, 0, 0])[s === "greater" ? 1 : s === "perfect" ? 2 : 0]; };
const BASES = ["Mnemonic Ring", "Gold Ring", "Absent Amulet", "Siphoning Wand", "Ancestral Tiara"];
let applied = 0, skipped = 0;
for (const base of BASES) {
  const rnd = M.mulberry32(base.length * 7919);
  for (let run = 0; run < 300; run++) {
    let item = M.freshItem(data, base, [45, 65, 82][run % 3]);
    for (let k = 0; k < 12; k++) {
      const cur = KEYS[Math.floor(rnd() * KEYS.length)];
      const r = M.applyCurrency(data, item, cur, M.mulberry32(run * 100 + k));
      if (!r.applied) {
        skipped++;
        if (r.item !== item) ng(`${base} ${cur}: 打てないのに変わった`);
        continue;
      }
      applied++;
      const it = r.item;
      const lim = it.rarity === "magic" ? { prefixes: 1, suffixes: 1 } : it.cls.limits ?? { prefixes: 3, suffixes: 3 };
      if (it.prefixes.length > lim.prefixes || it.suffixes.length > lim.suffixes) ng(`${base} ${cur}: 枠を超えた (${it.rarity} ${it.prefixes.length}/${it.suffixes.length})`);
      const all = [...it.prefixes, ...it.suffixes];
      const fams = all.map((m) => m.family);
      if (new Set(fams).size !== fams.length) ng(`${base} ${cur}: 同じ系統が 2 つ (${fams.join(",")})`);
      if (it.rarity === "normal" && all.length) ng(`${base} ${cur}: ノーマルに MOD`);
      for (const m of r.added) {
        if (m.modLevel > it.itemLevel) ng(`${base} ${cur}: 段がアイテムレベルを超えた (${m.modId} ${m.modLevel} > ${it.itemLevel})`);
        if (m.modLevel < floorOf(cur)) ng(`${base} ${cur}: 段が強さの下限未満 (${m.modId} ${m.modLevel} < ${floorOf(cur)})`);
        m.values.forEach((v, i) => { const [a, b] = m.ranges[i]; if (v < Math.min(a, b) || v > Math.max(a, b)) ng(`${m.modId}: 数値が範囲外 ${v} [${a},${b}]`); });
        if (/#/.test(m.textJa) || /#/.test(m.textEn)) ng(`${m.modId}: 数値が埋まっていない ${m.textJa}`);
      }
      item = it;
    }
  }
}
console.log(`でたらめな手: 打てた ${applied} 回 / 打てない手 ${skipped} 回 (${BASES.length} ベース × 300 × 12 手)`);

// ---- 3. 計算機の確率と実演の頻度 ----
const toState = (it) => ({ base: it.cls, level: it.itemLevel, rarity: it.rarity, prefixes: it.prefixes.map((m) => ({ modId: m.modId, tierName: m.affix })), suffixes: it.suffixes.map((m) => ({ modId: m.modId, tierName: m.affix })) });
function compare(label, item, cur, n = 40000) {
  const kind = cur.split("_")[0], tier = cur.endsWith("_greater") ? "greater" : cur.endsWith("_perfect") ? "perfect" : "base";
  const freq = new Map();
  for (let i = 0; i < n; i++) {
    const r = M.applyCurrency(data, item, cur, M.mulberry32(1_000_000 + i));
    const m = r.added[0];
    if (m) freq.set(m.modId, (freq.get(m.modId) ?? 0) + 1);
  }
  const st = toState(item);
  const ids = [...item.cls.pools.normal.prefixes, ...item.cls.pools.normal.suffixes];
  let maxDiff = 0, worst = "", sumP = 0;
  for (const id of ids) {
    const p = M.addNormalAffixProbability(data, st, kind, id, { currencyTier: tier });
    sumP += p;
    const f = (freq.get(id) ?? 0) / n;
    const d = Math.abs(f - p);
    if (d > maxDiff) { maxDiff = d; worst = `${id} 計算機 ${(p * 100).toFixed(2)}% / 実演 ${(f * 100).toFixed(2)}%`; }
  }
  console.log(`${label}: 計算機の確率の合計 ${(sumP * 100).toFixed(1)}% / MOD ごとの差の最大 ${(maxDiff * 100).toFixed(2)} ポイント (${worst})`);
  if (Math.abs(sumP - 1) > 0.001) ng(`${label}: 計算機の確率の合計が 100% でない`);
  if (maxDiff > 0.01) ng(`${label}: 計算機の確率と実演の頻度が 1 ポイント以上ずれた`);
}
{
  const white = M.freshItem(data, "Mnemonic Ring", 82);
  compare("変成 (白のニーモニックリング)", white, "transmute");
  compare("上級の変成 (段 55 以上)", white, "transmute_greater");
  const magic = M.applyCurrency(data, white, "transmute", M.mulberry32(7)).item;
  compare(`増強 (${magic.prefixes.concat(magic.suffixes)[0].textJa} のマジック)`, magic, "augment");
  compare("王者 (同じマジック)", magic, "regal");
  let rare = M.applyCurrency(data, M.freshItem(data, "Gold Ring", 82), "alchemy", M.mulberry32(11)).item;
  while (rare.prefixes.length + rare.suffixes.length > 3) rare = M.applyCurrency(data, rare, "annul", M.mulberry32(13)).item;
  compare(`高貴 (MOD ${rare.prefixes.length + rare.suffixes.length} つのレアの金の指輪)`, rare, "exalt");
  compare("完全の高貴 (段 50 以上)", rare, "exalt_perfect");
}

console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK");
process.exit(failed ? 1 : 0);
