#!/usr/bin/env node
/**
 * check-htc-paste.mjs — 貼り付けたアイテムを読めるか (2026-09-22 / 英語と注記は 2026-09-23)
 *
 * 同梱エンジンの `parseItemText` は英語専用で、日本語クライアントの Ctrl+C は **null** を返す。
 * オーナーは日本語クライアントなので、ここが UI の入口。
 *
 *   node scripts/check-htc-paste.mjs
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

// ---- poe.ninja の英語形式 (注記つき) ----
//
// オーナー指示 2026-09-23:「忍者の性質読んで全てに対応できる様にしてほしい」。
// 注記があるので**種類を推測しなくていい**: (implicit) (fractured) (desecrated) (crafted)
// (enchant) (rune)。ルーンとアノイントは作る対象外 (オーナー:「ルーンとかは全無視でいい」)。
console.log(String.fromCharCode(10) + "poe.ninja の英語形式:");
{
  const NLC = String.fromCharCode(10);
  const RING = [
    "Rarity: Rare", "Fate Hold", "Mnemonic Ring", "--------",
    "Quality (Mana Modifiers): +40% (augmented)", "--------", "Item Level: 81", "--------",
    "8% increased maximum Mana (implicit)", "--------",
    "36% increased Mana Cost Efficiency of Spells (fractured)",
    "+247 to maximum Mana",
    "23% increased Cast Speed",
    "+33 to Intelligence",
    "+14% to all Elemental Resistances (desecrated)",
    "8% increased maximum Mana (crafted)",
  ].join(NLC);
  const r = M.parseJaItem(RING);
  console.log("  指輪  " + r.baseType + " / ilvl " + r.itemLevel + " / 品質 " + r.quality + "% (" + r.catalystTag + ") / 注記 " + r.annotated);
  if (r.baseType !== "Mnemonic Ring") fail("ベースが " + r.baseType);
  if (r.itemLevel !== 81) fail("ilvl が " + r.itemLevel + " (英語の Item Level が読めていない)");
  if (r.quality !== 40) fail("品質が " + r.quality + " (英語の Quality が読めていない)");
  if (r.catalystTag !== "mana") fail("品質の種類が " + r.catalystTag);
  if (!r.annotated) fail("注記つきと判定されていない");
  const g = M.targetsFor(data, r);
  if (g.fractured.length !== 1) fail("固定済みが " + g.fractured.length + " 件 (1 件のはず)");
  if (g.implicits.length !== 1) fail("暗黙が " + g.implicits.length + " 件 (1 件のはず)");
  // **底上げされた値は帯で戻す。**23% は品質 40% 込みなので、素は 16.4 → of Expertise (16-18)。
  // 帯を「戻した値 〜 表示の値」にすると底上げ後の 22-24 に当たってしまう (2026-09-23 に実測)
  const cast = g.targets.find((t) => t.modId.includes("CastSpeed"));
  if (!cast) fail("キャストスピードが引けていない");
  else {
    const tn = String(data.mods.get(cast.modId).tiers[cast.minTierIndex].name);
    console.log("  キャストスピード 23% → " + tn + " (品質 40% を外して 16.4)");
    if (tn !== "of Expertise") fail("キャストスピードが " + tn + " (of Expertise のはず。品質の帯がずれている)");
  }

  // 不在のアミュレット: 付与スキル / アノイント / 枠を減らす暗黙 / 冒涜
  const AMULET = [
    "Rarity: Rare", "Plague Heart", "Absent Amulet", "--------",
    "Quality (Caster Modifiers): +41% (augmented)", "--------", "Item Level: 79", "--------",
    "Allocates Augmented Flesh (enchant)", "--------",
    "-1 Prefix Modifier allowed (implicit)", "-1 Suffix Modifier allowed (implicit)", "--------",
    "Grants Skill: Level 20 Cast on Elemental Ailment", "--------",
    "+50 to Spirit (fractured)",
    "8% increased maximum Mana",
    "+4 to Level of all Spell Skills",
    "33% increased Cast Speed (desecrated)",
  ].join(NLC);
  const a = M.parseJaItem(AMULET);
  const ga = M.targetsFor(data, a);
  console.log("  アミュレット  付与スキル " + a.grantedSkill + " / 目標 " + ga.targets.length + " / 暗黙 " + ga.implicits.length + " / 固定済み " + ga.fractured.length);
  if (a.grantedSkill !== "Cast on Elemental Ailment") fail("付与スキルが " + a.grantedSkill);
  if (ga.implicits.length !== 2) fail("枠を減らす暗黙 2 件が拾えていない");
  if (ga.targets.some((t) => t.modId.includes("Spirit")) === false) fail("固定済みのスピリットが目標に入っていない");
  // アノイントは作る対象外
  if (ga.targets.length !== 4) fail("目標が " + ga.targets.length + " 件 (4 件のはず。アノイントが混ざっていないか)");
  // +4 スペルレベルは、品質 41% を外すと素 +3 (メモの「34% で +3 が +4 になる」)
  const spell = ga.targets.find((t) => t.modId.includes("SpellSkillGemLevel"));
  if (!spell) fail("スペルレベルが引けていない");
  else {
    const tn = String(data.mods.get(spell.modId).tiers[spell.minTierIndex].name);
    console.log("  スペルレベル +4 → " + tn + " (品質 41% を外して素 +3)");
    if (tn !== "of the Sorcerer") fail("スペルレベルが " + tn + " (of the Sorcerer のはず)");
  }

  // 靴: ルーンは全部外す / コラプトを拾う
  const BOOTS = [
    "Rarity: Rare", "Onslaught Hoof", "Runeforged Sekhema Sandals", "--------",
    "Quality: +20% (augmented)", "Energy Shield: 41 (augmented)", "--------", "Item Level: 82", "--------",
    "+22% to Fire Resistance (rune)", "Bonded: +20 to maximum Life (rune)", "--------",
    "30% increased Movement Speed", "+86 to maximum Life", "+122 to maximum Mana",
    "+40% to Cold Resistance", "+37% to Lightning Resistance", "+23% to Chaos Resistance", "--------",
    "Corrupted",
  ].join(NLC);
  const bo = M.parseJaItem(BOOTS);
  const gb = M.targetsFor(data, bo);
  console.log("  靴  目標 " + gb.targets.length + " / コラプト " + bo.corrupted + " / 品質 " + bo.quality + "% (種類 " + bo.catalystTag + ")");
  if (!bo.corrupted) fail("コラプトを拾えていない");
  if (gb.targets.length !== 6) fail("目標が " + gb.targets.length + " 件 (ルーン 2 件を外した 6 件のはず)");
  if (gb.targets.some((t) => /FireResist/i.test(t.modId))) fail("ルーンの火耐性が目標に混ざっている");
  // 防具の品質には種類が無いので割り戻さない (Energy Shield の行を品質と取り違えないこと)
  if (bo.catalystTag !== null) fail("防具に品質の種類が付いている (" + bo.catalystTag + ")");
  if (bo.quality !== 20) fail("品質が " + bo.quality);
}

console.log(failed ? (String.fromCharCode(10) + "NG: " + failed + " 件") : (String.fromCharCode(10) + "全部 OK"));
process.exit(failed ? 1 : 0);
