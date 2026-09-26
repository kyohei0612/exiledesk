#!/usr/bin/env node
/**
 * build-htc-price-keys-from-client.mjs
 * --------------------------------------------------------------
 * クラフトエンジンが要求する**値段のキー**と、ゲーム内の**英語名**の対応表を作る (2026-09-22)。
 *
 * エンジン (`optimizer/cost.ts` の `currencyKey`) は `transmute_perfect` / `desecrate_ancient` /
 * `OmenofLight` のような自前のキーで値段を引く。相場は poe2scout から**英語名**で引く。
 * その間をつなぐ表がここ。
 *
 * **名前は手で書かない。**キーと「どのアイテムか」の対応だけ手で決めて、名前はクライアントの
 * `BaseItemTypes` から取る。1 つでも引けなければ落ちる (リーグでアイテム名が変わったら気づける)。
 * オーメンは規則があるので機械で作る: **id = 英語名から空白を抜いた物** (45 件で確認済み)。
 *
 * 英語名は相場の引き当て用、日本語名は画面用 (EN/JA は行が対応するので同じ index から取る)。
 * 出力: src/services/htc/price-keys.json
 * Usage: node scripts/build-htc-price-keys-from-client.mjs
 * --------------------------------------------------------------
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TABLES = resolve(ROOT, "data-cache/client-export/tables/English");
const TABLES_JA = resolve(ROOT, "data-cache/client-export/tables/Japanese");
const OUT = resolve(ROOT, "src/services/htc/price-keys.json");

const rows = async (name, dir = TABLES) => {
  const j = JSON.parse(await readFile(resolve(dir, `${name}.json`), "utf8"));
  return Array.isArray(j) ? j : j.rows || Object.values(j);
};

/**
 * エンジンのキー -> クライアントの `BaseItemTypes.Id`。
 * **Id で指す**のが肝心で、名前で指すとリーグで表記が変わった時に黙って外れる。
 */
const CURRENCY = {
  transmute: "Metadata/Items/Currency/CurrencyUpgradeToMagic",
  transmute_greater: "Metadata/Items/Currency/CurrencyUpgradeToMagic2",
  transmute_perfect: "Metadata/Items/Currency/CurrencyUpgradeToMagic3",
  augment: "Metadata/Items/Currency/CurrencyAddModToMagic",
  augment_greater: "Metadata/Items/Currency/CurrencyAddModToMagic2",
  augment_perfect: "Metadata/Items/Currency/CurrencyAddModToMagic3",
  regal: "Metadata/Items/Currency/CurrencyUpgradeMagicToRare",
  regal_greater: "Metadata/Items/Currency/CurrencyUpgradeMagicToRare2",
  regal_perfect: "Metadata/Items/Currency/CurrencyUpgradeMagicToRare3",
  exalt: "Metadata/Items/Currency/CurrencyAddModToRare",
  exalt_greater: "Metadata/Items/Currency/CurrencyAddModToRare2",
  exalt_perfect: "Metadata/Items/Currency/CurrencyAddModToRare3",
  chaos: "Metadata/Items/Currency/CurrencyRerollRare",
  chaos_greater: "Metadata/Items/Currency/CurrencyRerollRare2",
  chaos_perfect: "Metadata/Items/Currency/CurrencyRerollRare3",
  alchemy: "Metadata/Items/Currency/CurrencyUpgradeToRare",
  annul: "Metadata/Items/Currency/CurrencyRemoveMod",
  vaal: "Metadata/Items/Currency/CurrencyCorrupt",
  divine: "Metadata/Items/Currency/CurrencyModValues",
  // 2026-09-22: レアの MOD 1 個をランダムに固定する。エンジンの通貨ではないが
  // ([[tree-decide.ts]] / [[self-fracture.ts]] が自前で扱う)、値段は同じ表から引きたいのでここに置く
  fracture: "Metadata/Items/Currency/CurrencyFractureRare",
};

/**
 * 冒涜 (Desecration) が食う骨。エンジンは装備の種別ごとに骨を選ぶ (`pricesForBase`)。
 * 武器 = 顎の骨 / 防具 = 肋骨 / 装飾品 = 鎖骨。`_ancient` は「MOD レベル 40 以上」の上位版。
 */
const BONES = {
  jawbone: "Metadata/Items/Currency/AbyssalBenchTicketWeapon",
  jawbone_ancient: "Metadata/Items/Currency/AbyssalBenchTicketWeaponHigh",
  rib: "Metadata/Items/Currency/AbyssalBenchTicketArmour",
  rib_ancient: "Metadata/Items/Currency/AbyssalBenchTicketArmourHigh",
  collarbone: "Metadata/Items/Currency/AbyssalBenchTicketJewellery",
  collarbone_ancient: "Metadata/Items/Currency/AbyssalBenchTicketJewelleryHigh",
};

/**
 * カタリスト (指輪 / 首飾りの品質)。キーは `catalyst_<タグ>` で、タグは
 * `src/services/htc/catalysts.json` (これもクライアント由来) から引く。
 *
 * **BaseItemTypes の Id とタグを直に結べない**ので (Id は `...QualityDefences` 複数形、タグは
 * `defences` だが `...QualityDefence` の物もある)、英語名で突き合わせる。どちらもクライアントから
 * 出ているので、手で名前を書いていることにはならない。宝石用の `CurrencyJewelQuality*` は別物なので
 * 拾わない (指輪には使えない)。
 */
const catalystKeys = (B, catalysts) => {
  const byName = new Map(catalysts.map((c) => [c.en, c.tag]));
  const out = {};
  const unmatched = [];
  for (const r of B) {
    if (!/^Metadata\/Items\/Currency\/CurrencyJewelleryQuality/.test(String(r.Id || ""))) continue;
    const tag = byName.get(r.Name);
    if (!tag) { unmatched.push(r.Name); continue; }
    out[`catalyst_${tag}`] = r.Id;
  }
  return { out, unmatched };
};

/** 最大品質を上げるエッセンス。指輪 / アミュレット専用 */
const EXTRA = {
  "essence:breach": "Metadata/Items/Currency/CurrencyCorruptedEssenceBreach",
};

const main = async () => {
  // EN / JA は行が対応する (同じ index)。公式の日本語名はここから取る
  const [B, BJa] = await Promise.all([rows("BaseItemTypes"), rows("BaseItemTypes", TABLES_JA)]);
  if (B.length !== BJa.length) {
    console.log(`NG: EN ${B.length} 行 / JA ${BJa.length} 行で行数が合わない (書き出し直しが要る)`);
    process.exit(1);
  }
  const byId = new Map(B.map((r, i) => [r.Id, { ...r, NameJa: BJa[i]?.Name ?? null }]));

  const missing = [];
  const resolveAll = (table) => {
    const out = {};
    for (const [key, id] of Object.entries(table)) {
      const row = byId.get(id);
      if (!row?.Name) {
        missing.push(`${key} -> ${id}`);
        continue;
      }
      out[key] = { en: row.Name, ja: row.NameJa ?? row.Name };
    }
    return out;
  };

  const catalystsJson = JSON.parse(await readFile(resolve(ROOT, "src/services/htc/catalysts.json"), "utf8"));
  const { out: CATALYSTS, unmatched } = catalystKeys(B, catalystsJson.catalysts);
  if (unmatched.length) {
    console.log(`NG: カタリスト ${unmatched.length} 件がタグに結べない (catalysts.json を作り直す)`);
    for (const u of unmatched) console.log(`   ${u}`);
    process.exit(1);
  }
  const currency = resolveAll({ ...CURRENCY, ...EXTRA, ...CATALYSTS });
  const bones = resolveAll(BONES);

  // オーメンは規則で作る: id = 英語名から空白を抜いた物
  const omens = {};
  for (let i = 0; i < B.length; i++) {
    const r = B[i];
    if (!r.Name || !/^Omen of /.test(r.Name)) continue;
    omens[r.Name.replace(/\s+/g, "")] = { en: r.Name, ja: BJa[i]?.Name ?? r.Name };
    continue;
  }

  if (missing.length) {
    console.log(`NG: クライアントで引けなかったアイテム ${missing.length} 件`);
    for (const m of missing) console.log(`   ${m}`);
    process.exit(1);
  }

  const payload = {
    generated: new Date().toISOString().slice(0, 10),
    source: "GGG クライアント BaseItemTypes (data-cache/client-export)。キーは poe2htc の optimizer/cost.ts",
    currency,
    bones,
    omens,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1) + "\n", "utf8");
  console.log(`通貨 ${Object.keys(currency).length} (うちカタリスト ${Object.keys(CATALYSTS).length}) / 骨 ${Object.keys(bones).length} / オーメン ${Object.keys(omens).length}`);
  console.log(`-> ${OUT}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
