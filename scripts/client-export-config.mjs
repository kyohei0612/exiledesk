/**
 * client-export-config.mjs
 * --------------------------------------------------------------
 * GGG クライアント (PoE2) から pathofexile-dat で書き出すテーブルの一覧と、
 * 書き出し先 (`data-cache/client-export/`) の読み込みヘルパー。
 *
 * 利用側:
 *   build-dicts-from-client.mjs   … 書き出し実行 + ExileDesk 辞書生成
 *   build-pob2jp-from-client.mjs  … 同梱 PoB (PoB2-JP) 用の公式日本語 CSV 生成
 *
 * テーブルは English / Japanese が同じ行 index で対応する (row-aligned)。
 * 列名は data-cache/client-export/schema.min.json で確認できる。
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..");
export const EXPORT_DIR = resolve(ROOT, "data-cache/client-export");
export const TRANSLATIONS = ["English", "Japanese"];

/** MOD 文言 (全言語) の原本。pathofexile-dat は "/" を "@" に置換して保存する。 */
export const CLIENT_FILES = ["Data/StatDescriptions/stat_descriptions.csd"];
export const CSD_PATH = resolve(EXPORT_DIR, "files", "Data@StatDescriptions@stat_descriptions.csd");

/** 書き出すテーブルと列 (外部キーは行 index の数値になる) */
export const CLIENT_TABLES = [
  // 装備ベース / カレンシー / ジェム / フラスコ等、全アイテムの表示名
  // ItemClass は ItemClasses への行 index (クラフト収支: ベース → 装備種別 → trade2 カテゴリ)
  // Tags はヴァール付加 (コラプト implicit) のプール判定用 (2026-09-13、build-vaal-enchants-from-client.mjs)。
  // 継承タグ (ring / weapon 等) は入っていないので、そちらは data-cache/base_items.json (RePoE 形式) から補う。
  { name: "BaseItemTypes", columns: ["Id", "Name", "ItemClass", "DropLevel", "Tags"] },
  { name: "Tags", columns: ["Id"] },
  // ユニーク名 (Wordlist=6)。JA テーブルでは Text2 が日本語名
  { name: "Words", columns: ["Wordlist", "Text", "Text2"] },
  { name: "FlavourText", columns: ["Text"] },
  // --- 2026-09-07 追加: 同梱 PoB の公式日本語化用 ---
  { name: "ActiveSkills", columns: ["DisplayedName", "Description"] },
  { name: "GemTags", columns: ["Name"] },
  { name: "PassiveSkills", columns: ["Name", "FlavourText"] },
  { name: "Ascendancy", columns: ["Name", "FlavourText"] },
  { name: "Characters", columns: ["Name"] },
  { name: "ItemClasses", columns: ["Id", "Name"] },
  // prefix / suffix の名前 ("Fulcent" / "of the Lion")
  { name: "Mods", columns: ["Id", "Name", "Domain", "GenerationType"] },
  // モンスター / ミニオン名 (PoB のスペクター一覧等)
  { name: "MonsterVarieties", columns: ["Name"] },
  // --- クラフト収支 (2026-09-07): エッセンス → 保証モッド の対応 ---
  // Essences.BaseItemType → BaseItemTypes 行、EssenceMods.Essence → Essences 行、
  // EssenceMods.Mod → Mods 行 (Id が mods-bundle のキー)、TargetItemCategory → EssenceTargetItemCategories 行
  { name: "Essences", columns: ["BaseItemType", "Tier", "Perfect"] },
  { name: "EssenceMods", columns: ["Essence", "TargetItemCategory", "Mod", "OutcomeMods", "OutcomeModWeights"] },
  { name: "EssenceTargetItemCategories", columns: ["Id", "ItemClasses"] },
  // レアリティごとの mod / prefix / suffix 上限 (クラフト収支の規則、2026-09-08)
  { name: "Rarity", columns: ["Id", "MinMods", "MaxMods", "MaxPrefix", "MaxSuffix"] },
  // カレンシー取引所 (Alva) の分類: カレンシーランキングのカテゴリをゲームと同じにする (2026-09-09)
  { name: "CurrencyExchange", columns: ["Item", "Category", "SubCategory", "EnabledInChallengeLeague"] },
  { name: "CurrencyExchangeCategories", columns: ["Id", "Name"] },
];

export async function loadTable(lang, name) {
  const p = resolve(EXPORT_DIR, "tables", lang, `${name}.json`);
  const j = JSON.parse(await readFile(p, "utf8"));
  return Array.isArray(j) ? j : j.rows || Object.values(j);
}

/** EN / JA を行対応で読み、長さ不一致なら throw */
export async function loadPair(name) {
  const en = await loadTable("English", name);
  const ja = await loadTable("Japanese", name);
  if (en.length !== ja.length) {
    throw new Error(`${name}: EN ${en.length} 行 / JA ${ja.length} 行で行数が合わない (再書き出しが必要)`);
  }
  return { en, ja };
}
