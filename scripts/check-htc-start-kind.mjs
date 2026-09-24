#!/usr/bin/env node
/**
 * check-htc-start-kind.mjs — 樹 MOD と作る側から始め方の種類を決める (start-kind.ts) (2026-09-24)
 *
 * 取引所は叩かない。実物 2 つ (死体の円環 / 金の指輪) と、組み立てた 2 つで 4 種類を確かめる。
 *   node scripts/check-htc-start-kind.mjs
 */
import { bundleEntry } from "./_bundle-ts.mjs";

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
let failed = 0;
const NL = String.fromCharCode(10);
const v = (x) => ({ value: x });
/** 貼り付けから startKindOf に渡す物を組む */
function fromPaste(lines) {
  const it = M.parseJaItem(lines.join(NL));
  const g = M.targetsFor(data, it);
  return { dropOnly: v(g.dropOnly), data: v(data), slotsUsed: v(g.skippedSides), targets: v(g.targets), item: v(it) };
}
function expect(name, c, kind, extra = {}) {
  const r = M.startKindOf(c);
  const bad = r.kind !== kind || Object.entries(extra).some(([k, x]) => r[k] !== x);
  console.log(`${bad ? "NG" : "ok"}: ${name} → ${r.kind} (重い側 ${r.craftSide ?? "-"} / 固定 ${r.fixSide ?? "-"} / 危ない樹 MOD ${r.atRisk})`);
  if (bad) failed++;
}

// 1. 死体の円環: 樹 MOD (プレ) と作る MOD (プレ・エッセンス) が同じ側 → 固定
expect("死体の円環", fromPaste(["アイテムクラス: 指輪", "レアリティ: レア", "死体の円環", "ニーモニックリング", "--------", "品質 (マナモッド): +40%", "--------", "アイテムレベル: 80", "--------", "最大マナが8%増加する", "--------", "スペルのマナコスト効率が29%増加する", "最大マナ +247", "知性 +30", "全ての元素耐性 +13%", "最大マナが8%増加する", "キャストスピードが20%増加する"]), "fix", { fixSide: "P" });

// 2. 金の指輪: 樹 MOD 2 つと冒涜はサフィ、作るのはプレだけ → 固定不要
const gold = fromPaste(["Rarity: Rare", "Spirit Knuckle", "Gold Ring", "--------", "Quality (Minion Modifiers): +40% (augmented)", "--------", "Item Level: 80", "--------", "13% increased Rarity of Items found (implicit)", "--------", "+215 to Evasion Rating", "17% increased Rarity of Items found", "Minions have 50% increased Critical Hit Chance", "Minions have 25% increased Critical Damage Bonus", "Minions have 40% increased Cooldown Recovery Rate (desecrated)", "+20% to Maximum Quality (crafted)"]);
expect("金の指輪", gold, "separate", { craftSide: "P" });

// 組み立て: 金の指輪の中身を差し替えて、樹 MOD をプレ 1・サフィ 1 に
const ringMods = [...data.mods.values()].filter((m) => m.id.startsWith("Rings/"));
const pick = (type, source) => ringMods.find((m) => m.type === type && m.source === source && !gold.targets.value.some((t) => t.modId === m.id));
const tree = gold.dropOnly.value;
const treePS = [{ ...tree[0], side: "P" }, { ...tree[1], side: "S" }];

// 3. 両側満杯 (プレ 3・サフィ 3) の両方に樹 MOD → 非推奨
const n = (type) => ringMods.filter((m) => m.type === type && m.source === "normal").slice(0, 2).map((m) => ({ modId: m.id, minTierIndex: 0 }));
expect("樹 MOD プレ 1 サフィ 1・両側満杯", { ...gold, dropOnly: v(treePS), slotsUsed: v({ prefixes: 1, suffixes: 1, either: 0 }), targets: v([...n("prefix"), ...n("suffix")]) }, "unsafe");

// 4. サフィは空きあり (樹 + 普通 1 = 2/3) → サフィの樹 MOD は冒涜で守れる。プレ満杯の樹 MOD だけ固定
expect("サフィに空き", { ...gold, dropOnly: v(treePS), slotsUsed: v({ prefixes: 1, suffixes: 1, either: 0 }), targets: v([...n("prefix"), n("suffix")[0]]) }, "fix", { fixSide: "P" });

// 5. サフィに空きがあってもエッセンスを使う → エッセンスは必ずその側を 1 つ消すので危ない → 非推奨
const ess = pick("suffix", "perfect_essence") ?? pick("suffix", "essence");
if (!ess) { console.log("NG: サフィのエッセンス MOD が見つからない"); failed++; }
else expect("サフィに空き + サフィにエッセンス", { ...gold, dropOnly: v(treePS), slotsUsed: v({ prefixes: 1, suffixes: 1, either: 0 }), targets: v([...n("prefix"), { modId: ess.id, minTierIndex: 0 }]) }, "unsafe");

console.log(failed ? `${NL}NG: ${failed} 件` : `${NL}全部 OK`);
process.exit(failed ? 1 : 0);
