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
 *   4. クラフトに使える物全部 (エッセンス・骨と開示・お告げ・神・破砕・アーティファサー・カタリスト) をお告げ付きででたらめに打っても
 *      規則が崩れない (枠・系統・冒涜 / エッセンス / 破砕は 1 つまで・掛けていないお告げは食わない)。開示の候補と結果が一致する
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

// ---- 4. クラフトに使える物全部 (エッセンス・骨と開示・お告げ・神・破砕・アーティファサー・カタリスト) で規則が崩れないか ----
{
  const OMENS = ["OmenofSinistralExaltation", "OmenofDextralExaltation", "OmenofGreaterExaltation", "OmenofWhittling", "OmenofSinistralErasure",
    "OmenofGreaterAnnulment", "OmenofLight", "OmenofDextralAnnulment", "OmenofSinistralCrystallisation", "OmenofDextralNecromancy",
    "OmenoftheSovereign", "OmenofAbyssalEchoes", "OmenofSinistralCoronation", "OmenofDextralAlchemy", "OmenofCatalysingExaltation"];
  const BASE_KEYS = ["transmute", "augment", "regal", "alchemy", "exalt", "exalt_greater", "chaos", "annul", "divine", "fracture", "artificer",
    "desecrate", "desecrate_ancient", "desecrate_altered", "reveal:1", "reveal:2", "reveal:3", "reveal:1:reroll", "catalyst_mana", "catalyst_life", "essence:breach"];
  const BASES2 = ["Gold Ring", "Absent Amulet", "Siphoning Wand", "Ancestral Tiara", "Heavy Belt"];
  let ok = 0, no = 0;
  const kinds = new Map();
  for (const base of BASES2) {
    const probe = M.freshItem(data, base, 82);
    const ess = [...probe.cls.pools.essence.prefixes, ...probe.cls.pools.essence.suffixes].flatMap((id) => {
      const md = data.mods.get(id);
      return md.source === "perfect_essence" ? [`essence:perfect:${id}`] : [`essence:lesser:${id}`, `essence:greater:${id}`];
    });
    const keys = [...BASE_KEYS, ...ess];
    const rnd = M.mulberry32(base.length * 104729);
    for (let run = 0; run < 250; run++) {
      let item = M.freshItem(data, base, [65, 82, 86][run % 3]);
      for (let k = 0; k < 20; k++) {
        const cur = keys[Math.floor(rnd() * keys.length)];
        const om = OMENS.filter(() => rnd() < 0.12);
        const r = M.applyCurrency(data, item, cur, M.mulberry32(run * 1000 + k), om);
        const kind = cur.split(":")[0].replace(/_(greater|perfect|ancient|altered)$/, "");
        const c = kinds.get(kind) ?? [0, 0]; c[r.applied ? 0 : 1]++; kinds.set(kind, c);
        if (!r.applied) { no++; if (r.item !== item) ng(`${base} ${cur}: 打てないのに変わった`); continue; }
        ok++;
        const it = r.item;
        for (const o of r.omensUsed ?? []) if (!om.includes(o)) ng(`${cur}: 掛けていないお告げを食った ${o}`);
        const lim = it.rarity === "magic" ? { prefixes: 1, suffixes: 1 } : it.cls.limits ?? { prefixes: 3, suffixes: 3 };
        if (it.prefixes.length > lim.prefixes || it.suffixes.length > lim.suffixes) ng(`${base} ${cur}: 枠を超えた (${it.rarity} ${it.prefixes.length}/${it.suffixes.length})`);
        const all = [...it.prefixes, ...it.suffixes];
        const fams = all.map((m) => m.family);
        if (new Set(fams).size !== fams.length) ng(`${base} ${cur}: 同じ系統が 2 つ (${fams.join(",")})`);
        if (all.filter((m) => m.desecrated).length > 1) ng(`${base} ${cur}: 冒涜の MOD が 2 つ`);
        if (all.filter((m) => m.crafted).length > 1) ng(`${base} ${cur}: エッセンスの MOD が 2 つ`);
        if (all.filter((m) => m.fractured).length > 1) ng(`${base} ${cur}: 破砕が 2 つ`);
        if (all.some((m) => m.side === "prefix") !== it.prefixes.length > 0) ng("側の並びが違う");
        for (const m of all) if (m.side !== (it.prefixes.includes(m) ? "prefix" : "suffix")) ng(`${m.modId}: 側と置き場が違う`);
        for (const m of r.added) if (!m.unrevealed && (/#/.test(m.textJa) || m.modLevel > it.itemLevel)) ng(`${cur} ${m.modId}: 数値か段がおかしい`);
        if (cur.startsWith("exalt") && om.includes("OmenofSinistralExaltation") && r.added.some((m) => m.side !== "prefix")) ng("左の高貴のお告げでサフィが付いた");
        if (cur === "chaos" && (r.omensUsed ?? []).includes("OmenofWhittling")) {
          const low = Math.min(...[...item.prefixes, ...item.suffixes].filter((m) => !m.fractured).map((m) => m.modLevel));
          if (r.removed[0].modLevel !== low) ng("削りのお告げで一番低い MOD が消えていない");
        }
        if ((it.quality ?? 0) > 45) ng("品質が上限を超えた");
        item = it;
      }
    }
  }
  console.log(`全部の物: 打てた ${ok} 回 / 打てない手 ${no} 回`);
  console.log("   " + [...kinds].map(([k, [a, b]]) => `${k} ${a}/${a + b}`).join("  "));
  for (const k of ["essence", "desecrate", "reveal", "divine", "fracture", "catalyst_mana", "artificer"]) if (!(kinds.get(k)?.[0] > 0)) ng(`${k} が 1 回も打てていない`);

  // 開示: 画面で見せる候補と、選んだ手の結果が一致するか
  let rare = M.applyCurrency(data, M.freshItem(data, "Gold Ring", 82), "alchemy", M.mulberry32(3)).item;
  rare = M.applyCurrency(data, rare, "annul", M.mulberry32(4)).item;
  const boned = M.applyCurrency(data, rare, "desecrate", M.mulberry32(5));
  if (!boned.applied || !boned.added[0].unrevealed) ng("骨で未開示の MOD が付いていない");
  const off = M.revealOffers(data, boned.item, M.mulberry32(99));
  if (off.first.length !== 3 || new Set(off.first.map((m) => m.modId)).size !== 3) ng("開示の候補が 3 つの別々の MOD でない");
  for (let i = 0; i < 3; i++) {
    const r = M.applyCurrency(data, boned.item, `reveal:${i + 1}`, M.mulberry32(99));
    if (r.added[0]?.textJa !== off.first[i].textJa) ng(`開示 ${i + 1}: 候補と結果が違う`);
  }
  const rr = M.applyCurrency(data, boned.item, "reveal:2:reroll", M.mulberry32(99), ["OmenofAbyssalEchoes"]);
  if (rr.added[0]?.textJa !== off.reroll[1].textJa) ng("引き直しの候補と結果が違う");
  if (M.applyCurrency(data, boned.item, "reveal:2:reroll", M.mulberry32(99)).applied) ng("お告げ無しで引き直せた");
  console.log(`開示: 候補 ${off.first.map((m) => m.textJa).join(" / ")}`);
  const lit = M.applyCurrency(data, M.applyCurrency(data, boned.item, "reveal:1", M.mulberry32(99)).item, "annul", M.mulberry32(1), ["OmenofLight"]);
  if (!lit.applied || !lit.removed[0]?.desecrated) ng("光のお告げで冒涜の MOD が消えていない");
  // 大いなる高貴: 枠が 2 つ以上なら 2 つ足す
  const two = M.applyCurrency(data, rare, "exalt", M.mulberry32(8), ["OmenofGreaterExaltation"]);
  if (two.added.length !== 2) ng(`大いなる高貴のお告げで 2 つ付いていない (${two.added.length})`);
}

console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK");
process.exit(failed ? 1 : 0);
