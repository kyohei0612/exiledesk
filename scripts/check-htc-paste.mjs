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
  // **マナの品質はキャスピに効かない。**キャスピのタグは caster / speed だけ ([[check-htc-mod-tags.mjs]])。
  // 以前は family の表に混ざった `mana` で 23% を 16.4 に割り戻し、of Expertise と読んでいた (2026-09-23 修正)。
  // 23% はそのまま of Legerdemain (22-24)
  const cast = g.targets.find((t) => t.modId.includes("CastSpeed"));
  if (!cast) fail("キャストスピードが引けていない");
  else {
    const tn = String(data.mods.get(cast.modId).tiers[cast.minTierIndex].name);
    console.log("  キャストスピード 23% → " + tn + " (マナ品質は効かないので素のまま)");
    if (tn !== "of Legerdemain") fail("キャストスピードが " + tn + " (of Legerdemain のはず。マナ品質で割り戻している)");
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

// ---- 繋がらない MOD が食っている枠を引く ----
//
// クラフトでは付かない MOD (創生の樹から落ちた指輪の物など) も**枠は使う**。引かずに解くと
// 「まだ 3 枠空いている」と思い込み、実際には入らない構成を「作れます」と言う。
// エンジンに無い MOD でも**クライアントには側が入っている**ので、文面で引ける
// (`extra-bases.json` の `modSides`、実測 530 種)。
console.log(String.fromCharCode(10) + "繋がらない MOD の枠:");
{
  const NLC = String.fromCharCode(10);
  const RING = [
    "Rarity: Rare", "Fate Hold", "Mnemonic Ring", "--------",
    "Quality (Mana Modifiers): +40% (augmented)", "--------", "Item Level: 81", "--------",
    "8% increased maximum Mana (implicit)", "--------",
    "36% increased Mana Cost Efficiency of Spells (fractured)",
    "+247 to maximum Mana", "23% increased Cast Speed", "+33 to Intelligence",
    "+14% to all Elemental Resistances (desecrated)", "8% increased maximum Mana (crafted)",
  ].join(NLC);
  const it = M.parseJaItem(RING);
  const got = M.targetsFor(data, it);
  console.log("  繋がらない: " + got.skipped.join(" / "));
  console.log("  食っている枠: " + JSON.stringify(got.skippedSides));
  if (got.skipped.length !== 1) fail("繋がらない行が " + got.skipped.length + " 件 (1 件のはず)");
  // マナコスト効率はプレフィックス。側が引けていないと枠を引けない
  if (got.skippedSides.prefixes !== 1) fail("プレフィックスの使用数が " + got.skippedSides.prefixes + " (1 のはず)");
  if (got.skippedSides.suffixes !== 0) fail("サフィックスの使用数が " + got.skippedSides.suffixes);
  if (got.skippedSides.either !== 0) fail("側が決まらない分が " + got.skippedSides.either + " (0 のはず)");

  const plain = M.itemBaseFor(data, it.baseType);
  const solving = M.baseForSolving(data, it.baseType, got.skippedSides);
  const p0 = plain.limits?.prefixes ?? 3, s0 = plain.limits?.suffixes ?? 3;
  console.log("  枠 " + p0 + "P/" + s0 + "S → " + solving.limits.prefixes + "P/" + solving.limits.suffixes + "S");
  if (solving.limits.prefixes !== p0 - 1) fail("プレフィックスが引けていない");
  if (solving.limits.suffixes !== s0) fail("サフィックスまで引いている");

  // 繋がらない行が無ければ、枠はそのまま (今までと同じ挙動)
  const same = M.baseForSolving(data, it.baseType, { prefixes: 0, suffixes: 0, either: 0 });
  if (same.limits?.prefixes !== plain.limits?.prefixes) fail("引く物が無いのに枠が変わった");
}

// ---- 創生の樹からしか出ない MOD ----
//
// オーナー指摘 2026-09-23:「創生の樹 MOD のみ DB から片っ端から見つけて覚えておかないと厄介」。
// **タグは 4 系統ある。**`breach_desecration` だけ見ると足りない (最初にそれで 36 件と数えて漏らした):
//   genesis_tree_caster 83 / genesis_tree_minion 68 / breach_desecration 36 / tower_augment_breach 7
// 通常プールでも出る 16 件は**入れない** (「買うしかない」と言うと嘘になる)。
console.log(String.fromCharCode(10) + "創生の樹からしか出ない MOD:");
{
  const tree = M.htcDropOnly();
  const n = Object.keys(tree).length;
  console.log("  文面 " + n + " 種 (178 MOD がティア違いで畳まれる)");
  if (n < 20) fail("創生の樹の表が " + n + " 種 (少なすぎる。生成器が走っているか)");
  // スペルのマナコスト効率は 6 ティアあり、全部プレフィックスで創生の樹キャスター専用
  const k = M.matchKey("#% increased Mana Cost Efficiency of Spells");
  const hit = tree[k];
  if (!hit) fail("スペルのマナコスト効率が表に無い");
  else {
    console.log("  スペルのマナコスト効率 → " + hit.tag + " / " + hit.side);
    if (hit.tag !== "genesis_tree_caster") fail("タグが " + hit.tag);
    if (hit.side !== "P") fail("側が " + hit.side + " (プレフィックスのはず)");
  }
  // 貼り付けから理由が出ること
  const NLC = String.fromCharCode(10);
  const RING = [
    "Rarity: Rare", "Rage Grip", "Mnemonic Ring", "--------",
    "Quality (Mana Modifiers): +40% (augmented)", "--------", "Item Level: 82", "--------",
    "8% increased maximum Mana (implicit)", "--------",
    "36% increased Mana Cost Efficiency of Spells (fractured)",
    "+235 to maximum Mana", "+29 to Intelligence", "+14% to all Elemental Resistances",
    "24% increased Cast Speed (desecrated)", "8% increased maximum Mana (crafted)",
  ].join(NLC);
  const got = M.targetsFor(data, M.parseJaItem(RING));
  if (got.dropOnly.length !== 1) fail("創生の樹と判定された行が " + got.dropOnly.length + " 件 (1 件のはず)");
  else {
    console.log("  貼り付けから: " + got.dropOnly[0].tagJa + " — " + got.dropOnly[0].text);
    if (got.dropOnly[0].tagJa !== "創生の樹 キャスター") fail("日本語のタグ名が " + got.dropOnly[0].tagJa);
  }
  // 普通に作れる MOD を巻き込んでいないこと
  const normal = M.matchKey("+# to maximum Mana");
  if (tree[normal]) fail("普通に作れる最大マナを創生の樹と判定している");
}

// ---- プレにもサフィにもある MOD の側 (2026-09-23) ----
// poe.ninja の指輪: レアリティはプレ版とサフィ版があり、文面だけだとサフィに寄ってサフィが 4 つになっていた
{
  const NL2 = String.fromCharCode(10);
  const r = M.parseJaItem(["Item Class: Rings", "Rarity: Rare", "Test Loop", "Prismatic Ring", "--------", "Item Level: 82", "--------",
    "Adds 17 to 25 Cold damage to Attacks", "19% increased Fire Damage", "17% increased Rarity of Items found",
    "+31 to Strength", "+37% to Fire Resistance", "+21% to Chaos Resistance"].join(NL2));
  const g = M.targetsFor(data, r);
  const sides = g.targets.map((t) => data.mods.get(t.modId)?.type);
  const nS = sides.filter((x) => x === "suffix").length, nP = sides.filter((x) => x === "prefix").length;
  console.log(String.fromCharCode(10) + "両側にある MOD: プレ " + nP + " / サフィ " + nS + " — " + g.targets.map((t) => t.modId.split("/")[1]).join(", "));
  if (nS > 3 || nP > 3) fail("片側が 3 つを超えている (プレ " + nP + " / サフィ " + nS + ")");
  if (!g.targets.some((t) => t.modId === "Rings/ItemFoundRarityIncreasePrefix")) fail("レアリティがプレ版に回っていない");
}

console.log(failed ? (String.fromCharCode(10) + "NG: " + failed + " 件") : (String.fromCharCode(10) + "全部 OK"));
process.exit(failed ? 1 : 0);
