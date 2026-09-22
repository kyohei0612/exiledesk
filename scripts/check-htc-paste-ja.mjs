#!/usr/bin/env node
/**
 * check-htc-paste-ja.mjs — 日本語のアイテム貼り付けを読めるか (2026-09-22)
 *
 * 同梱エンジンの `parseItemText` は英語専用で、日本語クライアントの Ctrl+C は **null** を返す。
 * オーナーは日本語クライアントなので、ここが UI の入口。
 *
 *   node scripts/check-htc-paste-ja.mjs
 */
import { bundleEntry } from "./_bundle-ts.mjs";

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
let failed = 0;
const fail = (m) => { console.log("   NG: " + m); failed++; };

// オーナーの実物 (イージスクォータースタッフ、2026-09-22)
const TEXT = [
  "アイテムクラス: クォータースタッフ",
  "レアリティ: レア",
  "亀裂のあるポスト",
  "イージスクォータースタッフ",
  "--------",
  "品質: +20%",
  "物理ダメージ: 70-116",
  "クリティカルヒット率: 10.00%",
  "秒間アタック回数: 1.40",
  "--------",
  "アイテムレベル: 83",
  "--------",
  "ブロック率 +17%",
  "--------",
  "150から221の火ダメージを追加する",
  "6から342の雷ダメージを追加する",
  "全ての近接スキルのレベル +5",
  "倒した敵1体ごとに77のライフを獲得する",
  "この武器でキリングヒット時に20%の確率で猛攻を獲得する",
  "アタックスキルによる元素ダメージが128%増加する",
].join(String.fromCharCode(10));

const t0 = Date.now();
const item = M.parseJaItem(TEXT);
const ms = Date.now() - t0;
console.log("読み取り " + ms + " ミリ秒");
console.log("  ベース " + item.baseText + " -> " + item.baseType + " / ilvl " + item.itemLevel + " / 品質 " + item.quality + "%");
if (item.baseType !== "Aegis Quarterstaff") fail("ベースが " + item.baseType);
if (item.itemLevel !== 83) fail("ilvl が " + item.itemLevel);
if (item.quality !== 20) fail("品質が " + item.quality);
if (ms > 2000) fail("読み取りに " + ms + " ミリ秒 (即時のはず)");

const { targets, skipped, implicits } = M.targetsFor(data, item);
console.log("  目標 " + targets.length + " 件 / 暗黙 " + implicits.length + " 件 / 繋がらず " + skipped.length + " 件");
// 6 個とも引けて、全部 T1 のはず
const want = {
  "Quarterstaves/LocalFireDamage": "Carbonising",
  "Quarterstaves/LocalLightningDamage": "Vapourising",
  "Quarterstaves/GlobalIncreaseMeleeSkillGemLevelWeapon": "of War",
  "Quarterstaves/LifeGainedFromEnemyDeath": "of Legend",
  "Quarterstaves/PerfectEssence_Onslaught": "Perfect Essence of Haste",
  "Quarterstaves/IncreasedWeaponElementalDamagePercent": "Devastating",
};
if (targets.length !== 6) fail("目標が " + targets.length + " 件 (6 件のはず)");
for (const [id, tierName] of Object.entries(want)) {
  const t = targets.find((x) => x.modId === id);
  if (!t) { fail(id + " が引けていない"); continue; }
  const got = data.mods.get(id).tiers[t.minTierIndex];
  const ok = String(got.name) === tierName;
  console.log("  " + (ok ? "○" : "×") + " " + id.split("/")[1].padEnd(42) + " " + got.name);
  if (!ok) fail(id + " のティアが " + got.name + " (" + tierName + " のはず)");
}
// 暗黙は目標に混ぜない。**混ぜると冒涜の AdditionalBlock (20-25) に当たって、
// 範囲外の 17 なのに目標として通ってしまう** (実物で踏んだ)
if (!implicits.includes("ブロック率 +17%")) fail("暗黙のブロック率が分離されていない");
if (targets.some((t) => t.modId.includes("AdditionalBlock"))) fail("暗黙が目標に混ざっている");
console.log("  暗黙 (作る対象外): " + implicits.join(" / "));

// ---- 装飾品の品質を外してからティアを読むか ----
//
// 装飾品の品質は**種類つき**で、その種類のタグを持つ MOD だけが押し上げられる。画面の数字の
// まま読むとティアを高く見積もる。2026-09-22 にオーナーの太陽のアミュレットで実際に踏んだ:
//   最大マナ +183  → 素は 152.5。Ultramarine (180-189) ではなく Blue (150-164)
//   最大マナ 7%    → 素は 5.83。Mnemonic (7-8) ではなく Perceptive (5-6)
// 種類は品質欄の文言 (「品質 (マナモッド)」) から読む。**カタリストのアイテム名ではない** ──
// 最初はアイテム名 (「神経のカタリスト」) と突き合わせていて 1 件も当たらなかった。
console.log(String.fromCharCode(10) + "装飾品の品質を外す:");
{
  const AMULET = [
    "アイテムクラス: アミュレット", "レアリティ: レア", "獣の魔除け", "太陽のアミュレット",
    "品質 (マナモッド): +20%", "アイテムレベル: 80", "スピリット +13",
    "最大マナ +183", "最大マナが7%増加する", "全てのスペルスキルのレベル +3",
  ].join(String.fromCharCode(10));
  const a = M.parseJaItem(AMULET);
  console.log("  ベース " + a.baseType + " / 品質 " + a.quality + "% / 種類 " + a.catalystTag);
  if (a.catalystTag !== "mana") fail("品質の種類が " + a.catalystTag + " (mana のはず)");
  const got = M.targetsFor(data, a).targets;
  const want = { "Amulets/IncreasedMana": "Blue", "Amulets/MaximumManaIncreasePercent": "Perceptive" };
  for (const [id, tierName] of Object.entries(want)) {
    const t = got.find((x) => x.modId === id);
    if (!t) { fail(id + " が引けていない"); continue; }
    const tier = data.mods.get(id).tiers[t.minTierIndex];
    const ok = String(tier.name) === tierName;
    console.log("  " + (ok ? "○" : "×") + " " + id.split("/")[1].padEnd(30) + " " + tier.name + "  " + (tier.ranges ?? []).map((r) => r.join("-")).join("/"));
    if (!ok) fail(id + " が " + tier.name + " (" + tierName + " のはず。品質を外していない)");
  }
  // マナのタグを持たない MOD は外さない (全部割ると今度は低く見積もる)
  const spell = got.find((x) => x.modId.includes("GlobalIncreaseSpellSkillGemLevel"));
  if (!spell) fail("スペルレベルが引けていない");
  else if (String(data.mods.get(spell.modId).tiers[spell.minTierIndex].name) !== "of the Sorcerer") {
    fail("スペルレベルのティアがずれている (マナのタグが無いので外してはいけない)");
  }
  // 品質欄の文言から読めること (空白の揺れ「品質(防御力モッド)」も含む)
  if (M.catalystTagFromLabel("品質 (マナモッド): +20%") !== "mana") fail("品質欄の文言からマナを読めない");
  if (M.catalystTagFromLabel("品質(防御力モッド): +20%") !== "defences") fail("空白無しの文言を読めない");
}

// 英語の貼り付けも通ること (ベース名が英語でも引ける)
const EN = TEXT.replace("イージスクォータースタッフ", "Aegis Quarterstaff");
const en = M.parseJaItem(EN);
if (en.baseType !== "Aegis Quarterstaff") fail("英語のベース名が読めない");

console.log(failed ? (String.fromCharCode(10) + "NG: " + failed + " 件") : (String.fromCharCode(10) + "全部 OK"));
process.exit(failed ? 1 : 0);
