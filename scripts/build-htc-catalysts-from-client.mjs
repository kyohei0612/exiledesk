#!/usr/bin/env node
/**
 * build-htc-catalysts-from-client.mjs
 * --------------------------------------------------------------
 * カタリスト (指輪 / アミュレットの品質) の一覧と、「どの MOD を底上げするか」を作る (2026-09-22)。
 *
 * ## 何を解いているか
 * 装飾品の品質は**種類つき**です (ゲームの表示は「品質 (マナモッド): +20%」)。その種類に合う MOD
 * だけが倍率で押し上げられるので、表示されている数値は素の抽選値ではありません。
 * オーナーのアミュレットの「最大マナ +218」は T1 の上限 189 を超えていますが、
 * 182 × 1.2 = 218 で説明がつきます。
 *
 * ## どの MOD が対象かは MOD 自身のタグで決まる
 * クライアントの MOD は `implicit_tags` を持っていて、マナの MOD なら `["resource","mana"]`。
 * カタリストの種類 (`AlternateQualityTypes.Id` の `JewelleryQualityMana` 等) と**このタグが対応**します。
 *
 * **オーナーの実物で検算済み (2026-09-22、マナのカタリスト 20%)**:
 *   最大マナ +218 (T1 180-189)  mana タグあり → 底上げ ✓
 *   マナ 9%       (T1 7-8)      mana タグあり → 底上げ ✓
 *   スピリット +50 (T1 47-50)    mana タグ無し → 素のまま ✓
 *   スペル +3     (T1 3-3)      mana タグ無し → 素のまま ✓
 *   クリダメ 36%  (T1 35-39)    mana タグ無し → 素のまま ✓
 * 5 件とも一致。
 *
 * ## 表の列は信用しない
 * `AlternateQualityTypes.ModEffectStat` は書き出すと `level` や `off_hand_weapon_type` など
 * 明らかに別物が出ます (schema の列順が PoE2 と合っていない)。**使いません。**
 * 種類は `Id` から取り、タグとの対応はここに手で置いて、MOD 側に実在するか検算します。
 *
 * 出力: src/services/htc/catalysts.json
 * Usage: node scripts/build-htc-catalysts-from-client.mjs
 * --------------------------------------------------------------
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAT = resolve(ROOT, "data-cache/client-export-catalysts/tables");
const OUT = resolve(ROOT, "src/services/htc/catalysts.json");

const rd = async (lang, name, dir = CAT) => {
  const j = JSON.parse(await readFile(resolve(dir, lang, `${name}.json`), "utf8"));
  return Array.isArray(j) ? j : j.rows;
};

/**
 * `AlternateQualityTypes.Id` の末尾 -> MOD の `implicit_tags` に出るタグ。
 * **勘で足さないこと。**足したら「そのタグを持つ MOD が何件あるか」を見る (0 件なら間違い)。
 */
const TYPE_TAG = {
  Life: "life",
  Mana: "mana",
  Defence: "defences",
  Defences: "defences",
  Physical: "physical",
  Fire: "fire",
  Cold: "cold",
  Lightning: "lightning",
  Chaos: "chaos",
  Attack: "attack",
  Caster: "caster",
  Speed: "speed",
  Attribute: "attribute",
  Minion: "minion",
};

const main = async () => {
  const [A, AJa, B, BJa, MODS] = await Promise.all([
    rd("English", "AlternateQualityTypes"),
    rd("Japanese", "AlternateQualityTypes"),
    rd("English", "BaseItemTypes"),
    rd("Japanese", "BaseItemTypes"),
    readFile(resolve(ROOT, "data-cache/mods.en.json"), "utf8").then(JSON.parse),
  ]);

  // タグごとの MOD 数 (検算用)
  const tagCount = new Map();
  for (const m of Object.values(MODS)) {
    if (m.domain !== "item" && m.domain !== "desecrated") continue;
    for (const t of m.implicit_tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  }

  const catalysts = [];
  const bad = [];
  for (const r of A) {
    // 装飾品 (指輪 / アミュレット) 用だけ。`CurrencyJewelQuality*` はジュエル用で、このアプリは扱わない
    const m = /^JewelleryQuality(.+)$/.exec(r.Id || "");
    if (!m) continue;
    const tag = TYPE_TAG[m[1]];
    if (!tag) {
      bad.push(`${r.Id} … 対応するタグを決めていない`);
      continue;
    }
    const n = tagCount.get(tag) ?? 0;
    if (n === 0) {
      bad.push(`${r.Id} -> タグ "${tag}" を持つ MOD が 1 件も無い`);
      continue;
    }
    const item = r.Item != null ? B[r.Item] : null;
    if (!item?.Name) {
      bad.push(`${r.Id} … カタリストのアイテムが引けない`);
      continue;
    }
    catalysts.push({
      id: r.Id,
      tag,
      en: item.Name,
      ja: BJa[r.Item]?.Name ?? item.Name,
      /**
       * 装備の品質欄にそのまま出る文言 (`Description`)。**貼り付けから種類を読むのはこれ。**
       * カタリストの**アイテム名**ではありません (「神経のカタリスト」ではなく「品質 (マナモッド)」)。
       */
      label: { en: r.Description ?? "", ja: AJa[r._index]?.Description ?? r.Description ?? "" },
      /** そのタグを持つ MOD の数 (どれくらい効くかの目安) */
      mods: n,
    });
  }

  if (bad.length) {
    console.log(`NG: ${bad.length} 件`);
    for (const b of bad) console.log(`   ${b}`);
    process.exit(1);
  }

  await writeFile(
    OUT,
    JSON.stringify(
      {
        generated: new Date().toISOString().slice(0, 10),
        source: "GGG クライアント AlternateQualityTypes + BaseItemTypes。対象 MOD の判定は MOD 側の implicit_tags",
        catalysts,
      },
      null,
      1,
    ) + "\n",
    "utf8",
  );
  console.log(`カタリスト ${catalysts.length} 種`);
  for (const c of catalysts) console.log(`   ${c.ja.padEnd(22)} タグ ${c.tag.padEnd(12)} 対象 MOD ${c.mods} 件`);
  console.log(`-> ${OUT}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
