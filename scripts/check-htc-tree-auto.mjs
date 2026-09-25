#!/usr/bin/env node
/**
 * check-htc-tree-auto.mjs — 貼った MOD から自動で組むツリー (tree-auto.ts) を実物 3 つで回す (2026-09-24)
 *
 * 取引所は叩かない (値段は check-htc-spam-plan の固定値)。**組み方の流れを見るので、狙いの段は問わない (T 何でも)**。
 * 貼り付けの段 (T1 など) のままだと、揃うまでに手数の上限を超える物がある (金の指輪の回避 T1 + レアリティ T1)。見ること:
 *   - 最後まで行ける (完成 95% 以上)
 *   - 触らない MOD (樹 MOD) が消えて止まる回が無い (側を選べる手だけで組んでいるので)
 *   node scripts/check-htc-tree-auto.mjs
 */
import { readFileSync } from "node:fs";
import { bundleEntry } from "./_bundle-ts.mjs";
const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
const D = 506;
const src = readFileSync("scripts/check-htc-spam-plan.mjs", "utf8");
const a = src.indexOf("const div = (v)"), b = src.indexOf("const it = M.parseJaItem");
const prices = new Function("D", src.slice(a, b) + "; return prices;")(D);
const NL = String.fromCharCode(10);
let failed = 0;

const RINGS = [
  { name: "死体の円環", lines: ["アイテムクラス: 指輪", "レアリティ: レア", "死体の円環", "ニーモニックリング", "--------", "品質 (マナモッド): +40%", "--------", "アイテムレベル: 80", "--------", "最大マナが8%増加する", "--------", "スペルのマナコスト効率が29%増加する", "最大マナ +247", "知性 +30", "全ての元素耐性 +13%", "最大マナが8%増加する", "キャストスピードが20%増加する"] },
  { name: "金の指輪", lines: ["Rarity: Rare", "Spirit Knuckle", "Gold Ring", "--------", "Quality (Minion Modifiers): +40% (augmented)", "--------", "Item Level: 80", "--------", "13% increased Rarity of Items found (implicit)", "--------", "+215 to Evasion Rating", "17% increased Rarity of Items found", "Minions have 50% increased Critical Hit Chance", "Minions have 25% increased Critical Damage Bonus", "Minions have 40% increased Cooldown Recovery Rate (desecrated)", "+20% to Maximum Quality (crafted)"] },
  { name: "プリズムの指輪", lines: ["Item Class: Rings", "Rarity: Rare", "Test Loop", "Prismatic Ring", "--------", "Item Level: 82", "--------", "Adds 17 to 25 Cold damage to Attacks", "19% increased Fire Damage", "17% increased Rarity of Items found", "+31 to Strength", "+37% to Fire Resistance", "+21% to Chaos Resistance"] },
];

for (const r of RINGS) {
  const it = M.parseJaItem(r.lines.join(NL));
  const g0 = M.targetsFor(data, it);
  const g = { ...g0, targets: g0.targets.map((t) => ({ ...t, minTierIndex: 0 })) };
  const cls = M.baseForSolving(data, it.baseType, g.skippedSides);
  const limits = M.sideLimits(data, it.baseType);
  const v = (x) => ({ value: x });
  const kind = M.startKindOf({ dropOnly: v(g.dropOnly), data: v(data), slotsUsed: v(g.skippedSides), targets: v(g.targets), item: v(it) });
  // 開始の指輪 (useCraftTree と同じ考え方): 重い側の樹 MOD 1 つは固定済み、他の買った時の MOD は触らない、外れ 1 つ
  const slots = [];
  let fixedDone = false;
  for (const [side, n, S] of [["prefix", g.skippedSides.prefixes, "P"], ["suffix", g.skippedSides.suffixes, "S"]]) {
    const treeOn = g.dropOnly.filter((x) => x.side === S).length;
    // 買った時から付いている冒涜の MOD (冒涜は 1 つまで)。sim-setup.ts と同じ
    const desecLeft = g.skipped.filter((t) => { const l = it.lines.find((x) => x.text === t); return l?.kind === "desecrated" && M.htcModSides()[M.matchKey(l.template)] === S; }).length;
    for (let i = 0; i < n; i++) {
      const fix = kind.kind === "fix" && kind.fixSide === S && i < treeOn && !fixedDone;
      if (fix) fixedDone = true;
      slots.push({ ...(fix ? { modId: null, side, fixed: true } : { modId: null, side, fixed: false, keep: true }), ...(i >= n - desecLeft ? { desec: true } : {}) });
    }
  }
  const nP = slots.filter((x) => x.side === "prefix").length, nS = slots.filter((x) => x.side === "suffix").length;
  const keepP = slots.some((x) => x.keep && x.side === "prefix"), keepS = slots.some((x) => x.keep && x.side === "suffix");
  const roomP = limits.prefix - nP, roomS = limits.suffix - nS;
  slots.push({ modId: null, side: keepP !== keepS && (keepP ? roomS : roomP) > 0 ? (keepP ? "suffix" : "prefix") : roomS >= roomP ? "suffix" : "prefix", fixed: false });
  // 付きやすさ (craft-estimate の spawnChance と同じ: ベースの MOD 一覧の重みの割合、ilvl で出ない段は除く)
  const lv = it.itemLevel ?? 82;
  const w = (id, minIdx) => (data.mods.get(id)?.tiers ?? []).reduce((a2, t, i) => a2 + (i >= minIdx && t.ilvl <= lv ? t.weight : 0), 0);
  const chance = (t) => {
    const m = data.mods.get(t.modId);
    if (!m || m.source !== "normal") return null;
    const pool = (cls.pools.normal[m.type === "prefix" ? "prefixes" : "suffixes"] ?? []).reduce((a2, id) => a2 + w(id, 0), 0);
    return pool > 0 ? w(t.modId, t.minTierIndex ?? 0) / pool : null;
  };
  const chaosOk = !slots.some((x) => x.keep);
  const protectedSides = [...new Set(slots.filter((x) => x.keep).map((x) => x.side))];
  const nodes = M.autoTree({ data, prices, targets: g.targets, fixedIds: [], qualityTag: it.catalystTag ?? null, qualityPct: it.quality ?? null, baseQuality: M.maxQualityForBase(it.baseType ?? ""), chaosOk, chance, protectedSides, chaosSide: M.chaosSideFor({ slots, breach: false }, limits), desecratedTaken: slots.some((x) => x.desec), greater: process.env.GREATER ?? "catalyst" });
  const ctx = { data, cls, prices, itemLevel: it.itemLevel ?? 82, limits, catalystOk: () => true, baseQuality: M.maxQualityForBase(it.baseType ?? "") };
  const res = M.simulateTree({ ctx, start: { slots, breach: false }, nodes, runs: 1500, budget: 1000 * D });
  const lost = res.stops.filter((x) => x.reason.includes("消えたら終わり")).reduce((a2, x) => a2 + x.p, 0);
  console.log(`${r.name} (${kind.kind}): 手 ${nodes.length} / 完成 ${(res.pDone * 100).toFixed(1)}% / 平均 ${(res.expected / D).toFixed(0)} 神 / 8 割 ${(res.p80 / D).toFixed(0)} 神 / 触らない MOD が消えた ${(lost * 100).toFixed(1)}%`);
  for (const s of res.stops) console.log(`   止まった ${(s.p * 100).toFixed(1)}%: ${s.reason}`);
  // 狙いが 5 つ以上 (プリズム) は、素の消去が反対側の狙いを消して長引く回が手数の上限 (2 万手) に当たる。止まりではなく長引きなので 90%
  const need = g.targets.length >= 5 ? 0.9 : 0.95;
  if (res.pDone < need) { console.log(`   NG: 完成が ${need * 100}% 未満`); failed++; }
  if (lost > 0) { console.log("   NG: 触らない MOD が消えた"); failed++; }
}
// 枠 2 つの側で 1 つが固定済み → 光のお告げを使わず、同じ側のエッセンスで上書き → 冒涜 の輪 (0.5.5 の冒涜の解説、2026-09-24)。
// 組み立て: サフィ 2 枠 (固定済み + 外れ)、狙いはサフィの知性 1 つ。ヒステリーのエッセンス (サフィ) に仮の値段
{
  const data2 = data;
  const cls = M.itemBaseFor(data2, "Mnemonic Ring");
  const p2 = { ...prices, currency: { ...prices.currency, "essence:perfect:Rings/PerfectEssence_ManaRegeneration": 0.01 * D } };
  const tgt = [{ modId: "Rings/Intelligence", minTierIndex: 0 }];
  const start = { breach: false, slots: [{ modId: null, side: "suffix", fixed: true }, { modId: null, side: "suffix", fixed: false }] };
  for (const lim of [{ prefix: 3, suffix: 2 }, { prefix: 3, suffix: 3 }]) {
    const nodes = M.autoTree({ data: data2, prices: p2, targets: tgt, fixedIds: [], qualityTag: null, chaosOk: false, protectedSides: [], limits: lim, fixedSides: ["suffix"], bone: "preserved" });
    const r = M.simulateTree({ ctx: { data: data2, cls, prices: p2, itemLevel: 82, limits: lim, catalystOk: () => true, baseQuality: 20 }, start, nodes, runs: 1500 });
    const kinds = nodes.map((x) => x.action.kind).join(",");
    console.log(`サフィ ${lim.suffix} 枠: 手 ${kinds} / 完成 ${(r.pDone * 100).toFixed(1)}% / 平均 ${(r.expected / D).toFixed(2)} 神`);
    if (lim.suffix === 2 && (!kinds.includes("essence") || kinds.includes("light"))) { console.log("   NG: 枠 2 つなのにエッセンスの上書きの輪になっていない"); failed++; }
    if (lim.suffix === 2) {
      // 光で回す指定なら光の輪 (比べる用)
      const n2 = M.autoTree({ data: data2, prices: p2, targets: tgt, fixedIds: [], qualityTag: null, chaosOk: false, protectedSides: [], limits: lim, fixedSides: ["suffix"], bone: "preserved", reroll: "light" });
      const k2 = n2.map((x) => x.action.kind).join(",");
      if (!k2.includes("light") || k2.includes("essence")) { console.log(`   NG: 光で回す指定なのに ${k2}`); failed++; }
    }
    if (lim.suffix === 3 && !kinds.includes("light")) { console.log("   NG: 枠 3 つなのに光のお告げを使っていない"); failed++; }
    if (r.pDone < 0.95) { console.log("   NG: 完成が 95% 未満"); failed++; }
  }
}
// 不在のアミュレット (両側 2 枠): スピリットかスキルレベルのフラクチャー品から。カオスでやり直さず、側の消去 / 冒涜 + 光で
// 片方ずつ確定させる (オーナー 2026-09-24:「不在は絶対にやり直しのカオススパムには戻らない」)。品質 40% はブリーチ →
// 貼り付けの種類 → 左側の消去でブリーチだけ外す。開始: 固定 1 つ + 買った時の MOD (触らない) + 外れ
{
  const AMU = ["Item Class: Amulets", "Rarity: Rare", "Doom Charm", "Absent Amulet", "--------"];
  const HEAD = ["Item Level: 81", "--------", "-1 Prefix Modifier allowed (implicit)", "-1 Suffix Modifier allowed (implicit)", "--------"];
  const Q = ["Quality (Caster Modifiers): +40% (augmented)", "--------"];
  const SP = "Amulets/BaseSpirit", LV = "Amulets/GlobalIncreaseSpellSkillGemLevel";
  const cases = [
    { name: "スピリット固定 + レベル", q: true, mods: ["+46 to Spirit (fractured)", "+89 to maximum Life", "+3 to Level of all Spell Skills", "38% increased Critical Hit Chance"], start: [[SP, "prefix", "fixed"], [LV, "suffix", "keep"], [null, "prefix"]] },
    { name: "レベル固定", q: true, mods: ["+46 to Spirit", "+89 to maximum Life", "+3 to Level of all Spell Skills (fractured)", "38% increased Critical Hit Chance"], start: [[LV, "suffix", "fixed"], [null, "prefix"]] },
    { name: "レベル固定 品質無し", q: false, mods: ["+46 to Spirit", "+89 to maximum Life", "+3 to Level of all Spell Skills (fractured)", "38% increased Critical Hit Chance"], start: [[LV, "suffix", "fixed"], [null, "prefix"]] },
  ];
  for (const c of cases) {
    const it = M.parseJaItem([...AMU, ...(c.q ? Q : []), ...HEAD, ...c.mods].join(NL));
    const g = M.targetsFor(data, it);
    const cls = M.baseForSolving(data, it.baseType, g.skippedSides);
    const limits = M.sideLimits(data, it.baseType);
    const slots = c.start.map(([, side, k]) => ({ modId: null, side, fixed: k === "fixed", ...(k === "keep" ? { keep: true } : {}) }));
    const w = (id, minIdx) => (data.mods.get(id)?.tiers ?? []).reduce((a2, t, i) => a2 + (i >= minIdx && t.ilvl <= 81 ? t.weight : 0), 0);
    const chance = (t) => {
      const m = data.mods.get(t.modId);
      if (!m || m.source !== "normal") return null;
      const pool = (cls.pools.normal[m.type === "prefix" ? "prefixes" : "suffixes"] ?? []).reduce((a2, id) => a2 + w(id, 0), 0);
      return pool > 0 ? w(t.modId, t.minTierIndex ?? 0) / pool : null;
    };
    const cnt = (f) => ({ prefix: slots.filter((x) => x.side === "prefix" && f(x)).length, suffix: slots.filter((x) => x.side === "suffix" && f(x)).length });
    for (const chaos of [true, false]) {
    const nodes = M.autoTree({ data, prices, targets: g.targets, fixedIds: c.start.map(([id]) => id).filter(Boolean), qualityTag: it.catalystTag ?? null, qualityPct: it.quality ?? null,
      baseQuality: M.maxQualityForBase(it.baseType ?? ""), chaosOk: chaos && !slots.some((x) => x.keep), protectedSides: [...new Set(slots.filter((x) => x.keep).map((x) => x.side))],
      chaosSide: M.chaosSideFor({ slots, breach: false }, limits), limits, fixedSides: [...new Set(slots.filter((x) => x.fixed).map((x) => x.side))],
      startCount: cnt(() => true), startLoose: cnt((x) => !x.fixed), annul: "side", chance });
    const ctx = { data, cls, prices, itemLevel: 81, limits, catalystOk: () => true, baseQuality: M.maxQualityForBase(it.baseType ?? "") };
    const res = M.simulateTree({ ctx, start: { slots, breach: false }, nodes, runs: 1000 });
    const kinds = nodes.map((x) => x.action.kind + (x.action.side ? ":" + x.action.side : "")).join(",");
    // カオスは最初の 1 つだけ: カオスの手に来るのは、その前の手からとカオス自身の × だけ (後の消去から戻らない)
    const ci = nodes.findIndex((x) => x.action.kind === "chaos");
    const back = ci < 0 ? 0 : res.perNode.find((x) => x.id === nodes[ci].id).tries;
    console.log(`不在 ${c.name}${chaos ? "" : " (カオス無し)"}: 手 ${kinds} / 完成 ${(res.pDone * 100).toFixed(1)}% / 平均 ${(res.expected / D).toFixed(0)} 神${ci >= 0 ? ` / カオス ${back.toFixed(0)} 回` : ""}`);
    if (nodes.filter((x) => x.action.kind === "chaos").length > 1) { console.log("   NG: カオスの手が 2 つ以上"); failed++; }
    if (res.pDone < 0.95) { console.log("   NG: 完成が 95% 未満"); failed++; }
    }
  }
}
// 不在のアミュレット: スピリット固定 (プレ) + プレに外れ 1 つ、サフィはスペル・キャスピ (触らない)、狙いはプレのマナ % だけ。
// 品質 40% が要るのでブリーチを入れるが、最初の冒涜がブリーチの MOD を置き換えるので、光を使わず天体 (プレのエッセンス) で回せる
// (オーナー 2026-09-25:「20% でもブリーチで 40% まで上げてから冒涜したらええ」)。天体 1.1 神なら平均 110 神前後
{
  const cls = M.itemBaseFor(data, "Absent Amulet");
  const limits = M.sideLimits(data, "Absent Amulet");
  const ESS = "Amulets/PerfectEssence_AllDefences";
  const p2 = { ...prices, currency: { ...prices.currency, [`essence:perfect:${ESS}`]: 1.1 * D } };
  const tgt = [{ modId: "Amulets/MaximumManaIncreasePercent", minTierIndex: 2 }];
  const slots = [{ modId: null, side: "prefix", fixed: true }, { modId: null, side: "prefix", fixed: false }, { modId: null, side: "suffix", fixed: false, keep: true }, { modId: null, side: "suffix", fixed: false, keep: true }];
  const start = { slots, breach: false, quality: 20, qualityTag: "caster" };
  const ctx = { data, cls, prices: p2, itemLevel: 79, limits, catalystOk: () => true, baseQuality: 20 };
  const inp = { data, prices: p2, targets: tgt, fixedIds: [], qualityTag: "caster", qualityPct: 40, baseQuality: 20, chaosOk: false, protectedSides: ["suffix"], chaosSide: null, desecratedTaken: false, limits, fixedSides: ["prefix"], startCount: { prefix: 2, suffix: 2 }, startLoose: { prefix: 1, suffix: 2 } };
  const pick = await M.pickAutoTree(inp, ctx, start);
  const kinds = pick.nodes.map((x) => x.action.kind + (x.action.bone ? ":" + x.action.bone : "")).join(",");
  const r = M.simulateTree({ ctx, start, nodes: pick.nodes, runs: 1500 });
  console.log(`不在 マナ % だけ (天体 1.1 神): 選ばれた ${pick.greater} / 手 ${kinds} / 完成 ${(r.pDone * 100).toFixed(1)}% / 平均 ${(r.expected / D).toFixed(0)} 神`);
  if (!kinds.includes("essence") || kinds.includes("light")) { console.log("   NG: 天体の上書きで回していない"); failed++; }
  if (!kinds.includes("desecrate:desecrate")) { console.log("   NG: 普通の骨を選んでいない"); failed++; }
  if (r.pDone < 0.99 || r.expected / D > 200) { console.log("   NG: 完成 99% 未満か 200 神超"); failed++; }
}
// やり直しの費用から決めた取り方 ([[redo-cost.ts]])。不在 (スピリット固定・スペルは買った時のまま・キャスピは冒涜、狙いは
// スペル / マナ % / キャスピ): マナ % は高貴 + 左側の消去 (サフィのスペルを巻き込まない)、キャスピは冒涜、スペルはカオス
{
  const cls = M.itemBaseFor(data, "Absent Amulet");
  const limits = M.sideLimits(data, "Absent Amulet");
  const T = (id, i) => ({ modId: id, minTierIndex: i });
  const tgt = [T("Amulets/BaseSpirit", 4), T("Amulets/MaximumManaIncreasePercent", 2), T("Amulets/GlobalIncreaseSpellSkillGemLevel", 2), T("Amulets/IncreasedCastSpeed", 5)];
  const inp = { data, prices, targets: tgt, fixedIds: ["Amulets/BaseSpirit"], qualityTag: "caster", qualityPct: 40, baseQuality: 20, chaosOk: true, protectedSides: [], chaosSide: null, desecratedTaken: false, limits, fixedSides: ["prefix"], startCount: { prefix: 1, suffix: 1 }, startLoose: { prefix: 0, suffix: 1 } };
  const plan = M.planByRedoCost(inp, cls, 79);
  const by = Object.fromEntries((plan?.rows ?? []).map((r) => [r.modId.split("/")[1], r]));
  console.log("やり直しの費用から:", plan ? `合計 ${(plan.total / D).toFixed(0)} 神 / ` + plan.rows.map((r) => `${r.modId.split("/")[1]} = ${r.method}${r.bone ? ":" + r.bone : ""}${r.reroll ? ":" + r.reroll : ""} (1 回 ${(r.perTry / D).toFixed(2)} / 当たる ${(r.p * 100).toFixed(2)}% / やり直し ${(r.perMiss / D).toFixed(1)} / 見込み ${(r.expected / D).toFixed(0)} 神)`).join(" | ") : "無し");
  if (by.GlobalIncreaseSpellSkillGemLevel?.method !== "chaos") { console.log("   NG: スペル +3 をカオスで引いていない"); failed++; }
  if (by.IncreasedCastSpeed?.method !== "desecrate") { console.log("   NG: キャスピを冒涜にしていない"); failed++; }
  if (by.MaximumManaIncreasePercent?.method !== "exalt") { console.log("   NG: マナ % を高貴にしていない"); failed++; }
  // スペル固定 + スピリットは自分で: マナ % は冒涜 + 光、キャスピは高貴 + 右側 (スペル固定なので確定)
  const inp2 = { ...inp, fixedIds: ["Amulets/GlobalIncreaseSpellSkillGemLevel"], fixedSides: ["suffix"], startCount: { prefix: 1, suffix: 1 }, startLoose: { prefix: 1, suffix: 0 } };
  const plan2 = M.planByRedoCost(inp2, cls, 79);
  const by2 = Object.fromEntries((plan2?.rows ?? []).map((r) => [r.modId.split("/")[1], r]));
  console.log("スペル固定:", plan2 ? `合計 ${(plan2.total / D).toFixed(0)} 神 / ` + plan2.rows.map((r) => `${r.modId.split("/")[1]} = ${r.method}${r.reroll ? ":" + r.reroll : ""} 見込み ${(r.expected / D).toFixed(0)}`).join(" | ") : "無し");
  if (by2.IncreasedCastSpeed?.method !== "exalt" || !by2.IncreasedCastSpeed.safe) { console.log("   NG: スペル固定ならキャスピは高貴 + 右側 (確定) のはず"); failed++; }
  if (!(plan2.total < plan.total)) { console.log("   NG: スペル固定の方が安いはず"); failed++; }
  // 見積もりで決めた取り方を実際に組んで回し、見積もりと大きくずれない (1.6 倍以内) ことと完成 95% 以上を見る
  const ctx = { data, cls, prices, itemLevel: 79, limits, catalystOk: () => true, baseQuality: 20 };
  for (const [name, i2, pl, start] of [
    ["スピリット固定", inp, plan, { slots: [{ modId: null, side: "prefix", fixed: true }, { modId: null, side: "suffix", fixed: false }], breach: false }],
    ["スペル固定", inp2, plan2, { slots: [{ modId: null, side: "suffix", fixed: true }, { modId: null, side: "prefix", fixed: false }], breach: false }],
  ]) {
    const pick = await M.pickAutoTree(i2, ctx, start);
    const r = M.simulateTree({ ctx, start, nodes: pick.nodes, runs: 1000 });
    console.log(`   ${name}: 選ばれた ${pick.greater} / 手 ${pick.nodes.map((x) => x.action.kind).join(",")} / 完成 ${(r.pDone * 100).toFixed(0)}% / 回した平均 ${(r.expected / D).toFixed(0)} 神 (見積もり ${(pl.total / D).toFixed(0)} 神)`);
    if (r.pDone < 0.95) { console.log("   NG: 完成 95% 未満"); failed++; }
    if (r.expected > pl.total * 1.6 + 60 * D) { console.log("   NG: 回した平均が見積もりから離れ過ぎ"); failed++; }
  }
}
console.log(failed ? `${NL}NG: ${failed} 件` : `${NL}全部 OK`);
process.exit(failed ? 1 : 0);
